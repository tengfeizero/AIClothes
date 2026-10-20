import sharp from 'sharp';
import { downloadImageAsBuffer } from '@/lib/storage/cos';
import type { GarmentCategory } from '@/types';

const TARGET_WIDTH = 400;
const PADDING = 16;
const GAP = 12;

// 平铺顺序：上衣 → 连衣裙 → 下装 → 鞋 → 配饰
const CATEGORY_ORDER: Record<GarmentCategory, number> = {
  top: 0,
  dress: 1,
  bottom: 2,
  shoes: 3,
  accessories: 4,
};

function resolveImageUrl(imagePath: string): string {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  // 相对路径（旧数据格式 /uploads/xxx）：拼接COS公网地址
  const cosUrl = process.env.TENCENT_COS_PUBLIC_URL;
  if (cosUrl && (imagePath.startsWith('/uploads/') || imagePath.startsWith('uploads/'))) {
    return `${cosUrl}/${imagePath.replace(/^\//, '')}`;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

export interface CollageItem {
  imagePath: string;
  category: GarmentCategory;
}

/**
 * 把所有单品拼成一张"服装平铺图"（白底竖排），作为 AI 试衣的 garment 输入，
 * 让模特一次穿上整套搭配，每个视角只需 1 次 AI 调用。
 * 单件时直接返回原图处理结果，不做拼接。
 */
export async function createGarmentCollage(items: CollageItem[]): Promise<Buffer> {
  // 单件：直接返回原图（仅纠偏EXIF、转JPEG）
  if (items.length === 1) {
    const buf = await downloadImageAsBuffer(resolveImageUrl(items[0].imagePath));
    return sharp(buf).rotate().jpeg({ quality: 90 }).toBuffer();
  }

  // 按类型排序后逐张等比缩放到统一宽度
  const sorted = [...items].sort((a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]);

  const layers: { input: Buffer; width: number; height: number }[] = [];
  for (const item of sorted) {
    const buf = await downloadImageAsBuffer(resolveImageUrl(item.imagePath));
    const { data, info } = await sharp(buf)
      .rotate()
      .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    layers.push({ input: data, width: info.width, height: info.height });
  }

  const canvasWidth = TARGET_WIDTH + PADDING * 2;
  const totalHeight =
    PADDING * 2 + layers.reduce((sum, l) => sum + l.height, 0) + GAP * (layers.length - 1);

  const composite = layers.map((layer, index) => {
    const top =
      PADDING + layers.slice(0, index).reduce((sum, l) => sum + l.height + GAP, 0);
    return {
      input: layer.input,
      left: Math.round((canvasWidth - layer.width) / 2),
      top,
    };
  });

  const base = sharp({
    create: {
      width: canvasWidth,
      height: totalHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  });

  return base.composite(composite).jpeg({ quality: 90 }).toBuffer();
}
