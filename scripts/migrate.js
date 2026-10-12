import pg from 'pg';
import { createDatabase } from '../src/db.js';
import { snapshot } from '../src/storage.js';

if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
const client=await pool.connect();
const db=createDatabase(':memory:');
try {
  await client.query('BEGIN');
  await client.query(`CREATE TABLE IF NOT EXISTS relay_workspace (
    id INTEGER PRIMARY KEY CHECK (id=1), state JSONB NOT NULL,
    window_started TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mutation_count INTEGER NOT NULL DEFAULT 0, last_reset TIMESTAMPTZ
  )`);
  await client.query('INSERT INTO relay_workspace(id,state) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING',[JSON.stringify(snapshot(db))]);
  await client.query('COMMIT');
  console.log('Workspace schema ready; existing records preserved.');
} catch(error) {await client.query('ROLLBACK');throw error;}
finally {db.close();client.release();await pool.end();}
