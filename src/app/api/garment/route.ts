import { NextRequest, NextResponse } from 'next/server';
import { createGarment, listGarments, deleteGarment } from '@/lib/db/garment-store';
import type { GarmentCategory } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') as GarmentCategory | null;
    const garments = listGarments(category || undefined);
    return NextResponse.json({ garments });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list garments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.category || !body.imagePath) {
      return NextResponse.json(
        { error: 'name, category, and imagePath are required' },
        { status: 400 }
      );
    }

    const garment = createGarment({
      name: body.name,
      category: body.category,
      imagePath: body.imagePath,
      color: body.color,
      tags: body.tags,
    });

    return NextResponse.json({ garment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create garment' },
      { status: 500 }
    );
  }
}
