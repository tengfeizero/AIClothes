'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCw, RotateCcw, Pause, Play } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';

interface Spin360Props {
  /** 按拍摄顺序排列的多视角图片 URL（front → left → right → back ...） */
  images: string[];
  /** 容器高度，默认 420 */
  height?: number;
  /** 默认是否自动旋转 */
  autoRotate?: boolean;
}

/** 拖拽滑动的像素数 = 切换一帧 */
const FRAME_STEP_PX = 40;
/** 自动旋转每帧间隔 ms */
const AUTO_ROTATE_MS = 120;

/**
 * 360° 帧序列查看器（A 方案，无需 AI 调用）：
 * 按顺序轮播用户拍摄的多视角照片，鼠标/手指左右拖拽旋转，也可自动播放。
 */
export function Spin360({ images, height = 420, autoRotate = false }: Spin360Props) {
  const n = images.length;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(autoRotate);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 拖拽状态
  const dragRef = useRef<{ startX: number; startFrame: number } | null>(null);

  const goTo = useCallback((index: number) => {
    setFrame(((index % n) + n) % n);
  }, [n]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (n < 2) return;
    dragRef.current = { startX: e.clientX, startFrame: frame };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [n, frame]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || n < 2) return;
    const dx = e.clientX - dragRef.current.startX;
    const offset = Math.round(dx / FRAME_STEP_PX);
    goTo(dragRef.current.startFrame + offset);
  }, [n, goTo]);

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    setDragging(false);
  }, []);

  // 自动旋转
  useEffect(() => {
    if (!playing || dragging || n < 2) return;
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % n);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, [playing, dragging, n]);

  if (n === 0) return null;

  return (
    <div className="select-none">
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-2xl bg-gradient-to-b from-gray-100 to-gray-200 ${
          n >= 2 ? 'cursor-grab active:cursor-grabbing touch-pan-y' : ''
        }`}
        style={{ height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerLeave={stopDrag}
      >
        {/* 帧序列交叉淡入 */}
        {images.map((src, i) => (
          <img
            key={src}
            src={cacheImageUrl(src)}
            alt={`视角 ${i + 1}`}
            draggable={false}
            className={`absolute inset-0 w-full h-full object-contain p-4 transition-opacity duration-150 ${
              i === frame ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))}

        {/* 顶栏：帧序号 + 播放控制 */}
        {n >= 2 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/50 text-white text-xs backdrop-blur hover:bg-black/70 transition-colors"
            >
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {playing ? '暂停' : '自动旋转'}
            </button>
          </div>
        )}

        {/* 帧进度 */}
        {n >= 2 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/40 backdrop-blur rounded-full px-3 py-1">
            {images.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === frame ? 'bg-white w-3' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        )}

        {/* 拖拽提示 */}
        {n >= 2 && !dragging && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-white/80 text-xs bg-black/30 rounded-full px-3 py-1 backdrop-blur pointer-events-none">
            <RotateCw className="w-3.5 h-3.5" />
            按住拖拽旋转
            <RotateCcw className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 text-center mt-2">
        {n >= 2 ? `共 ${n} 个视角，当前 ${frame + 1}/${n}` : '单张图片仅静态展示'}
      </p>
    </div>
  );
}
