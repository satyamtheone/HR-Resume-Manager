import { NextResponse } from 'next/server';import { readSession } from '@/lib/gmail/session';
export async function GET(){const session=await readSession();return NextResponse.json({connected:Boolean(session),email:session?.email??null});}
