import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const schema = `
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS people (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL,
 start_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('joining','active','leaving','offboarded')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS access_grants (
 id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL REFERENCES people(id), system TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','granted','revocation_pending','revoked')),
 note TEXT NOT NULL DEFAULT '', changed_at TEXT NOT NULL, UNIQUE(person_id,system)
);
CREATE TABLE IF NOT EXISTS devices (
 id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL UNIQUE REFERENCES people(id),
 device TEXT NOT NULL, asset_tag TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK(state IN ('requested','assigned','return_pending','returned')),
 note TEXT NOT NULL DEFAULT '', changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS controls (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, owner TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence (
 id INTEGER PRIMARY KEY AUTOINCREMENT, control_id INTEGER NOT NULL REFERENCES controls(id),
 title TEXT NOT NULL, reference TEXT NOT NULL, owner TEXT NOT NULL, review_due TEXT NOT NULL,
 approved INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, source_dirty INTEGER NOT NULL DEFAULT 0, approved_by TEXT NOT NULL DEFAULT '',
 approved_at TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
 id INTEGER PRIMARY KEY AUTOINCREMENT, customer TEXT NOT NULL, deadline TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, review_id INTEGER NOT NULL REFERENCES reviews(id), question TEXT NOT NULL,
 control_id INTEGER REFERENCES controls(id), evidence_id INTEGER REFERENCES evidence(id),
 draft TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','mapped','approved')),
 reviewer TEXT NOT NULL DEFAULT '', approved_at TEXT NOT NULL DEFAULT '', evidence_version INTEGER,
 note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ops_tasks (
 id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL CHECK(category IN ('GTM','Finance','Contracts','Hiring','Office','Other')),
 owner TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','in_progress','done')),
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, completed_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity TEXT NOT NULL,
 entity_id INTEGER, detail TEXT NOT NULL, at TEXT NOT NULL
);
`;
const now = () => new Date().toISOString();
export const dayOffset = (offset) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0,10);
};

export function createDatabase(filename = process.env.RELAY_DB_FILE || path.resolve('data/relay.sqlite'), { initialize = true } = {}) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(schema);
  // An older local demo may predate source-derived evidence invalidation.
  const evidenceColumns=db.prepare('PRAGMA table_info(evidence)').all().map(c=>c.name);
  if(!evidenceColumns.includes('source_dirty')) db.exec('ALTER TABLE evidence ADD COLUMN source_dirty INTEGER NOT NULL DEFAULT 0');
  if (initialize && db.prepare('SELECT count(*) AS n FROM controls').get().n === 0) seed(db);
  return db;
}

export function audit(db, action, entity, entityId, detail) {
  db.prepare('INSERT INTO audit(action,entity,entity_id,detail,at) VALUES(?,?,?,?,?)').run(action,entity,entityId,detail,now());
}

