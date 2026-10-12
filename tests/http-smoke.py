"""Real HTTP smoke test; uses stdlib only. Run: python tests/http-smoke.py"""
import os, json, tempfile, subprocess, urllib.request, urllib.error, time
from pathlib import Path
root=Path(__file__).resolve().parents[1]

def request(method,path,data=None):
    b=None if data is None else json.dumps(data).encode()
    r=urllib.request.Request('http://127.0.0.1:39471'+path, data=b,method=method,headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(r,timeout=3) as f:
            raw=f.read();return f.status,json.loads(raw) if 'application/json' in f.headers.get('Content-Type','') else raw.decode()
    except urllib.error.HTTPError as e:
        return e.code,json.loads(e.read())

with tempfile.TemporaryDirectory(prefix='relay-test-') as dir:
    env={**os.environ,'PORT':'39471','RELAY_DB_FILE':str(Path(dir)/'database.sqlite')}
    proc=subprocess.Popen(['node','src/server.js'],cwd=root,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    try:
        for i in range(50):
            try:
                code,state=request('GET','/api/state')
                if code==200:break
            except Exception: time.sleep(.1)
        else:
            proc.terminate()
            _,stderr=proc.communicate(timeout=3)
            raise RuntimeError('Server did not become ready: '+stderr.decode(errors='replace'))
        assert len(state['people'])==3
        assert state['questions'][0]['health']=='approved'
        code,html=request('GET','/')
        assert code==200 and 'RELAY' in html
        code,out=request('POST','/api/people',{'name':'API Test','email':'api@example.test','role':'Engineer','start_date':'2026-11-10','systems':['GitHub'],'device':'MacBook Air'})
        assert code==200,out
        pid=out['id']
        code,s=request('GET','/api/state')
        p=next(p for p in s['people'] if p['id']==pid)
        assert p['open_checks']==2
        assert next(e for e in s['evidence'] if e['id']==1)['health']=='source_changed'
        assert next(q for q in s['questions'] if q['id']==1)['health']=='source_changed'
        code,err=request('POST',f'/api/people/{pid}/lifecycle',{'action':'activate'})
        assert code==400 and 'mandatory access' in err['error']
        a=next(a for a in s['access'] if a['person_id']==pid)
        code,changed=request('POST',f'/api/access/{a["id"]}',{'note':'Operator saw the provisioned account'})
        assert code==200,changed
        code,s=request('GET','/api/state')
        d=next(d for d in s['devices'] if d['person_id']==pid)
        code,_=request('POST',f'/api/devices/{d["id"]}',{'note':'Asset handed over','asset_tag':'SIM-500'})
        assert code==200
        code,_=request('POST',f'/api/people/{pid}/lifecycle',{'action':'activate'})
        assert code==200
        code,pkg=request('GET','/api/reviews/1/package')
        assert code==200 and len(pkg['approved'])==0
        code,err=request('POST','/api/evidence/1/approve',{'reviewer':'Ops Lead'})
        assert code==400 and 'Source has changed' in err['error']
        code,_=request('PATCH','/api/evidence/1',{'reference':'UPDATED-ACCESS-SNAPSHOT','owner':'Operations','review_due':'2027-12-31','note':'Fresh synthetic extract'})
        assert code==200
        code,_=request('POST','/api/evidence/1/approve',{'reviewer':'Ops Lead'})
        assert code==200
        code,_=request('POST','/api/questions/1/approve',{'reviewer':'Security Lead'})
        assert code==200
        code,pkg=request('GET','/api/reviews/1/package')
        assert code==200 and len(pkg['approved'])==1
        code,csv=request('GET','/api/reviews/1/export')
        assert code==200 and 'UPDATED-ACCESS-SNAPSHOT' in csv and 'Quarterly' not in csv
        code,_=request('POST',f'/api/people/{pid}/lifecycle',{'action':'start_offboarding'})
        assert code==200
        code,err=request('POST',f'/api/people/{pid}/lifecycle',{'action':'complete_offboarding'})
        assert code==400
        code,s=request('GET','/api/state')
        a=next(a for a in s['access'] if a['person_id']==pid)
        d=next(d for d in s['devices'] if d['person_id']==pid)
        assert request('POST',f'/api/access/{a["id"]}',{'note':'Verified actual revocation in synthetic system'})[0]==200
        assert request('POST',f'/api/devices/{d["id"]}',{'note':'Returned laptop verified'})[0]==200
        assert request('POST',f'/api/people/{pid}/lifecycle',{'action':'complete_offboarding'})[0]==200
        print('HTTP SMOKE: PASS — HTML, seeded state, create joiner, readiness gate, access/device changes, source invalidation, evidence revision, reviewer approval, safe CSV export, offboarding gate and closure')
    finally:
        proc.terminate()
        try:proc.wait(timeout=3)
        except subprocess.TimeoutExpired:proc.kill()
