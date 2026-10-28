const EMAIL_RE=/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOP_SECTION=/^(?:professional summary|summary|profile|objective|career objective|work experience|professional experience|experience|employment history|education|projects)\b/i;

export function parseEmail(text:string):{email:string|null;multiple:boolean}{
 const lines=text.replace(/\r/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
 const all=[...new Set((text.match(EMAIL_RE)??[]).map(x=>x.toLowerCase()))];
 const header:string[]=[];for(const line of lines.slice(0,80)){if(TOP_SECTION.test(line))break;header.push(line);}
 const primary=[...new Set((header.join('\n').match(EMAIL_RE)??[]).map(x=>x.toLowerCase()))];
 const candidates=primary.length?primary:all;
 return{email:candidates[0]??null,multiple:candidates.length>1};
}

export function parsePhone(text:string):string|null{
 const lines=text.replace(/\r/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
 const header:string[]=[];for(const line of lines.slice(0,80)){if(TOP_SECTION.test(line))break;header.push(line);}
 const scan=[...header,...lines.filter(line=>!header.includes(line)).slice(0,100)];
 const candidates:Array<{value:string;score:number}> = [];
 for(let i=0;i<scan.length;i++){
  const line=scan[i];
  for(const match of line.matchAll(/(?:\+?\d[\d\s()./-]{6,}\d)/g)){
   const value=match[0].replace(/\s+/g,' ').trim();const digits=value.replace(/\D/g,'');
   if(digits.length<10||digits.length>15||/^19\d{2}$/.test(digits)||/^20\d{2}$/.test(digits))continue;
   if(digits.length===10&&!/^[6-9]/.test(digits))continue;
   if(digits.length>10&&digits.length<12&&!value.startsWith('+'))continue;
   const score=(i<40?70-i:25)+(/\b(?:phone|mobile|contact|tel)\b/i.test(line)?80:0)+(value.startsWith('+')?10:0);
   candidates.push({value,score});
  }
 }
 return candidates.sort((a,b)=>b.score-a.score)[0]?.value??null;
}
