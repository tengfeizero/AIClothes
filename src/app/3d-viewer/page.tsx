'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Upload, Layers, MousePointer, Eye } from 'lucide-react';
import { ImageUpload } from '@/components/upload/image-upload';
import { MultiView3DViewer } from '@/components/viewer/multi-view-3d';
import { cacheImageUrl } from '@/lib/utils';
import type { OutfitWithGarments } from '@/types';

export default function Viewer3DPage() {
  const [activeTab, setActiveTab] = useState<'outfit' | 'flat'>('outfit');

  return (
    <div className="max-w-5xl mx-auto">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        <button
          onClick={() => setActiveTab('outfit')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'outfit'
              ? 'bg-white text-green-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="w-4 h-4" /> 穿搭方案3D
        </button>
        <button
          onClick={() => setActiveTab('flat')}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'flat'
              ? 'bg-white text-green-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MousePointer className="w-4 h-4" /> 平铺图3D效果
        </button>
      </div>

      {activeTab === 'outfit' ? <Outfit3DViewer /> : <FlatImage3DViewer />}
    </div>
  );
}

function Outfit3DViewer() {
  const [outfits, setOutfits] = useState<OutfitWithGarments[]>([]);
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitWithGarments | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/outfit')
      .then((r) => (r.ok ? r.json() : { outfits: [] }))
      .then((d) => {
        const completed = (d.outfits || []).filter(
          (o: OutfitWithGarments) => o.status === 'completed' && o.front_image_path
        );
        setOutfits(completed);
        if (completed.length > 0) setSelectedOutfit(completed[0]);
      })
      .finally(() => setLoading(false));
  }, []);

  // Manual upload mode
  const [frontImg, setFrontImg] = useState<string | null>(null);
  const [sideImg, setSideImg] = useState<string | null>(null);
  const [backImg, setBackImg] = useState<string | null>(null);
  const [useUpload, setUseUpload] = useState(false);

  if (loading) {
    return <div className="text-center py-12 text-gray-400">加载中...</div>;
  }

  const hasUploadImages = frontImg && sideImg && backImg;
  const displayFront = useUpload ? frontImg : selectedOutfit?.front_image_path;
  const displaySide = useUpload ? sideImg : selectedOutfit?.side_image_path;
  const displayBack = useUpload ? backImg : selectedOutfit?.back_image_path;

  return (
    <div className="space-y-6">
      {/* Source selector */}
      <div className="flex gap-2 items-center">
        <span className="text-sm text-gray-500">图片来源：</span>
        <button
          onClick={() => setUseUpload(false)}
          disabled={outfits.length === 0}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            !useUpload
              ? 'bg-green-100 text-green-700 font-medium'
              : 'text-gray-500 hover:bg-gray-100 disabled:opacity-40'
          }`}
        >
          已生成穿搭方案
        </button>
        <button
          onClick={() => setUseUpload(true)}
          className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
            useUpload
              ? 'bg-green-100 text-green-700 font-medium'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          上传三视图
        </button>
      </div>

      {!useUpload ? (
        outfits.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">暂无已完成的穿搭方案</h2>
            <p className="text-gray-500 text-sm mb-4">先去创建穿搭方案并生成三视图，即可360°旋转查看</p>
            <Link
              href="/outfit/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <Upload className="w-4 h-4" /> 创建穿搭方案
            </Link>
          </div>
        ) : (
          <>
            {/* Outfit selector */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">选择穿搭方案</h3>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {outfits.map((outfit) => (
                  <button
                    key={outfit.id}
                    onClick={() => setSelectedOutfit(outfit)}
                    className={`flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                      selectedOutfit?.id === outfit.id
                        ? 'border-green-500 ring-2 ring-green-100'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={cacheImageUrl(outfit.front_image_path!)}
                      alt={outfit.name}
                      className="w-16 h-20 object-cover"
                    />
                  </button>
                ))}
              </div>
              {selectedOutfit && (
                <p className="text-sm text-gray-600 mt-2">当前：<strong>{selectedOutfit.name}</strong></p>
              )}
            </div>

            {displayFront && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <MultiView3DViewer
                  frontImage={displayFront}
                  sideImage={displaySide}
                  backImage={displayBack}
                  autoRotate={true}
                  height={500}
                />
              </div>
            )}
          </>
        )
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">上传三张视角图片</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ImageUpload
                label="正面图"
                description="正面穿搭照"
                type="garment"
                value={frontImg}
                onChange={(path) => setFrontImg(path)}
              />
              <ImageUpload
                label="侧面图"
                description="侧面穿搭照"
                type="garment"
                value={sideImg}
                onChange={(path) => setSideImg(path)}
              />
              <ImageUpload
                label="背面图"
                description="背面穿搭照"
                type="garment"
                value={backImg}
                onChange={(path) => setBackImg(path)}
              />
            </div>
          </div>

          {hasUploadImages && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <MultiView3DViewer
                frontImage={frontImg!}
                sideImage={sideImg}
                backImage={backImg}
                autoRotate={true}
                height={500}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlatImage3DViewer() {
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;

    // Map mouse position to tilt degrees (max 15 degrees)
    const rotateY = (mouseX / (rect.width / 2)) * 15;
    const rotateX = -(mouseY / (rect.height / 2)) * 15;

    setTiltY(rotateY);
    setTiltX(rotateX);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTiltX(0);
    setTiltY(0);
    setIsHovering(false);
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">平铺图3D效果</h3>
        <p className="text-sm text-gray-500 mb-4">
          上传服装平铺图，鼠标悬停在图片上即可看到3D倾斜效果，模拟服装立体展示
        </p>
        <ImageUpload
          label="服装平铺图"
          description="上传一张服装平铺图，体验3D倾斜效果"
          type="garment"
          value={imagePath}
          onChange={(path) => setImagePath(path)}
        />
      </div>

      {imagePath && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="flex justify-center">
            <div
              ref={containerRef}
              className="relative overflow-hidden rounded-2xl cursor-pointer"
              style={{
                perspective: '1000px',
                width: '320px',
              }}
              onMouseMove={handleMouseMove}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={handleMouseLeave}
            >
              {/* Shadow */}
              <div
                className="absolute inset-0 rounded-2xl transition-all duration-200"
                style={{
                  transform: `translateY(20px) scale(0.9)`,
                  background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.3) 0%, transparent 70%)',
                  filter: 'blur(10px)',
                  opacity: isHovering ? 1 : 0.5,
                }}
              />
              {/* Image with 3D tilt */}
              <img
                src={cacheImageUrl(imagePath)}
                alt="3D平铺图"
                className="relative w-full rounded-2xl shadow-2xl transition-transform duration-100 ease-out"
                style={{
                  transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${isHovering ? 1.02 : 1})`,
                  transformStyle: 'preserve-3d',
                }}
                draggable={false}
              />
              {/* Shine effect */}
              <div
                className="absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-200"
                style={{
                  background: `linear-gradient(${135 + tiltY}deg, rgba(255,255,255,0) 0%, rgba(255,255,255,${isHovering ? 0.15 : 0}) 50%, rgba(255,255,255,0) 100%)`,
                }}
              />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-400">
            <Eye className="w-4 h-4" />
            <span>移动鼠标查看3D效果</span>
          </div>
        </div>
      )}
    </div>
  );
}
