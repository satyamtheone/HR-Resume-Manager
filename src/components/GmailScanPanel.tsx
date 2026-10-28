'use client';
import{useEffect,useRef,useState}from'react';import{createPortal}from'react-dom';import{CalendarDays,Mail,RefreshCw,ScanSearch,ShieldCheck,Square,CheckCircle2,AlertTriangle,FileWarning,ExternalLink,X,FileText}from'lucide-react';
export interface GmailSource { email:string; subject:string; receivedAt:string; }
export type ImportedResumeFile=File&{mailSource?:GmailSource};
type ScanStats={phase:'idle'|'scanning'|'retrying'|'complete'|'cancelled'|'failed';emailsScanned:number;totalEmailsEstimate:number|null;documentsFound:number;documentsParsed:number;documentsFailed:number;failedEmails:number;skippedAttachments:number;currentFile:string};
type ParseResult={parsed:number;failed:number;errors?:string[]};
type ScanEvent=Record<string,unknown>;
type ReviewItem={id:string;filename:string;mimeType:string;from:string;subject:string;receivedAt:string;messageId:string;reason:string};
type LongFile={file:File;event:ScanEvent};
const initialStats:ScanStats={phase:'idle',emailsScanned:0,totalEmailsEstimate:null,documentsFound:0,documentsParsed:0,documentsFailed:0,failedEmails:0,skippedAttachments:0,currentFile:''};
function dateValue(date:Date){return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function waitForRetry(milliseconds:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{if(signal.aborted){reject(new DOMException('The scan was cancelled.','AbortError'));return;}const finish=()=>{signal.removeEventListener('abort',cancel);resolve();};const timer=window.setTimeout(finish,milliseconds);const cancel=()=>{window.clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(new DOMException('The scan was cancelled.','AbortError'));};signal.addEventListener('abort',cancel,{once:true});});}
export default function GmailScanPanel({onFiles,onScanStateChange}:{onFiles:(files:File[],signal?:AbortSignal,timeoutMs?:number|null)=>Promise<ParseResult>;onScanStateChange?:(scanning:boolean)=>void}){const now=new Date(),[startDate,setStartDate]=useState(`${now.getFullYear()}-01-01`),[endDate,setEndDate]=useState(dateValue(now)),[connected,setConnected]=useState(false),[email,setEmail]=useState<string|null>(null),[loading,setLoading]=useState(false),[message,setMessage]=useState(''),[stats,setStats]=useState<ScanStats>(initialStats),[reviewItems,setReviewItems]=useState<ReviewItem[]>([]),[reviewOpen,setReviewOpen]=useState(false),[longFiles,setLongFiles]=useState<LongFile[]>([]),longFilesRef=useRef<LongFile[]>([]),abortRef=useRef<AbortController|null>(null);
 useEffect(()=>{void fetch('/api/gmail/status').then(r=>r.json()).then(d=>{setConnected(Boolean(d.connected));setEmail(d.email??null)}).catch(()=>{});const params=new URLSearchParams(window.location.search);const state=params.get('gmail'),setupMessage=params.get('message');if(state){params.delete('gmail');params.delete('message');history.replaceState(null,'',`${window.location.pathname}${params.size?`?${params}`:''}`);const messages:Record<string,string>={setup_required:setupMessage||'Add Google OAuth settings to .env.local to connect Gmail.',connected:'Gmail is connected and ready to scan.',denied:'Gmail access was cancelled.',failed:'Gmail could not finish connecting. Check the OAuth redirect URI and mailbox permissions.',state_error:'The OAuth session expired. Please connect again.'};window.setTimeout(()=>setMessage(messages[state]??''),0);}},[]);
 async function scan(){
  const controller=new AbortController();abortRef.current=controller;setLoading(true);onScanStateChange?.(true);setReviewItems([]);setReviewOpen(false);longFilesRef.current=[];setLongFiles([]);setMessage('Connecting to Gmail…');setStats({...initialStats,phase:'scanning'});
  const totals={emailsScanned:0,totalEmailsEstimate:null as number|null,documentsFound:0,documentsParsed:0,documentsFailed:0,failedEmails:0,skippedAttachments:0};
  let pageToken:string|undefined,complete=false,quotaRetryCount=0;
  try{
   while(!complete&&!controller.signal.aborted){
    const response=await fetch('/api/gmail/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({startDate,endDate,pageToken,totals}),signal:controller.signal});
    if(!response.ok){const error=await response.json() as {error?:string};throw new Error(error.error??'Could not scan Gmail.');}
    if(!response.body)throw new Error('This browser cannot receive live scan progress.');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',terminalEvent=false,batchError:string|undefined,shouldRetryQuota=false;
    const batchFiles:Array<{file:File;event:ScanEvent}>=[];
    const updateFromEvent=(event:ScanEvent)=>{
     for(const key of ['emailsScanned','documentsFound','failedEmails','skippedAttachments'] as const){const value=Number(event[key]);if(Number.isFinite(value))totals[key]=value;}
     const estimate=Number(event.totalEmailsEstimate);if(Number.isFinite(estimate))totals.totalEmailsEstimate=estimate;
     setStats(s=>({...s,...totals,currentFile:s.currentFile}));
    };
    const handle=async(block:string)=>{
     let name='',data='';for(const line of block.split(/\r?\n/)){if(line.startsWith('event:'))name=line.slice(6).trim();else if(line.startsWith('data:'))data+=line.slice(5).trim();}
     if(!name||!data)return;const event=JSON.parse(data) as ScanEvent;
     if(name==='start'){
      updateFromEvent(event);
      if(totals.emailsScanned===0)setMessage(`Found about ${(totals.totalEmailsEstimate??0).toLocaleString()} matching emails. Starting the scan…`);
     }
     if(name==='progress')updateFromEvent(event);
     if(name==='skipped'){
      const item:ReviewItem={id:`${String(event.messageId??'mail')}:${String(event.partId??event.filename??'file')}:${String(event.reason??'skip')}`,filename:String(event.filename??'Unnamed attachment'),mimeType:String(event.mimeType??''),from:String(event.from??''),subject:String(event.subject??''),receivedAt:String(event.receivedAt??''),messageId:String(event.messageId??''),reason:String(event.reason??'Not parsed automatically.')};
      setReviewItems(items=>[...items,item]);updateFromEvent(event);
     }
     if(name==='email_failed'){
      updateFromEvent(event);
      const messageId=String(event.messageId??'');
      setReviewItems(items=>[...items,{id:`${messageId}:email-failed`,filename:'Email could not be read',mimeType:'',from:'',subject:'',receivedAt:'',messageId,reason:`Gmail could not read this email (HTTP ${String(event.status??'error')}${event.details?` · ${String(event.details)}`:''}) after retrying.`}]);
     }
     if(name==='attachment'){
      const filename=String(event.filename??'resume'),mimeType=String(event.mimeType??''),encoded=String(event.data??''),normalized=encoded.replace(/-/g,'+').replace(/_/g,'/'),raw=Uint8Array.from(atob(normalized),c=>c.charCodeAt(0));
      totals.documentsFound=Number(event.documentsFound??totals.documentsFound+1);
      const attachmentFile=new File([raw],filename,{type:mimeType});Object.assign(attachmentFile,{mailSource:{email:String(event.from??''),subject:String(event.subject??''),receivedAt:String(event.receivedAt??'')}});
      const metadata={...event};delete metadata.data;batchFiles.push({file:attachmentFile,event:metadata});
      setStats(s=>({...s,...totals,currentFile:filename}));setMessage(`Found ${filename}; queued for candidate extraction…`);
     }
     if(name==='batch'){
      updateFromEvent(event);pageToken=typeof event.nextPageToken==='string'?event.nextPageToken:undefined;
      if(!pageToken)batchError='Gmail did not return a continuation token for the next batch.';
      quotaRetryCount=0;
      terminalEvent=true;
     }
     if(name==='complete'){
      updateFromEvent(event);pageToken=undefined;complete=true;terminalEvent=true;
     }
     if(name==='error'){
      updateFromEvent(event);batchError=String(event.message??'Gmail scan failed.');
      shouldRetryQuota=/rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(batchError)&&quotaRetryCount<5;
      terminalEvent=true;
     }
    };
    try{
     while(true){const{value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let boundary=buffer.indexOf('\n\n');while(boundary>=0){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);await handle(block);boundary=buffer.indexOf('\n\n');}}
    }finally{reader.releaseLock();}
    if(shouldRetryQuota){quotaRetryCount++;const delay=Math.min(5000*2**(quotaRetryCount-1),30000);setMessage(`Gmail is rate-limiting requests. Pausing ${Math.ceil(delay/1000)} seconds, then resuming this batch…`);await waitForRetry(delay,controller.signal);continue;}
    // Finish the Gmail request before parsing. This keeps Vercel's function
    // duration independent of local PDF/DOCX extraction time.
    for(const {file,event} of batchFiles){
     if(controller.signal.aborted)break;
     const filename=file.name,mimeType=file.type;
     setStats(s=>({...s,...totals,currentFile:filename}));
     setMessage(`Extracting candidate details from ${filename}…`);
     const parsed=await onFiles([file],controller.signal);
     const tookTooLong=parsed.errors?.some(error=>error.includes('Extraction took longer than 60 seconds.'))??false;
     if(tookTooLong){const pending={file,event};longFilesRef.current=[...longFilesRef.current,pending];setLongFiles(longFilesRef.current);setMessage(`${filename} needs extended extraction and has been queued for after the mailbox scan.`);}
     else if(parsed.failed){setReviewItems(items=>[...items,{id:`${String(event.messageId??'mail')}:${filename}:parse-failed`,filename,mimeType,from:String(event.from??''),subject:String(event.subject??''),receivedAt:String(event.receivedAt??''),messageId:String(event.messageId??''),reason:parsed.errors?.[0]??'This PDF or DOCX was found, but it did not contain all required candidate details.'}]);}
     totals.documentsParsed+=parsed.parsed;if(!tookTooLong)totals.documentsFailed+=parsed.failed;setStats(s=>({...s,...totals,currentFile:''}));
    }
    if(batchError)throw new Error(batchError);
    if(!terminalEvent)throw new Error('The Gmail scan batch ended before returning its continuation status.');
    if(complete)break;
   }
   if(complete&&!controller.signal.aborted){setStats(s=>({...s,...totals,phase:'complete',currentFile:''}));setMessage(`Scan complete. ${totals.documentsFound.toLocaleString()} resume documents found; ${totals.emailsScanned.toLocaleString()} emails checked.${longFilesRef.current.length?` ${longFilesRef.current.length} long-running document${longFilesRef.current.length===1?'':'s'} queued for extended extraction.`:''}`);}
  }catch(error){
   if(controller.signal.aborted){setStats(s=>({...s,...totals,phase:'cancelled',currentFile:''}));setMessage('Scan stopped. Profiles already parsed remain in the candidate list.');}
   else{setStats(s=>({...s,...totals,phase:'failed',currentFile:''}));setMessage(error instanceof Error?error.message:'Gmail scan failed.');}
  }finally{abortRef.current=null;setLoading(false);onScanStateChange?.(false);}
 }
 async function retryLongFiles(){
  if(!longFilesRef.current.length)return;
  const controller=new AbortController();abortRef.current=controller;setLoading(true);onScanStateChange?.(true);setStats(s=>({...s,phase:'retrying',currentFile:''}));
   try{
   let parsedInRetry=0;
   while(longFilesRef.current.length&&!controller.signal.aborted){
    const current=longFilesRef.current[0],filename=current.file.name,mimeType=current.file.type;
    setStats(s=>({...s,phase:'retrying',currentFile:filename}));setMessage(`Extended extraction: ${filename}. This retry has no time limit.`);
    const parsed=await onFiles([current.file],controller.signal,null);
    if(controller.signal.aborted)break;
    if(parsed.failed){setReviewItems(items=>[...items,{id:`${String(current.event.messageId??'mail')}:${filename}:parse-retry-failed`,filename,mimeType,from:String(current.event.from??''),subject:String(current.event.subject??''),receivedAt:String(current.event.receivedAt??''),messageId:String(current.event.messageId??''),reason:parsed.errors?.[0]??'Candidate details could not be extracted on the extended retry.'}]);}
    parsedInRetry+=parsed.parsed;
    setStats(s=>({...s,documentsParsed:s.documentsParsed+parsed.parsed,documentsFailed:s.documentsFailed+parsed.failed,currentFile:''}));
    longFilesRef.current=longFilesRef.current.slice(1);setLongFiles(longFilesRef.current);
   }
   if(controller.signal.aborted){setStats(s=>({...s,phase:'cancelled',currentFile:''}));setMessage(`Extended retry stopped. ${longFilesRef.current.length} document${longFilesRef.current.length===1?' remains':'s remain'} in the retry queue.`);}
   else{setStats(s=>({...s,phase:'complete',currentFile:''}));setMessage(`Extended extraction complete. ${parsedInRetry} additional document${parsedInRetry===1?'':'s'} parsed; ${longFilesRef.current.length} remain queued.`);}
  }catch(error){setStats(s=>({...s,phase:'failed',currentFile:''}));setMessage(error instanceof Error?error.message:'Extended extraction failed.');}
  finally{abortRef.current=null;setLoading(false);onScanStateChange?.(false);}
 }
 function stop(){abortRef.current?.abort();}
 async function disconnect(){await fetch('/api/gmail/disconnect',{method:'POST'});setConnected(false);setEmail(null);setMessage('Gmail disconnected.');}
 const emailPercent=stats.phase==='complete'||stats.phase==='retrying'?100:stats.totalEmailsEstimate?Math.min(99,Math.round(stats.emailsScanned/stats.totalEmailsEstimate*100)):0;const docsPending=Math.max(0,stats.documentsFound-stats.documentsParsed-stats.documentsFailed);const emailsRemaining=stats.totalEmailsEstimate===null?null:Math.max(0,stats.totalEmailsEstimate-stats.emailsScanned);const isActive=loading&&(stats.phase==='scanning'||stats.phase==='retrying');
 const reviewDrawer=reviewOpen&&typeof document!=='undefined'?createPortal(<div className="overlay review-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setReviewOpen(false)}}><aside className="review-drawer"><header className="review-drawer-head"><div><div className="drawer-kicker">GMAIL SCAN REVIEW</div><h2>Files not counted as resumes</h2><p>Review attachment files that were skipped or could not be parsed automatically.</p></div><button aria-label="Close excluded files" onClick={()=>setReviewOpen(false)}><X size={18}/></button></header><div className="review-drawer-summary"><FileWarning size={17}/><span><b>{reviewItems.length} files to review</b><small>These files were excluded from candidate profiles.</small></span></div><div className="review-items">{reviewItems.map(item=><article className="review-file" key={item.id}><div className="review-file-icon"><FileText size={16}/></div><div className="review-file-main"><b title={item.filename}>{item.filename}</b><span className="review-reason">{item.reason}</span><small>{item.from||'Sender unavailable'}{item.subject?` · ${item.subject}`:''}</small>{item.receivedAt&&<small>{new Date(Number(item.receivedAt)).toLocaleString()}</small>}</div>{item.messageId&&<a className="review-email-link" href={`https://mail.google.com/mail/u/0/#all/${encodeURIComponent(item.messageId)}`} target="_blank" rel="noreferrer">Open email<ExternalLink size={12}/></a>}</article>)}</div></aside></div>,document.body):null;
 return <><section className="gmail-card"><div className="gmail-heading"><div className="gmail-icon"><Mail size={19}/></div><div className="gmail-title"><h2>Scan Gmail for resumes</h2><p>Search email attachments in a selected date range. Only PDF and DOCX files are processed.</p></div><div className={`gmail-connection ${connected?'connected':''}`}><i/>{connected?`Connected${email?` · ${email}`:''}`:'Not connected'}</div></div><div className="gmail-controls"><label><CalendarDays size={15}/><span>From</span><input type="date" value={startDate} max={endDate} onChange={e=>setStartDate(e.target.value)} disabled={loading}/></label><label><CalendarDays size={15}/><span>To</span><input type="date" value={endDate} min={startDate} max={dateValue(now)} onChange={e=>setEndDate(e.target.value)} disabled={loading}/></label><button className="btn primary scan-btn" onClick={()=>void scan()} disabled={!connected||loading||!startDate||!endDate}>{loading?<RefreshCw className="spin" size={15}/>:<ScanSearch size={16}/>}Scan Emails</button>{loading?<button className="btn scan-stop" onClick={stop}><Square size={13}/>Stop scan</button>:connected?<button className="gmail-disconnect" onClick={()=>void disconnect()}>Disconnect</button>:<button className="btn secondary connect-btn" onClick={()=>window.location.assign(new URL('/api/gmail/connect',window.location.origin))}><Mail size={15}/>Connect Gmail</button>}</div>
 {stats.phase!=='idle'&&<div className={`scan-progress ${stats.phase}`}><div className="scan-progress-top"><div className="scan-live-label">{isActive&&<span className="live-dot"/>}{stats.phase==='complete'?<CheckCircle2 size={15}/>:stats.phase==='failed'?<AlertTriangle size={15}/>:null}<b>{stats.phase==='complete'?'Scan complete':stats.phase==='retrying'?'Retrying long-running documents':stats.phase==='cancelled'?'Scan stopped':stats.phase==='failed'?'Scan needs attention':'Scanning mailbox'}</b></div><span>{stats.totalEmailsEstimate===null?'Counting matching emails…':`${stats.emailsScanned.toLocaleString()} / ~${stats.totalEmailsEstimate.toLocaleString()} emails checked`}</span></div><div className="scan-track"><div className="scan-track-fill" style={{width:`${emailPercent}%`}}/></div><div className="scan-metrics"><div><small>Emails checked</small><b>{stats.emailsScanned.toLocaleString()}<em>{stats.totalEmailsEstimate!==null?` / ~${stats.totalEmailsEstimate.toLocaleString()}`:''}</em></b></div><div><small>Emails remaining</small><b>{emailsRemaining===null?'…':stats.phase==='complete'||stats.phase==='retrying'?'0':emailsRemaining.toLocaleString()}</b></div><div><small>Resume documents found</small><b>{stats.documentsFound.toLocaleString()}</b></div><div><small>Documents parsed</small><b>{stats.documentsParsed.toLocaleString()}</b></div><div><small>{isActive?'Awaiting parse':'Documents left'}</small><b>{stats.phase==='complete'&&longFiles.length===0?'0':docsPending.toLocaleString()}{isActive&&stats.documentsFound===stats.documentsParsed+stats.documentsFailed?' · discovering':''}</b></div></div>{isActive&&<div className="scan-current"><span className="scan-pulse"/>{stats.currentFile?`${stats.phase==='retrying'?'Extended extraction':'Parsing'} ${stats.currentFile}`:'Checking next email and its attachments'}</div>}{Boolean(stats.failedEmails||stats.skippedAttachments||stats.documentsFailed)&&<div className="scan-notes">{stats.failedEmails>0&&`${stats.failedEmails} emails could not be read.`} {stats.skippedAttachments>0&&`${stats.skippedAttachments} oversized or unreadable attachments skipped.`} {stats.documentsFailed>0&&`${stats.documentsFailed} documents failed extraction.`}</div>}</div>}
 <div className={`gmail-message ${stats.phase==='failed'||message.includes('could not')||message.includes('expired')||message.includes('cancelled')?'message-error':''}`}>{message||<><ShieldCheck size={14}/>Mailbox access is read-only. Resume files are parsed locally in your browser.</>}</div>{longFiles.length>0&&!loading&&<button className="retry-large-trigger" onClick={()=>void retryLongFiles()}><RefreshCw size={16}/><span><b>Rescan {longFiles.length} long-running document{longFiles.length===1?'':'s'}</b><small>Process one at a time with no extraction time limit</small></span><ExternalLink size={14}/></button>}{reviewItems.length>0&&<button className="review-excluded-trigger" onClick={()=>setReviewOpen(true)}><FileWarning size={15}/><span>Review excluded files</span><b>{reviewItems.length}</b><ExternalLink size={13}/></button>}</section>{reviewDrawer}</>
}
