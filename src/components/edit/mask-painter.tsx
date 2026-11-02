'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { RotateCcw, Trash2 } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';

/** 涂抹区域的外接框：相对原图的归一化比例（0~1），与后端保持同一套坐标 */
export interface EditRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 涂抹结果：外接框 + 与原图同尺寸的黑白掩膜（白色代表要修改的区域） */
export interface EditMask {
  region: EditRegion;
  maskDataUrl: string;
}

interface Stroke {
  /** 归一化坐标点（0~1） */
  points: { x: number; y: number }[];
  /** 画笔半径，按图片宽度归一化 */
  radius: number;
}

interface MaskPainterProps {
  src: string;
  value: EditMask | null;
  onChange: (mask: EditMask | null) => void;
}

/** 掩膜画布最长边上限，避免超大原图导出过大的 PNG */
const MAX_MASK_SIDE = 2048;
/** 外接框向外扩展的留白（归一化），给厂商编辑保留上下文 */
const REGION_PADDING = 0.02;

/** 在图片上涂抹要修改的区域，返回掩膜与外接框 */
export function MaskPainter({ src, onChange }: MaskPainterProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);

  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [brushSize, setBrushSize] = useState(24);
  const brushSizeRef = useRef(brushSize);
  const [hasStroke, setHasStroke] = useState(false);

  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);

  // 容器尺寸变化时重新计算图片实际显示区域
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 图片以 object-contain 显示，需要扣除上下/左右留白
  const getLayout = useCallback(() => {
    if (!natural || size.width === 0 || size.height === 0) return null;
    const scale = Math.min(size.width / natural.width, size.height / natural.height);
    const displayWidth = natural.width * scale;
    const displayHeight = natural.height * scale;
    return {
      offsetX: (size.width - displayWidth) / 2,
      offsetY: (size.height - displayHeight) / 2,
      displayWidth,
      displayHeight,
    };
  }, [natural, size]);

  // 原图尺寸确定后创建掩膜画布（黑底，白色笔画代表要修改的区域）
  useEffect(() => {
    if (!natural) return;
    const scale = Math.min(1, MAX_MASK_SIDE / Math.max(natural.width, natural.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(natural.width * scale));
    canvas.height = Math.max(1, Math.round(natural.height * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    maskCanvasRef.current = canvas;
    strokesRef.current = [];
    drawingRef.current = null;
    setHasStroke(false);
    onChange(null);
    // 仅在原图变化时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural]);

  // 画布尺寸变化时重绘预览
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size.width;
    canvas.height = size.height;
    redrawPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, natural]);

  const pointerToNorm = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    const layout = getLayout();
    if (!el || !layout) return null;
    const rect = el.getBoundingClientRect();
    const x =
      Math.min(Math.max(clientX - rect.left - layout.offsetX, 0), layout.displayWidth) /
      layout.displayWidth;
    const y =
      Math.min(Math.max(clientY - rect.top - layout.offsetY, 0), layout.displayHeight) /
      layout.displayHeight;
    return { x, y };
  };

  const paintDot = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string
  ) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const paintSegment = (
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    radius: number,
    color: string
  ) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = radius * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  /** 把一笔画到预览画布与掩膜画布（可选只画最新的线段） */
  const paintStroke = (stroke: Stroke, points: { x: number; y: number }[]) => {
    const preview = canvasRef.current;
    const mask = maskCanvasRef.current;
    const layout = getLayout();
    if (!preview || !layout) return;

    const previewCtx = preview.getContext('2d');
    const maskCtx = mask?.getContext('2d') || null;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const prev = i > 0 ? points[i - 1] : null;
      if (previewCtx) {
        const px = layout.offsetX + point.x * layout.displayWidth;
        const py = layout.offsetY + point.y * layout.displayHeight;
        const radius = stroke.radius * layout.displayWidth;
        if (prev) {
          paintSegment(
            previewCtx,
            {
              x: layout.offsetX + prev.x * layout.displayWidth,
              y: layout.offsetY + prev.y * layout.displayHeight,
            },
            { x: px, y: py },
            radius,
            'rgba(59,130,246,0.45)'
          );
        } else {
          paintDot(previewCtx, px, py, radius, 'rgba(59,130,246,0.45)');
        }
      }
      if (maskCtx && mask) {
        const mx = point.x * mask.width;
        const my = point.y * mask.height;
        const radius = stroke.radius * mask.width;
        if (prev) {
          paintSegment(maskCtx, { x: prev.x * mask.width, y: prev.y * mask.height }, { x: mx, y: my }, radius, '#ffffff');
        } else {
          paintDot(maskCtx, mx, my, radius, '#ffffff');
        }
      }
    }
  };

  function redrawPreview() {
    const canvas = canvasRef.current;
    const layout = getLayout();
    if (!canvas || !layout) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokesRef.current) {
      paintStroke(stroke, stroke.points);
    }
  }

  function redrawMask() {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, mask.width, mask.height);
    for (const stroke of strokesRef.current) {
      const points = stroke.points;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const prev = i > 0 ? points[i - 1] : null;
        const mx = point.x * mask.width;
        const my = point.y * mask.height;
        const radius = stroke.radius * mask.width;
        if (prev) {
          paintSegment(ctx, { x: prev.x * mask.width, y: prev.y * mask.height }, { x: mx, y: my }, radius, '#ffffff');
        } else {
          paintDot(ctx, mx, my, radius, '#ffffff');
        }
      }
    }
  }

  /** 计算涂抹区域的外接框并导出掩膜 */
  const emit = () => {
    const strokes = strokesRef.current;
    if (!strokes.length) {
      onChange(null);
      return;
    }

    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const stroke of strokes) {
      for (const point of stroke.points) {
        minX = Math.min(minX, point.x - stroke.radius);
        minY = Math.min(minY, point.y - stroke.radius);
        maxX = Math.max(maxX, point.x + stroke.radius);
        maxY = Math.max(maxY, point.y + stroke.radius);
      }
    }

    const x = Math.max(0, minX - REGION_PADDING);
    const y = Math.max(0, minY - REGION_PADDING);
    const width = Math.min(1, maxX + REGION_PADDING) - x;
    const height = Math.min(1, maxY + REGION_PADDING) - y;
    const mask = maskCanvasRef.current;
    if (!mask || width < 0.01 || height < 0.01) {
      onChange(null);
      return;
    }

    onChange({
      region: { x, y, width, height },
      maskDataUrl: mask.toDataURL('image/png'),
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!natural) return;
    const layout = getLayout();
    const point = pointerToNorm(e.clientX, e.clientY);
    if (!layout || !point) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Stroke = {
      points: [point],
      radius: Math.max(0.002, brushSizeRef.current / 2 / layout.displayWidth),
    };
    strokesRef.current.push(stroke);
    drawingRef.current = stroke;
    paintStroke(stroke, [point]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    const point = pointerToNorm(e.clientX, e.clientY);
    if (!point) return;
    const stroke = drawingRef.current;
    const prev = stroke.points[stroke.points.length - 1];
    if (!prev || (Math.abs(prev.x - point.x) < 1e-4 && Math.abs(prev.y - point.y) < 1e-4)) return;
    stroke.points.push(point);
    paintStroke(stroke, [prev, point]);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!drawingRef.current) return;
    drawingRef.current = null;
    setHasStroke(true);
    emit();
  };

  const handleUndo = () => {
    if (!strokesRef.current.length) return;
    strokesRef.current.pop();
    redrawPreview();
    redrawMask();
    const empty = strokesRef.current.length === 0;
    setHasStroke(!empty);
    emit();
  };

  const handleClear = () => {
    strokesRef.current = [];
    drawingRef.current = null;
    redrawPreview();
    redrawMask();
    setHasStroke(false);
    onChange(null);
  };

  return (
    <div>
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative w-full h-80 rounded-xl overflow-hidden bg-gray-50 border border-gray-100 touch-none cursor-crosshair select-none"
      >
        <Image
          src={cacheImageUrl(src)}
          alt="待编辑原图"
          fill
          className="object-contain pointer-events-none"
          draggable={false}
          unoptimized
          onLoad={(e) =>
            setNatural({
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            })
          }
        />

        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {!hasStroke && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="px-3 py-1.5 rounded-full bg-black/50 text-[11px] text-white">
              在图片上涂抹要修改的区域
            </span>
          </div>
        )}
      </div>

      {/* 画笔工具 */}
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[11px] text-gray-500 flex-shrink-0">画笔</span>
        <input
          type="range"
          min={6}
          max={60}
          step={2}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="flex-1 h-1 accent-blue-500"
        />
        <span className="text-[11px] text-gray-400 w-8 text-right flex-shrink-0">{brushSize}</span>
        <button
          type="button"
          onClick={handleUndo}
          disabled={!hasStroke}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-600 disabled:text-gray-300 transition-colors flex-shrink-0"
        >
          <RotateCcw className="w-3 h-3" />
          撤销
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasStroke}
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 disabled:text-gray-300 transition-colors flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
          清除
        </button>
      </div>
    </div>
  );
}
