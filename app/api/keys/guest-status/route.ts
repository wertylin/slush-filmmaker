import { NextResponse } from 'next/server';
import { guestFalAvailable, guestOpenAIAvailable } from '@/lib/server-keys';

export const runtime = 'nodejs';

/** Public: whether Slush guest keys exist on the server (never returns the secrets). */
export async function GET() {
  const openai = guestOpenAIAvailable();
  const fal = guestFalAvailable();
  return NextResponse.json({
    openai,
    fal,
    available: openai || fal,
  });
}
