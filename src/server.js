import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage } from './storage.js';
import { timingSafeEqual } from 'node:crypto';
import { InputError,buildState,createPerson,changeAccess,changeDevice,changePerson,addEvidence,editEvidence,approveEvidence,addReview,importQuestions,editQuestion,approveQuestion,exportReview,addTask,updateTask,reset } from './service.js';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staticDir=path.join(base,'public');
const appVersion='1.0.0';
const json=(status,payload)=>({status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(payload)});
const send=(res,out)=>{res.writeHead(out.status,out.headers);res.end(out.body);};
const escCsv=(v)=>{const raw=String(v??'');const safe=/^[\s]*[=+@-]/.test(raw)?"'"+raw:raw;return `"${safe.replaceAll('\"','\"\"')}"`;};
const readBody=async(req)=>{
  // Vercel may have already consumed and parsed the IncomingMessage stream.
  if(req.body!==undefined) {
    let value=req.body;
    if(Buffer.isBuffer(value)||typeof value==='string') {
      try{value=JSON.parse(value.toString());}catch{throw new InputError('Invalid JSON body');}
    }
    if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('JSON object required');
    if(Buffer.byteLength(JSON.stringify(value))>150_000)throw new InputError('Request too large',413);
    return value;
  }
  const chunks=[];let len=0;
  for await(const chunk of req){len+=chunk.length;if(len>150_000)throw new InputError('Request too large',413);chunks.push(chunk);}
  let value;
  try{value=len?JSON.parse(Buffer.concat(chunks).toString('utf8')):{}}catch{throw new InputError('Invalid JSON body');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('JSON object required');
  return value;
};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
export function createHandler(storage) {
async function handler(req,res){
  try{
    const url=new URL(req.url,'http://localhost');const seg=url.pathname.split('/').filter(Boolean);
    if(url.pathname.startsWith('/api/')){
      const mutation=['POST','PATCH'].includes(req.method);
      if(mutation) {
        const origin=req.headers.origin;
        const expectedHost=process.env.VERCEL?req.headers['x-forwarded-host']||req.headers.host:req.headers.host;
        if(origin) {
          let originHost;try{originHost=new URL(origin).host;}catch{throw new InputError('Invalid request origin',403);}
          if(originHost!==expectedHost)throw new InputError('Cross-origin writes are blocked',403);
        }
        if(!req.headers['content-type']?.startsWith('application/json'))throw new InputError('JSON content type required',415);
      }
      const isReset=req.method==='POST'&&url.pathname==='/api/reset';
      if(isReset&&storage.mode==='postgres') {
        const expected=process.env.RELAY_RESET_TOKEN;
        const supplied=req.headers['x-relay-reset-token'];
        if(!expected)throw new InputError('Shared demo reset is disabled until an operator credential is configured',403);
        if(typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))throw new InputError('Operator reset credential required',403);
      }
      const data=mutation?await readBody(req):{};
      const out=await storage.withDatabase({mutation,reset:isReset},db=>api(req,db,url,seg,data));
      return send(res,out);
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return send(res,json(405,{error:'Method not allowed'}));
    let file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    if(!['index.html','app.js','style.css','favicon.svg'].includes(file))return send(res,json(404,{error:'Not found'}));
    const content=await fs.readFile(path.join(staticDir,file));
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
    if(req.method==='HEAD')res.end();else res.end(content);
  }catch(err){const status=err instanceof InputError?err.status:500; if(status===500)console.error('Server error',err);send(res,json(status,{error:status===500?'Storage or server unavailable. No success was confirmed.':err.message}));}
}
function api(req,db,url,seg,data){
      if(req.method==='GET'&&url.pathname==='/api/state')return json(200,{...buildState(db),appVersion,storageMode:storage.mode,resetProtected:storage.mode==='postgres'});
      if(req.method==='GET'&&seg.length===4&&seg[1]==='reviews'&&seg[3]==='export'){
        const pkg=exportReview(db,Number(seg[2]));
        // A partial pack is usable for internal preparation, but never silently represents completion.
        const csv=[['question','approved_answer','control','evidence_reference','evidence_version','reviewed_by','reviewed_at'].map(escCsv).join(','),
          ...pkg.approved.map(q=>[q.question,q.draft,q.control_id,q.evidence.reference,q.evidence_version,q.reviewer,q.approved_at].map(escCsv).join(','))].join('\r\n');
        return {status:200,headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="review-${pkg.review.id}-approved-only.csv"`,
           'X-Review-Blocked-Count':String(pkg.blocked.length),'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'},body:csv};
      }
      if(req.method==='GET'&&seg.length===4&&seg[1]==='reviews'&&seg[3]==='package')return json(200,exportReview(db,Number(seg[2])));
      if(req.method==='POST'&&url.pathname==='/api/reset')return json(200,reset(db));
      if(req.method!=='POST'&&req.method!=='PATCH')return json(405,{error:'Unsupported method'});

      let result;
      if(req.method==='POST'&&url.pathname==='/api/people')result=createPerson(db,data);
      else if(req.method==='POST'&&seg.length===4&&seg[1]==='people'&&seg[3]==='lifecycle')result=changePerson(db,Number(seg[2]),data.action);
      else if(req.method==='POST'&&seg.length===3&&seg[1]==='access'&&seg[2])result=changeAccess(db,Number(seg[2]),data);
      else if(req.method==='POST'&&seg.length===3&&seg[1]==='devices'&&seg[2])result=changeDevice(db,Number(seg[2]),data);
      else if(req.method==='POST'&&url.pathname==='/api/evidence')result=addEvidence(db,data);
      else if(req.method==='PATCH'&&seg.length===3&&seg[1]==='evidence'&&seg[2])result=editEvidence(db,Number(seg[2]),data);
      else if(req.method==='POST'&&seg.length===4&&seg[1]==='evidence'&&seg[3]==='approve')result=approveEvidence(db,Number(seg[2]),data);
      else if(req.method==='POST'&&url.pathname==='/api/reviews')result=addReview(db,data);
      else if(req.method==='POST'&&seg.length===4&&seg[1]==='reviews'&&seg[3]==='import')result=importQuestions(db,Number(seg[2]),data);
      else if(req.method==='PATCH'&&seg.length===3&&seg[1]==='questions'&&seg[2])result=editQuestion(db,Number(seg[2]),data);
      else if(req.method==='POST'&&seg.length===4&&seg[1]==='questions'&&seg[3]==='approve')result=approveQuestion(db,Number(seg[2]),data);
      else if(req.method==='POST'&&url.pathname==='/api/tasks')result=addTask(db,data);
      else if(req.method==='PATCH'&&seg.length===3&&seg[1]==='tasks'&&seg[2])result=updateTask(db,Number(seg[2]),data);
      else return json(404,{error:'API endpoint not found'});
      return json(200,{ok:true,...result});
    }

return handler;
}
export const handler=createHandler(createStorage());
export const server=http.createServer(handler);
if(process.env.NODE_ENV!=='test'&&!process.env.VERCEL){
  const port=Number(process.env.PORT||3000);
  const host=process.env.HOST||'127.0.0.1';
  server.listen(port,host,()=>console.log(`RELAY ready at http://${host}:${port}`));
}
