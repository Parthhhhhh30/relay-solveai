import { audit, dayOffset, seed } from './db.js';
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0,10);
export class InputError extends Error { constructor(message, status=400) { super(message);this.status=status; } }
const ensure = (condition, message, status=400) => {if(!condition)throw new InputError(message,status);};
const required = (input,key,max=250) => {
  const v=input?.[key];ensure(typeof v==='string' && v.trim().length>0 && v.trim().length<=max,`${key} must be 1–${max} characters`);return v.trim();
};
const optional = (input,key,max=2000) => {
  const v=input?.[key]??'';ensure(typeof v==='string' && v.length<=max,`${key} must be text up to ${max} characters`);return v.trim();
};
const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const requireDate = (o,k) => {const d=required(o,k,10);ensure(isoDate(d),`${k} must be YYYY-MM-DD`);return d;};
const entity=(db,table,id)=>{ensure(Number.isSafeInteger(Number(id))&&Number(id)>0,'Invalid record identifier');const row=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(Number(id));ensure(row,`${table} record not found`,404);return row;};
const validName = input=>{const v=required(input,'name',100);ensure(!/[<>]/.test(v),'Name contains invalid characters');return v;};
const output = (stmt)=>stmt.all();
const approvalRecorded=(name,at)=>typeof name==='string'&&name.trim()&&typeof at==='string'&&at.trim()&&!Number.isNaN(Date.parse(at))&&Date.parse(at)<=Date.now();
export const evidenceState=(e, date=today())=>e.source_dirty===1?'source_changed':e.approved!==1||!approvalRecorded(e.approved_by,e.approved_at)||!e.reference?.trim()||!isoDate(e.review_due)?'unapproved':e.review_due<date?'expired':'current';
export function questionState(q, evidence, date=today()) {
  if(!q.control_id||!q.evidence_id) return 'unmapped';
  if(!evidence||evidence.control_id!==q.control_id) return 'mismatch';
  if(evidenceState(evidence,date)!=='current') return evidenceState(evidence,date);
  if(!q.draft.trim()) return 'missing_answer';
  if(q.status==='approved'&&q.evidence_version===evidence.version&&approvalRecorded(q.reviewer,q.approved_at))return 'approved';
  if(q.status==='approved') return 'needs_reapproval';
  return 'ready_for_review';
}
export function buildState(db) {
  const people=output(db.prepare(`SELECT * FROM people ORDER BY id DESC`));
  const access=output(db.prepare(`SELECT * FROM access_grants ORDER BY person_id,system`));
  const devices=output(db.prepare(`SELECT * FROM devices ORDER BY person_id`));
  const controls=output(db.prepare(`SELECT * FROM controls ORDER BY code`));
  const evidence=output(db.prepare(`SELECT * FROM evidence ORDER BY id DESC`)).map(e=>({...e,health:evidenceState(e)}));
  const evidenceMap=new Map(evidence.map(e=>[e.id,e]));
  const reviews=output(db.prepare(`SELECT * FROM reviews ORDER BY id DESC`));
  const questions=output(db.prepare(`SELECT * FROM questions ORDER BY review_id,id`)).map(q=>({...q,health:questionState(q,evidenceMap.get(q.evidence_id))}));
  const tasks=output(db.prepare(`SELECT * FROM ops_tasks ORDER BY (status='done'),due_date,id`));
  const history=output(db.prepare(`SELECT * FROM audit ORDER BY id DESC LIMIT 60`));
  const peopleWithReadiness=people.map(p=>{
    const grants=access.filter(a=>a.person_id===p.id),device=devices.find(d=>d.person_id===p.id);
    const blocked=p.status==='joining' ? grants.filter(a=>a.state!=='granted').length+(device?.state==='assigned'?0:1)
      :p.status==='leaving'?grants.filter(a=>a.state!=='revoked').length+(device?.state==='returned'?0:1):0;
    return {...p,open_checks:blocked,access_total:grants.length,device_status:device?.state??'missing'};
  });
  const signals=[
    ...peopleWithReadiness.filter(p=>p.open_checks>0).map(p=>({kind:'person',id:p.id,level:'attention',title:p.name+' · '+p.open_checks+' outstanding checks',subtitle:p.status==='leaving'?'Offboarding not verified':'Joiner setup incomplete',target:'people'})),
    ...evidence.filter(e=>e.health!=='current').map(e=>({kind:'evidence',id:e.id,level:['expired','source_changed'].includes(e.health)?'critical':'attention',title:e.title,subtitle:e.health==='expired'?'Evidence review overdue':e.health==='source_changed'?'Access register changed; source evidence must be updated':'Evidence awaiting owner approval',target:'evidence'})),
    ...tasks.filter(t=>t.status!=='done'&&t.due_date<today()).map(t=>({kind:'task',id:t.id,level:'critical',title:t.title,subtitle:`Overdue · ${t.category}`,target:'operations'})),
    ...questions.filter(q=>q.health!=='approved').slice(0,8).map(q=>({kind:'question',id:q.id,level:'attention',title:q.question,subtitle:q.health.replaceAll('_',' '),target:'reviews'}))
  ];
  return {today:today(),people:peopleWithReadiness,access,devices,controls,evidence,reviews,questions,tasks,history,signals,
   stats:{openChecks:peopleWithReadiness.reduce((n,p)=>n+p.open_checks,0),approvedAnswers:questions.filter(q=>q.health==='approved').length,
    totalAnswers:questions.length,evidenceAttention:evidence.filter(e=>e.health!=='current').length,
    overdueTasks:tasks.filter(t=>t.status!=='done'&&t.due_date<today()).length}};
}
function tx(db,fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
const log=(db,action,table,id,detail)=>audit(db,action,table,id,detail);
// AC-01 evidence is a source snapshot, not a live integration. Any change to the
// underlying access register makes its previously reviewed snapshot stale.
// Operators must update the reference and obtain approval again before disclosure.
function invalidateAccessSnapshot(db, reason) {
  const ctl=db.prepare('SELECT id FROM controls WHERE code=?').get('AC-01');
  if(!ctl)return;
  const affected=db.prepare('UPDATE evidence SET approved=0,source_dirty=1,approved_by=?,approved_at=?,version=version+1,updated_at=? WHERE control_id=? AND source_dirty=0').run('','',now(),ctl.id).changes;
  if(affected) log(db,'ACCESS_EVIDENCE_STALE','control',ctl.id,reason+' · evidence snapshots require new references and review');
}


export function createPerson(db,data) {
  const name=validName(data),email=required(data,'email',180),role=required(data,'role',140),date=requireDate(data,'start_date');
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Valid email required');
  const systems=Array.isArray(data.systems)? data.systems : [];
  ensure(systems.length>0&&systems.length<=15,'Choose between 1 and 15 systems');
  ensure(systems.every(s=>typeof s==='string'&&s.trim()&&s.length<=90),'Invalid system name');
  const normalizedSystems=[...new Set(systems.map(s=>s.trim()))];
  const device=required(data,'device',100);
  return tx(db,()=>{
    const id=Number(db.prepare(`INSERT INTO people(name,email,role,start_date,status,created_at) VALUES(?,?,?,?,?,?)`).run(name,email,role,date,'joining',now()).lastInsertRowid);
    for(const system of normalizedSystems)db.prepare(`INSERT INTO access_grants(person_id,system,state,changed_at) VALUES(?,?,?,?)`).run(id,system,'pending',now());
    db.prepare(`INSERT INTO devices(person_id,device,state,changed_at) VALUES(?,?,?,?)`).run(id,device,'requested',now());
    invalidateAccessSnapshot(db,'New joiner in access register');
    log(db,'JOINER_CREATED','person',id,`${name}; ${normalizedSystems.length} systems and device requested`);
    return {id};
  });
}
export function changeAccess(db,id,data) {
  const a=entity(db,'access_grants',id),p=entity(db,'people',a.person_id),note=required(data,'note',300);
  ensure(p.status!=='offboarded','Cannot change access after offboarding');
  let next;
  if (p.status==='leaving') { ensure(a.state==='revocation_pending','Only pending revocations can be confirmed');next='revoked'; }
  else {ensure(a.state==='pending','Only pending access can be marked granted');next='granted';}
  return tx(db,()=>{
    db.prepare(`UPDATE access_grants SET state=?,note=?,changed_at=? WHERE id=?`).run(next,note,now(),id);
    invalidateAccessSnapshot(db,'Account access status changed');
    log(db,next==='granted'?'ACCESS_RECORDED':'ACCESS_REVOKED','access',Number(id),`${p.name}: ${a.system}; operator record: ${note}`);return {id:Number(id),state:next};
  });
}
export function changeDevice(db,id,data) {
  const d=entity(db,'devices',id),p=entity(db,'people',d.person_id),note=required(data,'note',300);
  const next=p.status==='leaving'?'returned':'assigned';
  ensure(p.status!=='offboarded','Person already offboarded');
  ensure(d.state===(p.status==='leaving'?'return_pending':'requested'),'Device not in actionable state');
  const tag=optional(data,'asset_tag',70);
  if(next==='assigned')ensure(tag,'Asset tag required for assignment');
  return tx(db,()=>{
    db.prepare(`UPDATE devices SET state=?,asset_tag=?,note=?,changed_at=? WHERE id=?`).run(next,next==='assigned'?tag:d.asset_tag,note,now(),id);
    invalidateAccessSnapshot(db,'Device custody state changed');
    log(db,next==='returned'?'DEVICE_RETURN_RECORDED':'DEVICE_ASSIGNED','device',Number(id),`${p.name}: ${d.device}; asset ${tag||d.asset_tag}; ${note}`);return {id:Number(id),state:next};
  });
}
export function changePerson(db,id,action) {
  const p=entity(db,'people',id);
  return tx(db,()=>{
    if(action==='activate') {
      ensure(p.status==='joining','Only joiners can be activated');
      ensure(db.prepare(`SELECT count(*) AS n FROM access_grants WHERE person_id=? AND state!='granted'`).get(id).n===0,'Cannot activate: mandatory access not recorded');
      ensure(db.prepare(`SELECT count(*) AS n FROM devices WHERE person_id=? AND state='assigned'`).get(id).n===1,'Cannot activate: device not assigned');
      db.prepare(`UPDATE people SET status='active' WHERE id=?`).run(id);log(db,'JOINER_READY','person',Number(id),p.name+' readiness completed');
    } else if(action==='start_offboarding') {
      ensure(p.status==='active'||p.status==='joining','Person is not in an active lifecycle');
      db.prepare(`UPDATE people SET status='leaving' WHERE id=?`).run(id);
      db.prepare(`UPDATE access_grants SET state='revocation_pending',changed_at=? WHERE person_id=? AND state='granted'`).run(now(),id);
      db.prepare(`UPDATE access_grants SET state='revoked',note='Never provisioned; closed during offboarding',changed_at=? WHERE person_id=? AND state='pending'`).run(now(),id);
      db.prepare(`UPDATE devices SET state=CASE WHEN state='assigned' THEN 'return_pending' ELSE 'returned' END,changed_at=? WHERE person_id=?`).run(now(),id);
      log(db,'OFFBOARDING_STARTED','person',Number(id),p.name+' · recorded access now pending revocation. No external services changed.');
    } else if(action==='complete_offboarding') {
      ensure(p.status==='leaving','Offboarding not in progress');
      ensure(db.prepare(`SELECT count(*) AS n FROM access_grants WHERE person_id=? AND state!='revoked'`).get(id).n===0,'Cannot close: access still active or pending');
      ensure(db.prepare(`SELECT count(*) AS n FROM devices WHERE person_id=? AND state!='returned'`).get(id).n===0,'Cannot close: device return not recorded');
      db.prepare(`UPDATE people SET status='offboarded' WHERE id=?`).run(id);log(db,'OFFBOARDING_COMPLETED','person',Number(id),p.name+' · all registered actions verified by operator');
    } else throw new InputError('Unsupported lifecycle action');
    invalidateAccessSnapshot(db,'Person lifecycle status changed');
    return {id:Number(id),action};
  });
}
export function addEvidence(db,data) {
  const control=entity(db,'controls',Number(data.control_id)),title=required(data,'title',180),reference=required(data,'reference',200),owner=required(data,'owner',100),due=requireDate(data,'review_due'),note=optional(data,'note');
  return tx(db,()=>{
    const id=Number(db.prepare(`INSERT INTO evidence(control_id,title,reference,owner,review_due,note,updated_at) VALUES(?,?,?,?,?,?,?)`).run(control.id,title,reference,owner,due,note,now()).lastInsertRowid);
    log(db,'EVIDENCE_ADDED','evidence',id,`${control.code}: ${title} · pending approval`);return {id};
  });
}
export function editEvidence(db,id,data) {
  const e=entity(db,'evidence',id),due=requireDate(data,'review_due'),reference=required(data,'reference',200),note=optional(data,'note'),owner=required(data,'owner',100);
  ensure(e.source_dirty!==1||reference!==e.reference,'Source has changed: provide a revised evidence reference');
  return tx(db,()=>{
    db.prepare(`UPDATE evidence SET review_due=?,reference=?,note=?,owner=?,approved=0,source_dirty=0,approved_by='',approved_at='',version=version+1,updated_at=? WHERE id=?`).run(due,reference,note,owner,now(),id);
    log(db,'EVIDENCE_CHANGED','evidence',Number(id),`${e.title}: revision requires fresh approval; previous questionnaire approvals invalidate`);return {id:Number(id)};
  });
}
export function approveEvidence(db,id,data) {
  const e=entity(db,'evidence',id),reviewer=required(data,'reviewer',100);
  ensure(e.source_dirty!==1,'Source has changed: revise the evidence reference first, then request new approval.');
  ensure(e.review_due>=today(),'Cannot approve expired evidence. Update review date after actual review.');
  return tx(db,()=>{
    db.prepare(`UPDATE evidence SET approved=1,approved_by=?,approved_at=?,updated_at=? WHERE id=?`).run(reviewer,now(),now(),id);
    log(db,'EVIDENCE_APPROVED','evidence',Number(id),`${e.title}; approval recorded as ${reviewer} (identity not verified)`);return {id:Number(id)};
  });
}
export function addReview(db,data) {
  const customer=required(data,'customer',150),deadline=requireDate(data,'deadline');
  return tx(db,()=>{const id=Number(db.prepare(`INSERT INTO reviews(customer,deadline,status,created_at) VALUES(?,?,?,?)`).run(customer,deadline,'open',now()).lastInsertRowid);log(db,'REVIEW_CREATED','review',id,customer);return {id};});
}
function parseCsv(raw) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<raw.length;i++) {
    const c=raw[i];if(c==='"') {if(quoted&&raw[i+1]==='"') {cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted) {row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted) {if(c==='\r'&&raw[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  ensure(!quoted,'Unclosed quoted CSV value');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows;
}
export function importQuestions(db,reviewId,data) {
  entity(db,'reviews',reviewId);
  const raw=required(data,'csv',120000);const rows=parseCsv(raw);
  ensure(rows.length>=1&&rows.length<=501,'Import 1 to 500 questions');
  const header=rows[0][0].trim().toLowerCase()==='question';
  const entries=(header?rows.slice(1):rows).map(r=>r[0]?.trim()||'');
  ensure(entries.length>=1&&entries.length<=500,'Import 1 to 500 questions');
  ensure(entries.every(q=>q.length>0&&q.length<=1200),'Each question must be 1–1200 characters');
  return tx(db,()=>{for(const q of entries)db.prepare(`INSERT INTO questions(review_id,question,status,updated_at) VALUES(?,?,?,?)`).run(reviewId,q,'open',now());
    log(db,'QUESTIONS_IMPORTED','review',Number(reviewId),`${entries.length} questions imported; no answers generated`);return {count:entries.length};});
}
export function editQuestion(db,id,data) {
  const q=entity(db,'questions',id);const controlId=data.control_id===''||data.control_id==null?null:Number(data.control_id),evidenceId=data.evidence_id===''||data.evidence_id==null?null:Number(data.evidence_id);
  if(controlId!==null)entity(db,'controls',controlId);if(evidenceId!==null)entity(db,'evidence',evidenceId);
  if(evidenceId!==null&&controlId!==null) ensure(entity(db,'evidence',evidenceId).control_id===controlId,'Evidence must belong to selected control');
  const draft=optional(data,'draft',4000),note=optional(data,'note',1000);
  return tx(db,()=>{
    db.prepare(`UPDATE questions SET control_id=?,evidence_id=?,draft=?,note=?,status=?,reviewer='',approved_at='',evidence_version=NULL,updated_at=? WHERE id=?`).run(controlId,evidenceId,draft,note,(controlId&&evidenceId?'mapped':'open'),now(),id);
    log(db,'QUESTION_EDITED','question',Number(id),`${q.question.slice(0,80)}; prior approval cleared`);return {id:Number(id)};
  });
}
export function approveQuestion(db,id,data) {
  const q=entity(db,'questions',id),reviewer=required(data,'reviewer',100);
  const evidence=q.evidence_id?entity(db,'evidence',q.evidence_id):null;
  ensure(questionState({...q,status:'mapped'},evidence)==='ready_for_review','Question needs a current approved matching evidence record and non-empty draft');
  return tx(db,()=>{
    db.prepare(`UPDATE questions SET status='approved',reviewer=?,approved_at=?,evidence_version=?,updated_at=? WHERE id=?`).run(reviewer,now(),evidence.version,now(),id);
    log(db,'QUESTION_APPROVED','question',Number(id),`Recorded reviewer ${reviewer}; linked to evidence ${evidence.id} version ${evidence.version} (identity not authenticated)`);return {id:Number(id)};
  });
}
export function exportReview(db,id) {
  const review=entity(db,'reviews',id);
  const evidence=db.prepare(`SELECT * FROM evidence`).all();const ev=new Map(evidence.map(e=>[e.id,e]));
  const questions=db.prepare(`SELECT * FROM questions WHERE review_id=? ORDER BY id`).all(id);
  const approved=questions.filter(q=>questionState(q,ev.get(q.evidence_id))==='approved');
  const blocked=questions.filter(q=>questionState(q,ev.get(q.evidence_id))!=='approved');
  return {review,approved:approved.map(q=>({...q,evidence:ev.get(q.evidence_id)})),blocked:blocked.map(q=>({id:q.id,question:q.question,reason:questionState(q,ev.get(q.evidence_id))}))};
}
export function addTask(db,data) {
  const title=required(data,'title',180),category=required(data,'category',30),owner=required(data,'owner',100),due=requireDate(data,'due_date'),note=optional(data,'note');
  ensure(['GTM','Finance','Contracts','Hiring','Office','Other'].includes(category),'Unsupported workstream category');
  return tx(db,()=>{const id=Number(db.prepare(`INSERT INTO ops_tasks(title,category,owner,due_date,status,note,created_at) VALUES(?,?,?,?,?,?,?)`).run(title,category,owner,due,'open',note,now()).lastInsertRowid);log(db,'WORK_CREATED','task',id,`${category}: ${title}`);return {id};});
}
export function updateTask(db,id,data) {
  const task=entity(db,'ops_tasks',id),status=required(data,'status',20),note=required(data,'note',1000);
  ensure(['open','in_progress','done'].includes(status),'Unsupported status');
  return tx(db,()=>{
    db.prepare(`UPDATE ops_tasks SET status=?,note=?,completed_at=? WHERE id=?`).run(status,note,status==='done'?now():'',id);
    log(db,'WORK_UPDATED','task',Number(id),`${task.title}: ${task.status} → ${status}; ${note}`);return {id:Number(id)};
  });
}
export function reset(db) {
  const names=['audit','questions','reviews','evidence','controls','devices','access_grants','people','ops_tasks'];
  return tx(db,()=>{for(const n of names)db.exec(`DELETE FROM ${n}`);db.exec("DELETE FROM sqlite_sequence");seed(db,{inTransaction:true});return {reset:true};});
}
export { today, dayOffset };
