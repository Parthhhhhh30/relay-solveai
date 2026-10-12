import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createDatabase } from '../src/db.js';
process.env.NODE_ENV='test';
process.env.RELAY_DB_FILE=':memory:';
const {createHandler}=await import('../src/server.js');

async function request(handler,method,url,data,extra={}) {
 const req=Readable.from(data===undefined?[]:[Buffer.from(typeof data==='string'?data:JSON.stringify(data))]);
 Object.assign(req,{method,url,headers:{host:'localhost','content-type':'application/json',...extra}});
 const out={};
 await handler(req,{writeHead(status,headers){out.status=status;out.headers=headers;},end(body){out.body=body;}});
 if(out.headers['Content-Type'].startsWith('application/json'))out.body=JSON.parse(out.body);
 return out;
}
function fixture(fn){const db=createDatabase(':memory:');const handler=createHandler({mode:'local',withDatabase:async(options,run)=>run(db)});return Promise.resolve(fn(handler,db)).finally(()=>db.close());}

test('API: action invalidates evidence and blocks package/CSV until fresh approvals',()=>fixture(async handler=>{
 assert.equal((await request(handler,'GET','/api/state')).body.questions[0].health,'approved');
 const denied=await request(handler,'POST','/api/people/1/lifecycle',{action:'activate'});
 assert.equal(denied.status,400);
 assert.equal((await request(handler,'POST','/api/access/2',{note:'Synthetic grant checked'})).status,200);
 const pkg=await request(handler,'GET','/api/reviews/1/package');
 assert.equal(pkg.body.approved.length,0);assert.equal(pkg.body.blocked[0].reason,'source_changed');
 assert.equal((await request(handler,'POST','/api/evidence/1/approve',{reviewer:'Synthetic Reviewer'})).status,400);
 assert.equal((await request(handler,'PATCH','/api/evidence/1',{reference:'DEMO-REVISED-002',owner:'Operations',review_due:'2027-12-31'})).status,200);
 assert.equal((await request(handler,'POST','/api/evidence/1/approve',{reviewer:'Synthetic Owner'})).status,200);
 assert.equal((await request(handler,'GET','/api/reviews/1/package')).body.approved.length,0);
 assert.equal((await request(handler,'POST','/api/questions/1/approve',{reviewer:'Synthetic Reviewer'})).status,200);
 const csv=await request(handler,'GET','/api/reviews/1/export');
 assert.equal(csv.status,200);assert.match(csv.body,/DEMO-REVISED-002/);assert.equal(csv.headers['X-Review-Blocked-Count'],'4');assert.equal(csv.headers['Cache-Control'],'no-store');
}));
test('API rejects invalid bodies, foreign origins, unsupported suffix routes and methods',()=>fixture(async handler=>{
 for(const raw of ['null','[]','"text"','{'])assert.equal((await request(handler,'POST','/api/tasks',raw)).status,400);
 assert.equal((await request(handler,'POST','/api/tasks',{}, {origin:'https://foreign.example'})).status,403);
 assert.equal((await request(handler,'POST','/api/tasks',{}, {'content-type':'text/plain'})).status,415);
 assert.equal((await request(handler,'POST','/api/access/2/ignored',{note:'Synthetic note'})).status,404);
 assert.equal((await request(handler,'DELETE','/api/state')).status,405);
 assert.equal((await request(handler,'GET','/api/state')).body.access.find(a=>a.id===2).state,'pending');
}));
test('static UI assets and HEAD requests are served with security headers',()=>fixture(async handler=>{
 const page=await request(handler,'GET','/');assert.equal(page.status,200);assert.match(page.body.toString(),/storageLabel/);assert.ok(page.headers['Content-Security-Policy']);
 assert.equal((await request(handler,'HEAD','/')).body,undefined);
 assert.equal((await request(handler,'GET','/not-a-file')).status,404);
}));
test('API reports storage failure instead of premature mutation success',async()=>{
 const db=createDatabase(':memory:');
 const handler=createHandler({mode:'postgres',async withDatabase(options,run){run(db);throw Error('Synthetic durable commit failure');}});
 try{const out=await request(handler,'POST','/api/access/2',{note:'Synthetic note'});assert.equal(out.status,500);assert.equal(out.body.ok,undefined);}finally{db.close();}
});
test('shared demo reset requires an operator credential before opening storage',async()=>{
 const handler=createHandler({mode:'postgres',withDatabase:()=>assert.fail('Unauthorised reset must not open storage')});
 assert.equal((await request(handler,'POST','/api/reset',{})).status,403);
});

test('Vercel pre-parsed request bodies reach business logic',()=>fixture(async handler=>{
 const req=Readable.from([]);
 Object.assign(req,{method:'POST',url:'/api/access/2',headers:{host:'localhost','content-type':'application/json'},body:{note:'Synthetic hosted grant'}});
 let status;
 await handler(req,{writeHead(value){status=value;},end(){}});
 assert.equal(status,200);
 assert.equal((await request(handler,'GET','/api/state')).body.access.find(a=>a.id===2).state,'granted');
}));
