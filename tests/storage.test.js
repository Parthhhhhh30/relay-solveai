import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { snapshot,restore,PostgresStorage,createStorage } from '../src/storage.js';
import { buildState,changeAccess,exportReview,addTask,reset } from '../src/service.js';

function seededSnapshot(){const db=createDatabase(':memory:');try{return snapshot(db);}finally{db.close();}}

// Test double models commit/rollback and a shared row lock across separate pools.
function backend(){
 const shared={state:seededSnapshot(),window_started:new Date(),mutation_count:0,last_reset:null};
 let tail=Promise.resolve();
 return {shared,failCommit:false,pool(){const backend=this;return {async connect(){
   let releaseLock,pending;
   return {async query(sql,args){
     if(sql==='BEGIN')return {rows:[]};
     if(sql.includes('FOR UPDATE')){const previous=tail;tail=new Promise(r=>releaseLock=r);await previous;pending=structuredClone(shared);return {rows:[structuredClone(pending)]};}
     if(sql.startsWith('UPDATE')){pending={state:JSON.parse(args[0]),window_started:args[1],mutation_count:args[2],last_reset:args[3]};}
     if(sql==='COMMIT'){if(backend.failCommit)throw Error('Commit failed');Object.assign(shared,pending);releaseLock?.();releaseLock=null;}
     if(sql==='ROLLBACK'){releaseLock?.();releaseLock=null;}
     return {rows:[]};
   },release(){releaseLock?.();}};
 }}}};
}

test('workspace round trip preserves approval invalidation and sequence IDs',()=>{
 const db=restore(seededSnapshot());
 changeAccess(db,2,{note:'Synthetic grant recorded'});
 const next=restore(snapshot(db));db.close();
 try{assert.equal(exportReview(next,1).approved.length,0);assert.equal(buildState(next).evidence.find(e=>e.id===1).health,'source_changed');assert.equal(addTask(next,{title:'Synthetic task',category:'Other',owner:'Ops',due_date:'2027-01-01'}).id,6);}finally{next.close();}
});
test('invalid or future snapshots fail closed',()=>{
 assert.throws(()=>restore({version:2,tables:{}}),/Unsupported/);
 const value=seededSnapshot();value.tables.questions[0].evidence_id=9999;
 assert.throws(()=>restore(value),/Invalid workspace references/);
 delete value.tables.people;assert.throws(()=>restore(value),/Incomplete/);
});
test('hosted configuration refuses ephemeral SQLite fallback',()=>assert.throws(()=>createStorage({VERCEL:'1'}),/requires durable/));
test('separate application instances see persisted writes and serialize concurrent updates',async()=>{
 const b=backend(),first=new PostgresStorage(b.pool()),second=new PostgresStorage(b.pool());
 await Promise.all([first.withDatabase({mutation:true},db=>changeAccess(db,2,{note:'Synthetic GitHub grant'})),second.withDatabase({mutation:true},db=>changeAccess(db,3,{note:'Synthetic Linear grant'}))]);
 const state=await new PostgresStorage(b.pool()).withDatabase({},buildState);
 assert.equal(state.access.find(a=>a.id===2).state,'granted');assert.equal(state.access.find(a=>a.id===3).state,'granted');
 assert.equal(state.questions[0].health,'source_changed');assert.equal(b.shared.mutation_count,2);
});
test('failed durable commit never reports success or retains access changes',async()=>{
 const b=backend(),store=new PostgresStorage(b.pool());b.failCommit=true;
 await assert.rejects(store.withDatabase({mutation:true},db=>changeAccess(db,2,{note:'Synthetic grant'})),/Commit failed/);
 b.failCommit=false;
 const state=await store.withDatabase({},buildState);
 assert.equal(state.access.find(a=>a.id===2).state,'pending');assert.equal(state.questions[0].health,'approved');
});
test('denied business transition rolls back durable workspace',async()=>{
 const b=backend(),store=new PostgresStorage(b.pool());
 await assert.rejects(store.withDatabase({mutation:true},db=>changeAccess(db,1,{note:'Duplicate grant'})),/Only pending/);
 assert.equal(b.shared.mutation_count,0);
});
test('shared write limit and reset cooldown persist across instances',async()=>{
 const b=backend(),store=new PostgresStorage(b.pool());b.shared.mutation_count=60;
 await assert.rejects(store.withDatabase({mutation:true},()=>assert.fail('Must not run')),e=>e.status===429);
 b.shared.window_started=new Date(Date.now()-61_000);
 await store.withDatabase({mutation:true,reset:true},reset);
 assert.equal(b.shared.mutation_count,1);
 await assert.rejects(new PostgresStorage(b.pool()).withDatabase({mutation:true,reset:true},reset),e=>e.status===429);
});
