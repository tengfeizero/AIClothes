import type { LayoutCell, LayoutPreset } from '@/components/editor/outfit-editor';

const EXPORT_SIZE = 2048; // Output canvas size (2K)
const GAP = 24;
const PADDING = 40;
const BG_COLOR = '#ffffff';
const LABEL_BG = 'rgba(0,0,0,0.6)';
const LABEL_COLOR = '#ffffff';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number = 16
) {
  ctx.save();
  // Rounded rect clip
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();

  // Cover: fill entire area, center crop
  const scale = Math.max(w / img.width, h / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const labelPaddingX = 16;
  const labelPaddingY = 8;
  const fontSize = 22;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;

  const textWidth = ctx.measureText(text).width;
  const labelW = textWidth + labelPaddingX * 2;
  const labelH = fontSize + labelPaddingY * 2;
  const labelX = x + 16;
  const labelY = y + h - labelH - 16;

  ctx.save();
  ctx.fillStyle = LABEL_BG;
  ctx.beginPath();
  ctx.roundRect(labelX, labelY, labelW, labelH, labelH / 2);
  ctx.fill();

  ctx.fillStyle = LABEL_COLOR;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, labelX + labelPaddingX, labelY + labelH / 2 + 1);
  ctx.restore();
}

function applyPresetLayout(cells: LayoutCell[], preset: LayoutPreset) {
  // Compute cell positions for export
  const contentSize = EXPORT_SIZE - PADDING * 2;
  const positions: Array<{ x: number; y: number; w: number; h: number }> = [];

  const halfGap = GAP / 2;

  if (preset === '2x2') {
    const cellSize = (contentSize - GAP) / 2;
    const positions2x2 = [
      { x: 0, y: 0 },
      { x: cellSize + GAP, y: 0 },
      { x: 0, y: cellSize + GAP },
      { x: cellSize + GAP, y: cellSize + GAP },
    ];
    for (let i = 0; i < Math.min(cells.length, 4); i++) {
      positions.push({
        x: PADDING + positions2x2[i].x,
        y: PADDING + positions2x2[i].y,
        w: cellSize,
        h: cellSize,
      });
    }
  } else if (preset === 'left-big') {
    const smallW = (contentSize - GAP) / 2;
    const smallH = (contentSize - GAP) / 2;
    positions.push({ x: PADDING, y: PADDING, w: smallW, h: contentSize }); // big left
    positions.push({ x: PADDING + smallW + GAP, y: PADDING, w: smallW, h: smallH }); // top right
    positions.push({ x: PADDING + smallW + GAP, y: PADDING + smallH + GAP, w: smallW, h: smallH }); // bottom right
    if (cells[3]) {
      positions.push({ x: PADDING + smallW + GAP, y: PADDING, w: smallW, h: smallH }); // fallback
    }
  } else if (preset === 'top-big') {
    const smallW = (contentSize - GAP) / 2;
    const smallH = (contentSize - GAP) / 2;
    positions.push({ x: PADDING, y: PADDING, w: contentSize, h: smallH }); // big top
    positions.push({ x: PADDING, y: PADDING + smallH + GAP, w: smallW, h: smallH }); // bottom left
    positions.push({ x: PADDING + smallW + GAP, y: PADDING + smallH + GAP, w: smallW, h: smallH }); // bottom right
    if (cells[3]) {
      positions.push({ x: PADDING, y: PADDING + smallH + GAP, w: smallW, h: smallH }); // fallback
    }
  }

  return positions;
}

export interface ExportOptions {
  cells: LayoutCell[];
  preset: LayoutPreset;
  title?: string;
  showLabels?: boolean;
  filename?: string;
}

export async function exportOutfitImage(options: ExportOptions): Promise<void> {
  const { cells, preset, title, showLabels = true, filename = 'outfit-plan' } = options;

  // Calculate canvas size
  let canvasW = EXPORT_SIZE;
  let canvasH = EXPORT_SIZE;
  let titleOffset = 0;

  if (title) {
    titleOffset = 80;
    canvasH += titleOffset;
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Background
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Title
  if (title) {
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 40px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, canvasW / 2, PADDING + 20);
  }

  // Load all images
  const images = await Promise.all(
    cells.map((cell) => loadImage(cell.imageSrc).catch(() => null))
  );

  // Get positions
  const positions = applyPresetLayout(cells, preset);

  // Draw cells
  for (let i = 0; i < Math.min(cells.length, positions.length); i++) {
    const img = images[i];
    const pos = positions[i];
    // Adjust y for title offset
    const drawY = pos.y + titleOffset;

    // White card background
    ctx.fillStyle = '#f9fafb';
    ctx.beginPath();
    ctx.roundRect(pos.x, drawY, pos.w, pos.h, 16);
    ctx.fill();

    if (img) {
      fitImageCover(ctx, img, pos.x, drawY, pos.w, pos.h, 16);
    }

    if (showLabels) {
      drawLabel(ctx, cells[i].label, pos.x, drawY, pos.w, pos.h);
    }
  }

  // Watermark
  ctx.fillStyle = '#d1d5db';
  ctx.font = '20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('AI Clothes', canvasW - PADDING, canvasH - PADDING / 2);

  // Trigger download
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const link = document.createElement('a');
  link.download = `${filename.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '-')}-${Date.now()}.jpg`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
