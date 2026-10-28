import type {CandidateProfile} from '@/types/candidate';
import {parseEmail,parsePhone} from './contact-parser';
import {parseSkills} from './skills-parser';
import {parseLocation} from './location-parser';
import {parseExperience} from './experience-parser';
import {calculateExperience,parseStatedExperience} from './experience-calculator';
import {parseLeadership} from './leadership-parser';
import {parseEducation,parseCertifications} from './education-parser';
import {CandidateSchema} from './candidate-schema';
import {parseCandidateName} from './name-parser';

export function missingRequiredResumeFields(candidate:CandidateProfile):string[]{
 const missing:string[]=[];
 if(!candidate.name)missing.push('name');
 if(!candidate.email)missing.push('email');
 if(!candidate.phone)missing.push('phone number');
 if(!candidate.skills.length)missing.push('recognized skills');
 if(candidate.totalExperienceYears===null&&candidate.statedExperienceYears===null&&candidate.experience.length===0)missing.push('experience');
 if(!candidate.location)missing.push('location');
 if(candidate.companies.length===0)missing.push('company name');
 if(candidate.jobTitles.length===0)missing.push('role/job title');
 return missing;
}

export function parseResume(text:string,fileName:string):CandidateProfile{
 const warnings:string[]=[];
 const {email,multiple}=parseEmail(text);
 const phone=parsePhone(text),nameResult=parseCandidateName(text,fileName),name=nameResult.name,location=parseLocation(text);
 const experience=parseExperience(text),totalExperienceYears=calculateExperience(experience),statedExperienceYears=parseStatedExperience(text);
 const skills=parseSkills(text);
 if(!name)warnings.push('Candidate name could not be identified confidently.');
 if(multiple)warnings.push('Multiple email addresses appear in the contact header; confirm the primary address.');
 if(!phone)warnings.push('A valid phone number could not be identified.');
 if(!location)warnings.push('Candidate location could not be identified from the contact header.');
 if(!skills.length)warnings.push('No recognized skills were found.');
 if(!experience.length&&!statedExperienceYears)warnings.push('Employment history or stated years of experience could not be identified.');
 if(experience.some(x=>!x.company))warnings.push('One or more employment records are missing a company name.');
 if(experience.some(x=>!x.startDate&&!x.jobTitle))warnings.push('One or more employment records need review.');
 if(statedExperienceYears!==null&&totalExperienceYears!==null&&Math.abs(statedExperienceYears-totalExperienceYears)>1)warnings.push('Stated and calculated experience differ by more than one year.');
 const id=crypto.randomUUID();
 const candidateFields={name,email,phone,location,totalExperienceYears,statedExperienceYears,skills,experience,companies:[...new Set(experience.flatMap(x=>x.company?[x.company]:[]))],jobTitles:[...new Set(experience.flatMap(x=>x.jobTitle?[x.jobTitle]:[]))]};
 // Warnings can describe non-blocking differences (for example, stated vs.
 // date-calculated experience) or a single incomplete historical role. Keep
 // those visible in the profile, but only use the review badge for a missing
 // required candidate field. Duplicate detection may independently add the
 // review badge later in the import flow.
 const needsReview=missingRequiredResumeFields(candidateFields as CandidateProfile).length>0;
 const data={id,...candidateFields,leadershipEvidence:parseLeadership(text),education:parseEducation(text),certifications:parseCertifications(text),extractionWarnings:warnings,extractionConfidence:{name:nameResult.confidence,email:email?0.99:null,phone:phone?0.85:null,location:location?0.85:null,skills:skills.length?0.85:null,experience:experience.length||statedExperienceYears?0.75:null},originalFileName:fileName,extractedText:text,createdAt:new Date().toISOString(),status:needsReview?'needs_review' as const:'completed' as const,manuallyEditedFields:[]};
 return CandidateSchema.parse(data);
}
