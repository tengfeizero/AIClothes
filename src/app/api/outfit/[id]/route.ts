import { NextRequest, NextResponse } from 'next/server';
import { getOutfit, updateOutfit, deleteOutfit } from '@/lib/db/outfit-store';
import { listGenerationsByOutfit } from '@/lib/db/generation-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const outfit = getOutfit(params.id);
    if (!outfit) {
      return NextResponse.json({ error: 'Outfit not found' }, { status: 404 });
    }
    // 附带该方案的生成历史记录（含厂商/模型/费用/图片）
    const generations = listGenerationsByOutfit(params.id);
    return NextResponse.json({ outfit, generations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get outfit' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const outfit = getOutfit(params.id);

    if (!outfit) {
      return NextResponse.json({ error: 'Outfit not found' }, { status: 404 });
    }

    const updated = updateOutfit(params.id, {
      name: body.name,
      description: body.description,
      modelId: body.modelId,
      scenePrompt: body.scenePrompt,
      status: body.status,
      frontImagePath: body.frontImagePath,
      sideImagePath: body.sideImagePath,
      backImagePath: body.backImagePath,
      itemListImagePath: body.itemListImagePath,
    });

    return NextResponse.json({ outfit: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update outfit' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ok = deleteOutfit(params.id);
    if (!ok) {
      return NextResponse.json({ error: 'Outfit not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete outfit' },
      { status: 500 }
    );
  }
}