export function seed(db, { inTransaction = false } = {}) {
  if (!inTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    const controls = [
      ['AC-01','Joiner and leaver access register','Operations'],
      ['AC-02','Periodic access review','IT Lead'],
      ['SEC-03','Security awareness onboarding','Security Lead'],
      ['SEC-04','Incident response process','Security Lead'],
      ['VEN-05','Supplier and tool inventory','Operations']
    ];
    for (const c of controls) db.prepare('INSERT INTO controls(code,title,owner) VALUES(?,?,?)').run(...c);
    const people = [
      ['Ava Morgan','ava@example.test','Forward Deployed Engineer',dayOffset(3),'joining'],
      ['Noah Patel','noah@example.test','Product Engineer',dayOffset(-60),'leaving'],
      ['Mia Turner','mia@example.test','Operations Generalist',dayOffset(-80),'active']
    ];
    for (const p of people) db.prepare('INSERT INTO people(name,email,role,start_date,status,created_at) VALUES(?,?,?,?,?,?)').run(...p,now());
    const grants = [
      [1,'Google Workspace','granted'],[1,'GitHub','pending'],[1,'Linear','pending'],[1,'1Password','granted'],
      [2,'Google Workspace','revocation_pending'],[2,'GitHub','revocation_pending'],[2,'1Password','revoked'],
      [3,'Google Workspace','granted'],[3,'Linear','granted'],[3,'1Password','granted']
    ];
    for (const [p,s,v] of grants) db.prepare('INSERT INTO access_grants(person_id,system,state,changed_at) VALUES(?,?,?,?)').run(p,s,v,now());
    const devices = [ [1,'MacBook Air','', 'requested'],[2,'MacBook Pro','IT-013','return_pending'],[3,'MacBook Air','IT-021','assigned'] ];
    for (const d of devices) db.prepare('INSERT INTO devices(person_id,device,asset_tag,state,changed_at) VALUES(?,?,?,?,?)').run(...d,now());
    const evidence = [
      [1,'Access lifecycle register extract','DEMO-ACCESS-REGISTER-001','Operations',dayOffset(30),1,2,'Operations Lead',now(),'Synthetic register export only; not independently verified'],
      [2,'Quarterly access review minutes','DEMO-Q3-ACCESS-REVIEW','IT Lead',dayOffset(-8),1,1,'IT Lead',now(),'Review due date has passed'],
      [3,'Security onboarding checklist','DEMO-TRAINING-CHECKLIST','Security Lead',dayOffset(20),0,1,'','','Draft waiting for approval'],
      [4,'Incident response playbook reference','DEMO-IR-PLAYBOOK','Security Lead',dayOffset(45),1,3,'Security Lead',now(),'Synthetic document reference'],
      [5,'Approved SaaS vendor register','DEMO-VENDOR-REGISTER','Operations',dayOffset(12),1,2,'Operations Lead',now(),'Synthetic inventory reference']
    ];
    for (const e of evidence) db.prepare(`INSERT INTO evidence(control_id,title,reference,owner,review_due,approved,version,approved_by,approved_at,note,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(...e,now());
    db.prepare('INSERT INTO reviews(customer,deadline,status,created_at) VALUES(?,?,?,?)').run('Northstar Financial',dayOffset(5),'open',now());
    const questions = [
      [1,'Describe how access is tracked for new joiners and departing employees.',1,1,'Access requests and removals are tracked in an operator-maintained register; completion requires recorded action.', 'approved','Operations Lead',now(),2,'Synthetic wording only; check actual process before disclosure'],
      [1,'How frequently are employee permissions reviewed?',2,2,'Permissions are reviewed periodically, with named IT ownership.','mapped','','',null,'Evidence is overdue'],
      [1,'What security training is required during onboarding?',3,3,'New starters complete a security onboarding checklist.','mapped','','',null,'Awaiting evidence approval'],
      [1,'Is there a documented incident response process?',4,4,'An incident response playbook is maintained by the security owner.','mapped','','',null,'Requires named reviewer before use'],
      [1,'How are third-party SaaS vendors inventoried?',5,5,'Tool and supplier entries are maintained in a vendor register.','mapped','','',null,'Requires review']
    ];
    for (const q of questions) db.prepare(`INSERT INTO questions(review_id,question,control_id,evidence_id,draft,status,reviewer,approved_at,evidence_version,note,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(...q,now());
    const tasks = [
      ['Confirm roundtable venue and attendee requirements','GTM','Operations',dayOffset(2),'open','Enterprise buyer roundtable: dietary requirements, AV, guest confirmations'],
      ['Reconcile September supplier invoice','Finance','Finance',dayOffset(-2),'in_progress','Match invoice to approved PO and receipt; do not mark paid without verification'],
      ['Chase unsigned pilot NDA','Contracts','Operations',dayOffset(1),'open','Keep status distinct from legal approval'],
      ['Book first-round candidate interviews','Hiring','People Ops',dayOffset(3),'open','Time-zone confirmation needed'],
      ['Complete visitor badge register','Office','Operations',dayOffset(6),'done','Synthetic example']
    ];
    for (const t of tasks) db.prepare('INSERT INTO ops_tasks(title,category,owner,due_date,status,note,created_at) VALUES(?,?,?,?,?,?,?)').run(...t,now());
    audit(db,'DEMO_SEEDED','system',null,'Synthetic sample records created; no real enterprise data or certifications');
    if (!inTransaction) db.exec('COMMIT');
  } catch (err) {if (!inTransaction) db.exec('ROLLBACK');throw err;}
}
