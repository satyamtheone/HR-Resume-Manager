import type {ExperienceRecord} from '@/types/candidate';

const MONTH='(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_RANGE=new RegExp(`(?:(?:${MONTH})\\s+)?(?:19|20)\\d{2}\\s*(?:-|–|—|to)\\s*(?:(?:${MONTH})\\s+)?(?:(?:19|20)\\d{2}|present|current)`,'i');
const TITLE=/\b(?:(?:senior|junior|lead|principal|staff|associate|frontend|front[- ]end|backend|back[- ]end|full[- ]stack|software|web|mobile|react|qa|devops|data|product|project|technical|engineering|business|process)(?:\s+[\w.+&/-]+){0,2}\s+)?(?:developer|engineer|manager|consultant|analyst|architect|designer|administrator|intern|specialist|tester|director|executive|officer|associate)\b/i;
const COMPANY_END=/\b(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|Limited|Ltd\.?|LLC|Inc\.?|Corporation|Corp\.?|Technologies|Technology|Solutions|Services|Systems|Labs|Group|Company|University|Bank|Hospital|Self[- ]Employed)\b/i;
const LEGAL_COMPANY_END=/\b(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|Limited|Ltd\.?|LLC|Inc\.?|Corporation|Corp\.?)\b/i;
const LOCATION_TAIL=/\b(?:Noida|Gurugram|Gurgaon|Bengaluru|Bangalore|Mumbai|Delhi|Hyderabad|Pune|Chennai|India|Remote|Sector\s*[- ]?\d+)\b/i;
const EXPERIENCE_HEAD=/^(?:professional experience|work experience|employment history|career history|experience|professional background|additional experience)$/i;
const STOP_HEAD=/^(?:education|skills|technical skills|projects|key projects|certifications|leadership|awards|languages|interests)\b/i;
const BULLET=/^[•●▪*\-]/;
function normalizeHeading(line:string){const collapsed=line.replace(/(?:\b[A-Z]\s+){2,}[A-Z]\b/g,word=>word.replace(/\s+/g,''));return collapsed.replace(/^WORKEXPERIENCE\b/i,'WORK EXPERIENCE').replace(/^PROFESSIONALEXPERIENCE\b/i,'PROFESSIONAL EXPERIENCE').replace(/^ADDITIONALEXPERIENCE\b/i,'ADDITIONAL EXPERIENCE').replace(/^KEYPROJECT\b/i,'KEY PROJECT');}

