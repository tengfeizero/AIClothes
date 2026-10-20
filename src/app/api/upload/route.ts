import { NextRequest, NextResponse } from 'next/server';
import { saveUploadedFile } from '@/lib/storage/cos';
import { isImageFile } from '@/lib/utils/file';
import type { UploadType } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as string || 'garment') as UploadType;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!isImageFile(file.name)) {
      return NextResponse.json({ error: 'File must be an image (jpg, jpeg, png, webp, gif, bmp)' }, { status: 400 });
    }

    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760', 10);
    if (file.size > maxSize) {
      return NextResponse.json({ error: `File size exceeds limit (${Math.round(maxSize / 1024 / 1024)}MB)` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveUploadedFile({
      type,
      filename: file.name,
      buffer,
    });

    return NextResponse.json({
      id: saved.id,
      path: saved.url,
      url: saved.url,
      filename: file.name,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
