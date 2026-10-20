import { NextRequest, NextResponse } from 'next/server';
import { createOutfit, listOutfits } from '@/lib/db/outfit-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const outfits = listOutfits();
    return NextResponse.json({ outfits });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list outfits' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.garmentIds || !Array.isArray(body.garmentIds) || body.garmentIds.length === 0) {
      return NextResponse.json(
        { error: 'name and at least one garmentId are required' },
        { status: 400 }
      );
    }

    const outfit = createOutfit({
      name: body.name,
      description: body.description,
      modelId: body.modelId,
      scenePrompt: body.scenePrompt,
      garmentIds: body.garmentIds,
    });

    return NextResponse.json({ outfit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create outfit' },
      { status: 500 }
    );
  }
}
