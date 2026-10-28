import { NextResponse } from 'next/server';import { clearSession } from '@/lib/gmail/session';
export async function POST(){await clearSession();return NextResponse.json({connected:false});}
