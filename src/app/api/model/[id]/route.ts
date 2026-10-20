import { NextRequest, NextResponse } from 'next/server';
import { getModel, setDefaultModel, deleteModel } from '@/lib/db/model-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const model = getModel(params.id);
    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    return NextResponse.json({ model });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get model' },
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
    const model = getModel(params.id);

    if (!model) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }

    if (body.setDefault) {
      const updated = setDefaultModel(params.id);
      return NextResponse.json({ model: updated });
    }

    return NextResponse.json({ model });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update model' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ok = deleteModel(params.id);
    if (!ok) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete model' },
      { status: 500 }
    );
  }
}
