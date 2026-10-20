import type { Garment } from '@/types';

const CANVAS_SIZE = 1024;
const PADDING = 40;
const BG_COLOR = '#fafafa';
const HEADER_HEIGHT = 80;
const TITLE_COLOR = '#1f2937';
const ITEM_GAP = 16;

const CATEGORY_LABELS: Record<string, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  accessories: '配饰',
  shoes: '鞋履',
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const scale = Math.min(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
}

export interface ItemListInput {
  outfitName: string;
  items: Array<{
    imageUrl: string;
    name: string;
    category: string;
  }>;
}

export async function generateItemListImage(input: ItemListInput): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Title
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('单品清单', CANVAS_SIZE / 2, PADDING + 32);

  ctx.fillStyle = '#6b7280';
  ctx.font = '18px system-ui, -apple-system, sans-serif';
  ctx.fillText(input.outfitName, CANVAS_SIZE / 2, PADDING + 60);

  // Items grid
  const contentTop = PADDING + HEADER_HEIGHT;
  const contentWidth = CANVAS_SIZE - PADDING * 2;
  const contentHeight = CANVAS_SIZE - contentTop - PADDING;

  const itemCount = Math.min(input.items.length, 4);
  const cols = itemCount <= 2 ? itemCount : 2;
  const rows = Math.ceil(itemCount / cols);
  const cellW = (contentWidth - ITEM_GAP * (cols - 1)) / cols;
  const cellH = (contentHeight - ITEM_GAP * (rows - 1)) / rows;

  // Load all images
  const loadedImages = await Promise.all(
    input.items.slice(0, 4).map((item) => loadImage(item.imageUrl).catch(() => null))
  );

  for (let i = 0; i < itemCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PADDING + col * (cellW + ITEM_GAP);
    const y = contentTop + row * (cellH + ITEM_GAP);

    // Card background
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, cellW, cellH, 16);
    ctx.fill();

    const img = loadedImages[i];
    if (img) {
      const imgAreaH = cellH - 50;
      fitImage(ctx, img, x + 10, y + 10, cellW - 20, imgAreaH - 10);

      // Label
      ctx.fillStyle = TITLE_COLOR;
      ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      const item = input.items[i];
      const label = `${CATEGORY_LABELS[item.category] || item.category}`;
      ctx.fillStyle = '#9333ea';
      ctx.fillText(label, x + cellW / 2, y + cellH - 28);

      ctx.fillStyle = '#4b5563';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      const displayName = item.name.length > 8 ? item.name.slice(0, 8) + '...' : item.name;
      ctx.fillText(displayName, x + cellW / 2, y + cellH - 8);
    }
  }

  // Brand watermark
  ctx.fillStyle = '#d1d5db';
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('AI Clothes', CANVAS_SIZE - PADDING, CANVAS_SIZE - PADDING / 2);

  return canvas.toDataURL('image/jpeg', 0.9);
}
