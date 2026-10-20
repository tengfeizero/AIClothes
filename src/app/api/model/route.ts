import { NextRequest, NextResponse } from 'next/server';
import {
  createModel,
  listModels,
  getModel,
  setDefaultModel,
  deleteModel,
} from '@/lib/db/model-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const models = listModels();
    const defaultModel = models.find((m) => m.is_default) || null;
    return NextResponse.json({ models, defaultModel });
  } catch (error) {
    console.error('List models error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list models' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.identityImagePath) {
      return NextResponse.json(
        { error: 'name and identityImagePath are required' },
        { status: 400 }
      );
    }

    const model = createModel({
      name: body.name,
      identityImagePath: body.identityImagePath,
      avatarPath: body.avatarPath,
      gender: body.gender || 'female',
    });

    return NextResponse.json({ model });
  } catch (error) {
    console.error('Create model error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create model' },
      { status: 500 }
    );
  }
}
