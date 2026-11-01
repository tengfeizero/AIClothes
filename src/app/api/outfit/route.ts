import { NextRequest, NextResponse } from 'next/server';
import { createOutfit, listOutfits } from '@/lib/db/outfit-store';
import { getOrCreateGarment } from '@/lib/db/garment-store';
import { isItemCategory } from '@/lib/storage/material-types';

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

    const garmentIds: string[] = Array.isArray(body.garmentIds) ? body.garmentIds : [];

    // 直接从素材中心选图：按图片路径复用或创建单品记录
    const pickedGarmentIds = (Array.isArray(body.garments) ? body.garments : [])
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const { imagePath, name, category } = item as { imagePath?: string; name?: string; category?: string };
        if (typeof imagePath !== 'string' || !imagePath) return null;
        return getOrCreateGarment({
          name: (typeof name === 'string' && name.trim()) || imagePath.split('/').pop() || '单品',
          category: typeof category === 'string' && isItemCategory(category) ? category : 'top',
          imagePath,
        }).id;
      })
      .filter((id: string | null): id is string => Boolean(id));

    const ids = Array.from(new Set([...garmentIds, ...pickedGarmentIds]));

    if (!body.name || ids.length === 0) {
      return NextResponse.json(
        { error: 'name and at least one garment are required' },
        { status: 400 }
      );
    }

    const outfit = createOutfit({
      name: body.name,
      description: body.description,
      modelId: body.modelId,
      scenePrompt: body.scenePrompt,
      garmentIds: ids,
    });

    return NextResponse.json({ outfit });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create outfit' },
      { status: 500 }
    );
  }
}
