const CITIES=['Bengaluru','Bangalore','Mumbai','Delhi','Noida','Hyderabad','Pune','Chennai','Kolkata','Gurugram','Gurgaon','Jaipur','Ahmedabad','Indore','Chandigarh','Lucknow','Kochi','Thane','Faridabad'];
const COUNTRIES=['India','United States','USA','Canada','United Kingdom','UK','Australia','Singapore','United Arab Emirates','UAE','Dubai'];
const PLACE_RE=new RegExp(`\\b(?:${[...CITIES,...COUNTRIES].map(x=>x.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')).join('|')})\\b`,'i');
const SECTION=/^(?:professional summary|summary|profile|objective|career objective|skills|technical skills|work experience|professional experience|experience|employment history|education|projects|certifications|languages)\b/i;

function tidy(value:string){return value.replace(/[•●▪➣✉]+/g,' ').replace(/\s+/g,' ').replace(/^[,;|\s]+|[,;|\s]+$/g,'').replace(/[.]+$/,'').trim();}

export function parseLocation(text:string):string|null{
 const lines=text.replace(/\r/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
 const explicit=text.match(/^(?:current\s+)?(?:location|address|based\s+in|city)\s*[:\-]\s*(.{2,90})$/im);
 if(explicit){const value=tidy(explicit[1].split(/[|;]/)[0]);if(value)return value;}
 const header:string[]=[];
 for(const line of lines.slice(0,70)){if(SECTION.test(line))break;header.push(line);}
 for(const line of header){
  const segments=line.split(/[|•·]/).map(tidy).filter(Boolean);
  for(const segment of segments){
   if(!PLACE_RE.test(segment))continue;
   const location=tidy(segment.replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g,' ').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,' '));
   if(location&&location.length<=90)return location;
  }
 }
 return null;
}
