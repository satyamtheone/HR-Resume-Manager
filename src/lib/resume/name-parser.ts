import { SKILLS } from './skills-dictionary';

const ROLE_WORDS=/\b(?:software|frontend|front-end|backend|back-end|full-stack|fullstack|web|mobile|react|senior|junior|principal|staff|lead|team|engineering|technical|project|product|program|people|account|business|data|cloud|qa|test|developer|engineer|manager|consultant|analyst|architect|designer|intern|specialist|director|officer|executive|administrator|recruiter|scientist|researcher|teacher|professor|student|founder|owner|consulting)\b/i;
const FIELD_LABEL=/^(?:name|candidate|candidate name|applicant|applicant name|full name)\s*[:|–—-]\s*/i;
const NON_NAME_WORDS=new Set(['resume','résumé','curriculum','vitae','professional','summary','objective','profile','contact','details','information','experience','employment','education','skills','certifications','projects','address','location','based','india','indian','phone','mobile','email','linkedin','github','portfolio','currently','available','immediately','notice','period','salary','expected','bachelor','master','science','technology','university','college','pvt','private','limited','ltd','inc','corporation','technologies','solutions','systems','services','consulting','software','digital','labs','hindi','english','sanskrit','language','languages']);
const PLACE_WORDS=/\b(?:bengaluru|bangalore|mumbai|delhi|noida|hyderabad|pune|chennai|kolkata|gurugram|gurgaon|india|indian|usa|united states|canada|london|singapore|dubai)\b/i;
const SKILL_PHRASES=new Set([...SKILLS,'SSR','ES6+','CI/CD','Git','Vercel','Netlify','Firebase Firestore','Redux Toolkit','JWT Authentication'].map(x=>x.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ')));

function normalizeCandidate(raw:string):string|null{
 let value=raw.normalize('NFKC').replace(/\([^)]*\)/g,' ').replace(/^[\s•·|–—-]+|[\s•·|–—-]+$/g,'').replace(/\s+/g,' ').trim();
 value=value.replace(FIELD_LABEL,'').replace(/^[^\p{L}]+|[^\p{L}.]+$/gu,'').replace(/^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/i,'').replace(/\s*,?\s*(?:ph\.?d\.?|m\.?d\.?|mba|pmp|csm|b\.?tech|m\.?tech)\.?$/i,'').trim();
 if(value.length<3||value.length>65||/@|https?:|www\.|\d|[()[\]{}<>]/.test(value)||PLACE_WORDS.test(value)||ROLE_WORDS.test(value))return null;
 const words=value.split(/[\s,]+/).filter(Boolean);
 if(words.length<2||words.length>5||!words.every(w=>/^[\p{L}][\p{L}’'-]*\.?$/u.test(w)))return null;
 if(words.some(w=>NON_NAME_WORDS.has(w.replace(/[.,]/g,'').toLocaleLowerCase())))return null;
 const normalized=value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ');
 if(SKILL_PHRASES.has(normalized))return null;
 return words.map(w=>w.toLocaleUpperCase()===w?w[0]+w.slice(1).toLocaleLowerCase():w).join(' ');
}

function filenameName(filename:string):string|null{
 const stem=filename.replace(/\.[^.]+$/,'').replace(/[\d_]+/g,' ').replace(/[-]+/g,' ').replace(/\b(?:resume|cv|updated|final|latest|profile|202\d|19\d\d)\b/gi,' ').replace(/\s+/g,' ').trim();
 return normalizeCandidate(stem);
}

export function parseCandidateName(text:string,fileName=''):{name:string|null;confidence:number|null}{
 const lines=text.replace(/\r/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,90);
 const candidates:Array<{name:string;score:number}> = [];
 for(let i=0;i<lines.length;i++){
  const line=lines[i];
  if(line.length>100||/^([•●▪*]|https?:|www\.)/i.test(line))continue;
  const explicit=FIELD_LABEL.test(line);
  const cleaned=line.replace(FIELD_LABEL,'').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,' | ').replace(/https?:\/\/\S+|www\.\S+/gi,' | ').replace(/(?:\+?\d[\d\s().-]{7,}\d)/g,' | ');
  const segments=cleaned.split(/\s+[|•·,]\s+|\s+[–—]\s+|\s+-\s+/).map(s=>s.trim()).filter(Boolean);
  for(const segment of segments){
   const name=normalizeCandidate(segment);if(!name)continue;
   const words=segment.trim().split(/\s+/).filter(Boolean);
   const allCaps=words.length>=2&&words.every(w=>/^\p{Lu}[\p{L}'’-]*\.?$/u.test(w));
   const score=(explicit?150:0)+(allCaps?55:0)+Math.max(0,48-i)+(segments.length===1?8:0)+(name===segment?2:0);
   candidates.push({name,score});
  }
 }
 const best=candidates.sort((a,b)=>b.score-a.score)[0];
 if(best)return{name:best.name,confidence:best.score>=120?0.96:best.score>=75?0.84:0.68};
 const fallback=filenameName(fileName);return fallback?{name:fallback,confidence:0.55}:{name:null,confidence:null};
}