function parseDate(raw:string):{iso:string;month:number}|null{
 const value=raw.trim();if(/present|current/i.test(value))return{iso:'present',month:new Date().getUTCMonth()+1};
 const monthYear=value.match(new RegExp(`^(${MONTH})\\s+((?:19|20)\\d{2})$`,'i'));
 if(monthYear){const n=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(monthYear[1].slice(0,3).toLowerCase())+1;return{iso:`${monthYear[2]}-${String(n).padStart(2,'0')}`,month:n};}
 return /^(?:19|20)\d{2}$/.test(value)?{iso:value,month:1}:null;
}
function parseRange(value:string){const halves=value.split(/\s*(?:-|–|—|to)\s*/i);if(halves.length!==2)return null;const start=parseDate(halves[0]),end=parseDate(halves[1]);return start&&end?{start,end}:null;}
function durationMonths(start:string,end:string|null,isCurrent:boolean){const startDate=start.split('-').map(Number);if(startDate.length!==2)return null;const s=startDate[0]*12+startDate[1]-1;let e:number;if(isCurrent){const now=new Date();e=now.getUTCFullYear()*12+now.getUTCMonth()+1;}else if(end){const parts=end.split('-').map(Number);if(parts.length!==2)return null;e=parts[0]*12+parts[1]-1;}else return null;return Math.max(0,e-s);}
function clean(value:string){return value.replace(BULLET,'').replace(DATE_RANGE,' ').replace(/\(\s*\d+\s*(?:yrs?|years?|mos?|months?).*?\)/gi,' ').replace(/\s+/g,' ').replace(/^[\s|–—-]+|[\s|–—-]+$/g,'').trim();}
function titleFrom(value:string):string|null{
 const line=clean(value);if(!line||line.length>105||BULLET.test(value))return null;
 const special=line.match(/\b(?:engineer|developer)\s*[–-]\s*(?:software|web|application|frontend|backend|full[- ]stack)\s+development\b/i);if(special)return special[0].trim();
 const match=line.match(TITLE);return match?match[0].replace(/\s+/g,' ').trim():null;
}
function companyFrom(value:string):string|null{
 const line=clean(value);if(!line||line.length>140||BULLET.test(value))return null;
 if(/^(?:engineer|developer)\s*[–—-]\s*(?:software|web|application|frontend|backend|full[- ]stack)\s+development\b/i.test(line)&&!COMPANY_END.test(line))return null;
 const row=line.split('|')[0].trim();
 const fragments=row.split(/\s+[—–-]\s+/).map(x=>x.trim()).filter(Boolean);
 for(const fragment of [...fragments].reverse()){
  const end=fragment.match(LEGAL_COMPANY_END)??fragment.match(COMPANY_END);
  if(end){const before=fragment.slice(0,end.index!+end[0].length).trim().replace(/[|,–—-]+$/,'').trim();if(before.length>=2&&before.length<=90&&!TITLE.test(before))return before;}
 }
 let bare=fragments.at(-1)??row;
 const location=bare.match(LOCATION_TAIL);if(location&&location.index!==undefined)bare=bare.slice(0,location.index).replace(/[,|\s]+$/,'').trim();
 if(fragments.length>1&&fragments.some(fragment=>titleFrom(fragment))){const roleCompany=fragments.find(fragment=>!titleFrom(fragment));if(roleCompany){let candidate=roleCompany;const place=candidate.match(LOCATION_TAIL);if(place&&place.index!==undefined)candidate=candidate.slice(0,place.index).replace(/[,|\s]+$/,'').trim();if(candidate.length<=60&&!/[.!?;:]/.test(candidate)&&!/^\d+$/.test(candidate)&&!TITLE.test(candidate))return candidate;}}
 if(bare.length<=42&&!/[.!?;:]/.test(bare)&&!/^\d+$/.test(bare)&&!titleFrom(value)&&!/^(?:responsibilities|achievements|key skills|remote|india|noida|gurugram)$/i.test(bare)){
  const words=bare.split(/\s+/);if(words.length<=4&&words.every(w=>/^[\p{L}&.'’-]+$/u.test(w)))return bare;
 }
 return null;
}
function makeRecord(title:string|null,company:string|null,range:string|undefined,evidence:string):ExperienceRecord{
 const parsed=range?parseRange(range):null;const startDate=parsed?(parsed.start.iso==='present'?null:parsed.start.iso):null;const isCurrent=Boolean(parsed?.end.iso==='present');const endDate=parsed&&!isCurrent?parsed.end.iso:null;
 return{company,jobTitle:title,startDate,endDate,isCurrent,durationMonths:startDate?durationMonths(startDate,endDate,isCurrent):null,evidence:evidence.slice(0,600)};
}

export function parseExperience(text:string):ExperienceRecord[]{
 const rawLines=text.split(/\n/).map(x=>normalizeHeading(x.trim())).filter(Boolean),lines:string[]=[];
 for(let i=0;i<rawLines.length;i++){const line=rawLines[i];const incompleteEnd=new RegExp(`(?:${MONTH}\\s+)?(?:19|20)\\d{2}\\s*(?:-|–|—|to)\\s*(?:(?:${MONTH})\\s*)?$`,'i').test(line);if(incompleteEnd&&/^\s*(?:19|20)\d{2}\s*$/.test(rawLines[i+1]??'')){lines.push(`${line} ${rawLines[++i]}`);}else lines.push(line);}
 const startIndex=lines.findIndex(x=>EXPERIENCE_HEAD.test(x));if(startIndex<0)return[];
 let endIndex=lines.length;for(let i=startIndex+1;i<lines.length;i++)if(STOP_HEAD.test(lines[i])){endIndex=i;break;}
 const section=lines.slice(startIndex+1,endIndex),records:ExperienceRecord[]=[];
 for(let i=0;i<section.length;i++){
  const date=section[i].match(DATE_RANGE);if(!date)continue;
  const candidates=section.slice(Math.max(0,i-2),Math.min(section.length,i+3));
  const title=candidates.map(titleFrom).find(Boolean)??null;
  const company=candidates.map(companyFrom).find(x=>x&&!TITLE.test(x))??null;
  const strongCompany=candidates.some(line=>COMPANY_END.test(clean(line)));
  if(!title&&!strongCompany)continue;
  const evidence=candidates.filter(x=>!BULLET.test(x)).join(' | ');
  records.push(makeRecord(title,company,date[0],evidence));
 }
 // Some visually designed resumes put dates in a separate column or omit them.
 // Recover nearby title/employer pairs without inventing dates.
 for(let i=0;i<section.length;i++){
  if(BULLET.test(section[i])||DATE_RANGE.test(section[i]))continue;
  const title=titleFrom(section[i]);if(!title)continue;
  const candidates=section.slice(Math.max(0,i-1),Math.min(section.length,i+3));
  const company=candidates.map(companyFrom).find(x=>x&&!TITLE.test(x))??null;if(!company)continue;
  const exists=records.some(r=>r.company?.toLowerCase()===company.toLowerCase()&&r.jobTitle?.toLowerCase()===title.toLowerCase());
  if(!exists)records.push(makeRecord(title,company,undefined,candidates.join(' | ')));
 }
 return records.filter((record,index)=>records.findIndex(other=>other.company?.toLowerCase()===record.company?.toLowerCase()&&other.jobTitle?.toLowerCase()===record.jobTitle?.toLowerCase()&&other.startDate===record.startDate)===index);
}
