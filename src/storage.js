import { createDatabase } from './db.js';
import { InputError } from './service.js';

// A deliberately small, single-workspace demo. Postgres owns the durable state;
// SQLite is a request-scoped rules engine, never a hosted persistence fallback.
const tables=['people','access_grants','devices','controls','evidence','reviews','questions','ops_tasks','audit'];
export function snapshot(db) {
  return {version:1,tables:Object.fromEntries([...tables,'sqlite_sequence'].map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]))};
}
export function restore(value) {
  if(value?.version!==1||!value.tables)throw Error('Unsupported workspace schema');
  const db=createDatabase(':memory:',{initialize:false});
  try {
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    for(const table of [...tables,'sqlite_sequence']) {
      const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
      const rows=value.tables[table];
      if(!Array.isArray(rows))throw Error('Incomplete workspace snapshot');
      db.exec(`DELETE FROM ${table}`);
      for(const row of rows) {
        if(columns.some(c=>!Object.hasOwn(row,c)))throw Error('Incomplete workspace row');
        db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
      }
    }
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Invalid workspace references');
    db.exec('COMMIT; PRAGMA foreign_keys=ON');
    return db;
  } catch(error) { db.close();throw error; }
}

export class PostgresStorage {
  constructor(pool) { this.pool=pool; }
  async withDatabase({mutation=false,reset=false},fn) {
    const client=await this.pool.connect();
    let db;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const {rows}=await client.query('SELECT state, window_started, mutation_count, last_reset FROM relay_workspace WHERE id=1 FOR UPDATE');
      if(!rows.length)throw Error('Workspace migration has not been run');
      const record=rows[0],now=Date.now();
      const sameWindow=now-new Date(record.window_started).getTime()<60_000;
      const count=sameWindow?record.mutation_count:0;
      if(mutation&&count>=60)throw new InputError('Shared demo write limit reached. Try again in a minute.',429);
      if(reset&&record.last_reset&&now-new Date(record.last_reset).getTime()<300_000)throw new InputError('Shared demo can only be reset every five minutes.',429);
      db=restore(record.state);
      const result=await fn(db);
      if(mutation) {
        const state=snapshot(db);
        if(Buffer.byteLength(JSON.stringify(state))>2_000_000)throw new InputError('Shared demo is full. Ask the operator to reset it.',409);
        await client.query('UPDATE relay_workspace SET state=$1::jsonb, window_started=$2, mutation_count=$3, last_reset=$4 WHERE id=1',
          [JSON.stringify(state),sameWindow?record.window_started:new Date(now),count+1,reset?new Date(now):record.last_reset]);
      }
      await client.query('COMMIT');
      return result;
    } catch(error) { await client.query('ROLLBACK').catch(()=>{});throw error; }
    finally { db?.close();client.release(); }
  }
}

export function createStorage(env=process.env) {
  if(env.VERCEL&&!env.DATABASE_URL)throw Error('Hosted RELAY requires durable DATABASE_URL; local SQLite is disabled on Vercel');
  if(!env.DATABASE_URL) {
    const db=createDatabase();
    return {mode:'local',withDatabase:async(options,fn)=>fn(db)};
  }
  let storagePromise;
  return {mode:'postgres',async withDatabase(options,fn) {
    storagePromise??=import('pg').then(({default:pg})=>new PostgresStorage(new pg.Pool({connectionString:env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:10000})));
    const storage=await storagePromise;
    return storage.withDatabase(options,fn);
  }};
}
