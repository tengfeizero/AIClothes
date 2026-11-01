import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { saveUploadedFile } from '@/lib/storage/cos';
import { isImageFile } from '@/lib/utils/file';
import type { UploadType } from '@/types';

export const dynamic = 'force-dynamic';

/** 上传图片的最大宽高（等比缩放，不超过 1920px） */
const MAX_IMAGE_DIMENSION = 1920;

/**
 * 自动处理上传图片：按比例缩放到最大 1920px（不放大、不形变），
 * 同时按 EXIF 方向自动旋转。无法解析的图片保持原样。
 */
async function normalizeImage(buffer: Buffer): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height) return buffer;
    if (Math.max(metadata.width, metadata.height) <= MAX_IMAGE_DIMENSION) return buffer;

    return await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();
  } catch (error) {
    console.warn('[Upload] 图片缩放失败，使用原图:', error);
    return buffer;
  }
}

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

    const original = Buffer.from(await file.arrayBuffer());
    const buffer = await normalizeImage(original);
    const saved = await saveUploadedFile({
      type,
      filename: file.name,
      buffer,
    });

    return NextResponse.json({
      id: saved.id,
      path: saved.url,
      url: saved.url,
      // 本地文件路径（/uploads/<type>/<id>.<ext>），素材中心据此记录元数据
      publicPath: saved.publicPath,
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
