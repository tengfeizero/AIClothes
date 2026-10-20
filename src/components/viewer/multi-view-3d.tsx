'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';

interface MultiView3DViewerProps {
  frontImage: string;
  sideImage?: string | null;
  backImage?: string | null;
  autoRotate?: boolean;
  showControls?: boolean;
  height?: number;
}

type ViewFace = {
  angle: number; // rotation Y in degrees
  image: string;
  label: string;
};

export function MultiView3DViewer({
  frontImage,
  sideImage,
  backImage,
  autoRotate = true,
  showControls = true,
  height = 480,
}: MultiView3DViewerProps) {
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(autoRotate);
  const startXRef = useRef(0);
  const startRotationRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  // Build faces array
  const faces: ViewFace[] = [];
  if (frontImage) {
    faces.push({ angle: 0, image: frontImage, label: '正面' });
  }
  if (sideImage) {
    faces.push({ angle: 90, image: sideImage, label: '侧面' });
  }
  if (backImage) {
    faces.push({ angle: 180, image: backImage, label: '背面' });
  }
  // If side exists, add it mirrored at -90/270 for full rotation
  if (sideImage) {
    faces.push({ angle: 270, image: sideImage, label: '侧面' });
  }

  const faceCount = faces.length;
  const radius = 400; // radius of the cylinder

  // Auto rotate animation
  useEffect(() => {
    if (!isAutoRotating || isDragging) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();
    const rotateSpeed = 15; // degrees per second

    const animate = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      setRotation((prev) => (prev + rotateSpeed * delta) % 360);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isAutoRotating, isDragging]);

  // Mouse drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setIsAutoRotating(false);
    startXRef.current = e.clientX;
    startRotationRef.current = rotation;
  }, [rotation]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - startXRef.current;
    // Sensitivity: 1px = 0.5 degrees
    const newRotation = startRotationRef.current - deltaX * 0.5;
    setRotation(newRotation);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    setIsAutoRotating(false);
    startXRef.current = e.touches[0].clientX;
    startRotationRef.current = rotation;
  }, [rotation]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;
    const deltaX = e.touches[0].clientX - startXRef.current;
    const newRotation = startRotationRef.current - deltaX * 0.5;
    setRotation(newRotation);
  }, [isDragging]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove]);

  const snapToFace = (targetAngle: number) => {
    // Normalize rotation to be close to target
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    let diff = targetAngle - normalizedRotation;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    setRotation(rotation + diff);
  };

  const rotateBy = (degrees: number) => {
    setIsAutoRotating(false);
    setRotation((prev) => prev + degrees);
  };

  return (
    <div className="w-full">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden bg-gradient-to-b from-gray-100 to-gray-200 rounded-2xl select-none cursor-grab active:cursor-grabbing"
        style={{ height, perspective: '1200px' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* 3D stage */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transformStyle: 'preserve-3d',
            transform: `translateZ(-${radius}px) rotateY(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          {faces.map((face, i) => {
            // Calculate position: distribute faces evenly around the cylinder
            // For 3 faces (front/side/back): angles at 0°, 120°, 240°
            // For 4 faces (front/side/back/side-mirrored): angles at 0°, 90°, 180°, 270°
            const angleStep = faceCount === 3 ? 120 : 90;
            const angle = i * angleStep;
            const isSide = face.label === '侧面';

            return (
              <div
                key={`${face.angle}-${i}`}
                className="absolute"
                style={{
                  width: faceCount === 3 ? '280px' : '260px',
                  height: faceCount === 3 ? '380px' : '360px',
                  transformStyle: 'preserve-3d',
                  transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                  backfaceVisibility: 'hidden',
                }}
              >
                <img
                  src={cacheImageUrl(face.image)}
                  alt={face.label}
                  className={`w-full h-full object-cover rounded-xl shadow-2xl border border-gray-300/50 ${
                    isSide && i === 3 ? 'scale-x-[-1]' : ''
                  }`}
                  draggable={false}
                />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full backdrop-blur-sm">
                  {face.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hint overlay */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-gray-500 bg-white/70 backdrop-blur px-3 py-1 rounded-full pointer-events-none">
          拖拽旋转 · 多角度查看
        </div>
      </div>

      {showControls && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => rotateBy(-45)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            title="向左旋转"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <button
            onClick={() => {
              setIsAutoRotating(!isAutoRotating);
              setIsDragging(false);
            }}
            className={`p-2 rounded-lg transition-colors ${
              isAutoRotating
                ? 'bg-green-100 text-green-600'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={isAutoRotating ? '暂停自动旋转' : '自动旋转'}
          >
            {isAutoRotating ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          <button
            onClick={() => {
              setRotation(0);
              setIsAutoRotating(false);
            }}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            title="回到正面"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={() => rotateBy(45)}
            className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            title="向右旋转"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          {/* Quick jump buttons */}
          <div className="w-px h-6 bg-gray-200 mx-1" />

          {faces.map((face, i) => {
            const angleStep = faceCount === 3 ? 120 : 90;
            const angle = i * angleStep;
            return (
              <button
                key={i}
                onClick={() => snapToFace(angle)}
                className="px-3 py-1 text-xs font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {face.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
