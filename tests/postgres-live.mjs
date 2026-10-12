import assert from 'node:assert/strict';
import pg from 'pg';
import { createDatabase } from '../src/db.js';
import { snapshot, PostgresStorage } from '../src/storage.js';
import { buildState, changeAccess, addTask, changePerson } from '../src/service.js';

// Isolated schema: never reset or overwrite the configured demo workspace.
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
const schema = `relay_qa_${Date.now()}`;
const admin = new pg.Pool({connectionString:process.env.DATABASE_URL});
const pools = [0,1].map(()=>new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`}));
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  await pools[0].query('CREATE TABLE relay_workspace (id INTEGER PRIMARY KEY, state JSONB NOT NULL, window_started TIMESTAMPTZ NOT NULL DEFAULT NOW(), mutation_count INTEGER NOT NULL DEFAULT 0, last_reset TIMESTAMPTZ)');
  const db=createDatabase(':memory:');
  await pools[0].query('INSERT INTO relay_workspace(id,state) VALUES(1,$1)',[JSON.stringify(snapshot(db))]);db.close();
  const stores=pools.map(p=>new PostgresStorage(p));
  await Promise.all(stores.map((s,i)=>s.withDatabase({mutation:true},db=>changeAccess(db,i+2,{note:'Synthetic live Postgres QA'}))));
  const state=await stores[1].withDatabase({},buildState);
  assert.equal(state.access.find(a=>a.id===2).state,'granted');
  assert.equal(state.access.find(a=>a.id===3).state,'granted');
  assert.equal(state.questions[0].health,'source_changed');
  await assert.rejects(stores[0].withDatabase({mutation:true},db=>changePerson(db,1,'activate')),/device|asset/i);
  // Deferred constraint fails during COMMIT, after the adapter's UPDATE.
  await pools[0].query('CREATE TABLE commit_guard (id INTEGER UNIQUE DEFERRABLE INITIALLY DEFERRED)');
  await assert.rejects(stores[0].withDatabase({mutation:true},async db=>{
    addTask(db,{title:'Must roll back',category:'Other',owner:'QA',due_date:'2027-01-01'});
    // Use the same connected transaction through a temporary pool wrapper below.
    throw Error('Synthetic callback failure');
  }),/Synthetic callback failure/);
  const client=await pools[0].connect();
  const wrapped=new PostgresStorage({connect:async()=>({query:async(sql,args)=>{
    if(sql==='COMMIT')await client.query('INSERT INTO commit_guard VALUES(1),(1)');
    return client.query(sql,args);
  },release(){}})});
  try {await assert.rejects(wrapped.withDatabase({mutation:true},db=>addTask(db,{title:'Must fail commit',category:'Other',owner:'QA',due_date:'2027-01-01'})),/duplicate key/);}finally{client.release();}
  await pools[1].end();
  const fresh=new pg.Pool({connectionString:process.env.DATABASE_URL,options:`-c search_path=${schema}`});
  try {
    const persisted=await new PostgresStorage(fresh).withDatabase({},buildState);
    assert.equal(persisted.tasks.length,state.tasks.length);
    assert.equal(persisted.access.find(a=>a.id===2).state,'granted');
    assert.equal((await fresh.query('SELECT mutation_count FROM relay_workspace')).rows[0].mutation_count,2);
    await fresh.query('UPDATE relay_workspace SET mutation_count=60');
    await assert.rejects(new PostgresStorage(fresh).withDatabase({mutation:true},()=>assert.fail()),e=>e.status===429);
  } finally {await fresh.end();}
  console.log('LIVE POSTGRES PASS: independent pools, concurrent writes, invalidation, denied transition, callback/commit rollback, reconnect durability, shared limit');
} finally {
  await Promise.all(pools.map(p=>p.ended?Promise.resolve():p.end()));
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
