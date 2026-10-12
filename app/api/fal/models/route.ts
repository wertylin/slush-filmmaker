import { NextResponse } from 'next/server';
import { listEnabledFalModels } from '@/lib/fal-models';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const models = await listEnabledFalModels();
    return NextResponse.json({
      models: models.map((m) => ({
        key: m.key,
        label: m.label,
        kind: m.kind,
        costTier: m.costTier,
        bestFor: m.bestFor,
        avoidFor: m.avoidFor,
        isDefault: m.isDefault,
        capabilities: m.capabilities,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
