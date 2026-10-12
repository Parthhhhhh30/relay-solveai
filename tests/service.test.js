import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { buildState, createPerson, changeAccess, changeDevice, changePerson, evidenceState, editEvidence, approveEvidence, editQuestion, approveQuestion, addEvidence, addReview, importQuestions, exportReview, addTask, updateTask, reset, InputError } from '../src/service.js';

function fixture(fn){const db=createDatabase(':memory:');try{return fn(db);}finally{db.close();}}
const errorMessage = regex => err => err instanceof InputError && regex.test(err.message);

test('seeded demo has cross-domain records with no unearned readiness',()=>fixture(db=>{
 const s=buildState(db);
 assert.ok(s.people.length>=3);
 assert.ok(s.reviews.length>=1);
 assert.equal(s.questions[0].health,'approved');
 assert.ok(s.signals.some(x=>x.kind==='person'));
 assert.ok(s.signals.some(x=>x.kind==='evidence'));
 assert.equal(s.people.find(x=>x.name==='Ava Morgan').open_checks,3);
}));

test('joiner: missing access or device blocks activation; all evidence allows it',()=>fixture(db=>{
 const id=createPerson(db,{name:'Pat Example',email:'pat@example.test',role:'Engineer',start_date:'2026-11-12',systems:['GitHub','Google Workspace'],device:'MacBook Air'}).id;
 assert.throws(()=>changePerson(db,id,'activate'),errorMessage(/mandatory access/));
 const grants=db.prepare('SELECT * FROM access_grants WHERE person_id=? ORDER BY id').all(id);
 for(const g of grants)changeAccess(db,g.id,{note:'Provisioning verified in the synthetic identity provider'});
 assert.throws(()=>changePerson(db,id,'activate'),errorMessage(/device not assigned/));
 const device=db.prepare('SELECT * FROM devices WHERE person_id=?').get(id);
 assert.throws(()=>changeDevice(db,device.id,{note:'Observed device handover'}),errorMessage(/Asset tag/));
 changeDevice(db,device.id,{asset_tag:'SIM-100',note:'Observed handover'});
 changePerson(db,id,'activate');
 const s=buildState(db).people.find(x=>x.id===id);
 assert.equal(s.status,'active');assert.equal(s.open_checks,0);
 assert.throws(()=>changeAccess(db,grants[0].id,{note:'Double provision'}),errorMessage(/Only pending access/));
}));

test('offboarding: every active grant and physical device must be recorded returned',()=>fixture(db=>{
 const id=3;
 changePerson(db,id,'start_offboarding');
 assert.throws(()=>changePerson(db,id,'complete_offboarding'),errorMessage(/access still active/));
 for(const g of db.prepare('SELECT * FROM access_grants WHERE person_id=?').all(id))changeAccess(db,g.id,{note:'External console checked: access removed'});
 assert.throws(()=>changePerson(db,id,'complete_offboarding'),errorMessage(/device return/));
 const device=db.prepare('SELECT * FROM devices WHERE person_id=?').get(id);
 changeDevice(db,device.id,{note:'Asset received at office'});
 changePerson(db,id,'complete_offboarding');
 assert.equal(db.prepare('SELECT status FROM people WHERE id=?').get(id).status,'offboarded');
 assert.ok(db.prepare("SELECT * FROM audit WHERE action='OFFBOARDING_COMPLETED'").get());
}));

test('security question: no approval without approved, current, matching evidence',()=>fixture(db=>{
 assert.throws(()=>approveQuestion(db,2,{reviewer:'Security Reviewer'}),errorMessage(/needs a current approved/));
 assert.throws(()=>approveQuestion(db,3,{reviewer:'Security Reviewer'}),errorMessage(/needs a current approved/));
 assert.throws(()=>editQuestion(db,4,{control_id:1,evidence_id:4,draft:'Statement'}),errorMessage(/Evidence must belong/));
 approveQuestion(db,4,{reviewer:'Security Reviewer'});
 assert.equal(exportReview(db,1).approved.length,2);
}));

test('updating evidence invalidates approved questionnaire response, including after fresh evidence approval',()=>fixture(db=>{
 assert.equal(exportReview(db,1).approved.length,1);
 const original=db.prepare('SELECT * FROM evidence WHERE id=1').get();
 editEvidence(db,1,{review_due:'2026-12-30',reference:'NEW-VERSION',owner:original.owner,note:'Revised after control process change'});
 assert.equal(exportReview(db,1).approved.length,0);
 assert.equal(buildState(db).questions[0].health,'unapproved');
 approveEvidence(db,1,{reviewer:'Lead'});
 assert.equal(buildState(db).questions[0].health,'needs_reapproval');
 assert.equal(exportReview(db,1).approved.length,0);
 approveQuestion(db,1,{reviewer:'New reviewer'});
 assert.equal(exportReview(db,1).approved.length,1);
}));

test('CSV import correctly handles quoted commas/newlines, blocks malformed CSV',()=>fixture(db=>{
 const rid=addReview(db,{customer:'Acme Example',deadline:'2026-12-15'}).id;
 assert.deepEqual(importQuestions(db,rid,{csv:'question\n"Do you monitor access, including vendors?"\n"How are incidents\nlogged?"'}),{count:2});
 assert.equal(db.prepare('SELECT count(*) as n FROM questions WHERE review_id=?').get(rid).n,2);
 assert.match(db.prepare('SELECT question FROM questions WHERE review_id=? ORDER BY id DESC').get(rid).question,/incidents\nlogged/);
 assert.throws(()=>importQuestions(db,rid,{csv:'"Unclosed'}),errorMessage(/Unclosed/));
}));

