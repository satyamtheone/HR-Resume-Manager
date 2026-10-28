import { MAX_PDF_PAGES } from './validate-file';
export async function extractText(file:File):Promise<string>{
 if(file.name.toLowerCase().endsWith('.docx')){const mammoth=await import('mammoth/mammoth.browser'); const result=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()}); return normalize(result.value);}
 const pdfjs=await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
 const doc=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
 try { if(doc.numPages>MAX_PDF_PAGES)throw new Error(`PDF exceeds the ${MAX_PDF_PAGES}-page limit.`); const pages:string[]=[]; for(let n=1;n<=doc.numPages;n++){const page=await doc.getPage(n);const content=await page.getTextContent();const items=content.items as Array<{str?:string;hasEOL?:boolean}>;pages.push(items.map(x=>`${x.str??''}${x.hasEOL?'\n':' '}`).join('').trim());page.cleanup();} const text=normalize(pages.join('\n\n')); if(text.replace(/\s/g,'').length<40)throw new Error('This PDF has little or no selectable text. It may be scanned and require OCR.'); return text;} finally {await doc.destroy();}
}
function normalize(s:string){return s.replace(/\r/g,'\n').replace(/[\t\u00a0]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').replace(/[ ]{2,}/g,' ').trim();}
