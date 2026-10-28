import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

const COOKIE = 'resume_parser_gmail';
const STATE_COOKIE = 'resume_parser_oauth_state';
export interface GmailSession { accessToken: string; refreshToken: string; expiresAt: number; email: string; }
function secret(): Buffer { const value=process.env.GMAIL_SESSION_KEY; if(!value)throw new Error('GMAIL_SESSION_KEY is not configured.'); const key=Buffer.from(value,'base64'); if(key.length!==32)throw new Error('GMAIL_SESSION_KEY must be a base64-encoded 32-byte key.'); return key; }
function encrypted(value: unknown): string { const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),iv);const body=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url'); }
function decrypted<T>(value:string):T { const raw=Buffer.from(value,'base64url');if(raw.length<29)throw new Error('Invalid session.');const decipher=createDecipheriv('aes-256-gcm',secret(),raw.subarray(0,12));decipher.setAuthTag(raw.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]).toString('utf8')) as T; }
export async function readSession():Promise<GmailSession|null>{const jar=await cookies(),value=jar.get(COOKIE)?.value;if(!value)return null;try{return decrypted<GmailSession>(value);}catch{return null;}}
export async function saveSession(session:GmailSession){(await cookies()).set(COOKIE,encrypted(session),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*30});}
export async function clearSession(){(await cookies()).delete(COOKIE);}
export async function setOAuthState(value:string){(await cookies()).set(STATE_COOKIE,value,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:600});}
export async function consumeOAuthState(value:string|null){const jar=await cookies(),saved=jar.get(STATE_COOKIE)?.value;jar.delete(STATE_COOKIE);return Boolean(saved&&value&&saved===value);}
export function oauthConfig(){const {GOOGLE_CLIENT_ID,GOOGLE_CLIENT_SECRET,GOOGLE_REDIRECT_URI}=process.env;if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET||!GOOGLE_REDIRECT_URI)throw new Error('Google OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.');secret();return{clientId:GOOGLE_CLIENT_ID,clientSecret:GOOGLE_CLIENT_SECRET,redirectUri:GOOGLE_REDIRECT_URI};}
export async function accessToken(session:GmailSession):Promise<GmailSession>{if(session.expiresAt>Date.now()+60_000)return session;const config=oauthConfig();const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:session.refreshToken,grant_type:'refresh_token'})});const data=await response.json() as {access_token?:string;expires_in?:number;error?:string};if(!response.ok||!data.access_token)throw new Error('Gmail authorization expired. Reconnect the mailbox.');return{...session,accessToken:data.access_token,expiresAt:Date.now()+(data.expires_in??3600)*1000};}
export const gmailCookieName=COOKIE;