test('operational work requires an operator note, preserves source and audit record',()=>fixture(db=>{
 const tid=addTask(db,{title:'Confirm executive dinner venue',category:'GTM',owner:'Ops',due_date:'2026-11-12',note:'Awaiting confirmation'}).id;
 assert.throws(()=>updateTask(db,tid,{status:'done',note:''}),errorMessage(/note must/));
 updateTask(db,tid,{status:'done',note:'Venue and guest count confirmed with coordinator'});
 assert.equal(db.prepare('SELECT status FROM ops_tasks WHERE id=?').get(tid).status,'done');
 assert.ok(db.prepare("SELECT * FROM audit WHERE entity='task' AND entity_id=? AND action='WORK_UPDATED'").get(tid));
}));

test('reset restores seed state, not partially deleted data',()=>fixture(db=>{
 createPerson(db,{name:'Taylor Example',email:'t@example.test',role:'Support',start_date:'2026-11-12',systems:['Slack'],device:'Laptop'});
 assert.equal(buildState(db).people.length,4);
 reset(db);assert.equal(buildState(db).people.length,3);
 assert.equal(buildState(db).questions[0].health,'approved');
}));

test('evidence state is strictly based on review date and approval',()=>{
 const approval={approved_by:'Synthetic Reviewer',approved_at:'2026-10-01T12:00:00Z',reference:'DEMO-REF'};
 assert.equal(evidenceState({...approval,approved:0,review_due:'2026-12-31'},'2026-11-01'),'unapproved');
 assert.equal(evidenceState({...approval,approved:1,review_due:'2026-10-31'},'2026-11-01'),'expired');
 assert.equal(evidenceState({...approval,approved:1,review_due:'2026-11-01'},'2026-11-01'),'current');
 assert.equal(evidenceState({...approval,approved:1,review_due:'invalid'},'2026-11-01'),'unapproved');
 assert.equal(evidenceState({...approval,approved:1,approved_at:'2099-01-01T12:00:00Z',review_due:'2026-11-01'},'2026-11-01'),'unapproved');
});

test('operational access change revokes validity of linked security response until fresh source and human review',()=>fixture(db=>{
 const first=exportReview(db,1);
 assert.equal(first.approved.length,1);
 const a=db.prepare('SELECT * FROM access_grants WHERE state=? LIMIT 1').get('pending');
 changeAccess(db,a.id,{note:'Confirmed provisioned on synthetic service console'});
 const after=buildState(db);
 assert.equal(after.evidence.find(e=>e.id===1).health,'source_changed');
 assert.equal(exportReview(db,1).approved.length,0);
 assert.throws(()=>approveEvidence(db,1,{reviewer:'Lead'}),errorMessage(/Source has changed/));
 editEvidence(db,1,{reference:'UPDATED-REGISTER-EXPORT-002',owner:'Operations',review_due:'2027-12-31',note:'Regenerated after access change'});
 approveEvidence(db,1,{reviewer:'Operations Lead'});
 assert.equal(exportReview(db,1).approved.length,0);
 approveQuestion(db,1,{reviewer:'Security Lead'});
 assert.equal(exportReview(db,1).approved.length,1);
}));

test('API data preserves literal user text for frontend HTML escaping',()=>fixture(db=>{
 const id=addTask(db,{title:'<img src=x onerror=alert(1)>',category:'Other',owner:'Ops',due_date:'2026-11-12',note:'Demo'}).id;
 const t=buildState(db).tasks.find(t=>t.id===id);
 assert.match(t.title, /<img/);
 // Raw JSON is an intentional transport; frontend template insertion is HTML-escaped.
}));

test('stale access evidence cannot be refreshed without a revised reference',()=>fixture(db=>{
 changeAccess(db,2,{note:'Synthetic grant confirmed'});
 const original=db.prepare('SELECT * FROM evidence WHERE id=1').get();
 assert.throws(()=>editEvidence(db,1,{reference:original.reference,owner:original.owner,review_due:'2027-12-31'}),errorMessage(/revised evidence reference/));
 assert.equal(exportReview(db,1).approved.length,0);
}));

test('system names are deduplicated after trimming',()=>fixture(db=>{
 const {id}=createPerson(db,{name:'Synthetic Example',email:'synthetic@example.test',role:'Engineer',start_date:'2027-01-01',systems:['GitHub',' GitHub '],device:'Laptop'});
 assert.equal(db.prepare('SELECT count(*) AS n FROM access_grants WHERE person_id=?').get(id).n,1);
}));

test('reset rolls back deletions when reseeding fails',()=>fixture(db=>{
 db.exec("CREATE TRIGGER fail_reset BEFORE INSERT ON controls BEGIN SELECT RAISE(ABORT, 'simulated seed failure'); END");
 const before=buildState(db);
 assert.throws(()=>reset(db),/simulated seed failure/);
 assert.deepEqual(buildState(db),before);
}));

test('approval flags without recorded reviewer, timestamp or source reference cannot export',()=>fixture(db=>{
 db.prepare("UPDATE evidence SET approved_by='' WHERE id=1").run();
 assert.equal(exportReview(db,1).approved.length,0);
 db.prepare("UPDATE evidence SET approved_by='Synthetic Reviewer',approved_at='invalid' WHERE id=1").run();
 assert.equal(exportReview(db,1).approved.length,0);
 db.prepare("UPDATE evidence SET approved_at=?,reference='' WHERE id=1").run(new Date().toISOString());
 assert.equal(exportReview(db,1).approved.length,0);
 db.prepare("UPDATE evidence SET reference='DEMO-REF' WHERE id=1").run();
 db.prepare("UPDATE questions SET approved_at='' WHERE id=1").run();
 assert.equal(exportReview(db,1).approved.length,0);
}));
