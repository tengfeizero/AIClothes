'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ImagePlus,
  X,
  Loader2,
  Sparkles,
  MousePointer,
  Play,
  Rotate3D,
  AlertCircle,
  CheckCircle2,
  Camera,
} from 'lucide-react';
import { Spin360 } from '@/components/viewer/spin-360';
import { cacheImageUrl } from '@/lib/utils';

interface GenerationPlan {
  id: string;
  name: string;
  provider: string;
  model: string;
  price: number;
  calls: number;
  totalCost: number;
  resolution?: string;
}

interface TaskResult {
  glbUrl?: string;
  previewUrl?: string;
  taskType?: string;
}

const MAX_PHOTOS = 8;
const MIN_PHOTOS = 2;
const MODEL_VIEWER_CDN =
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

/** 单个视角上传格子 */
function PhotoSlot({
  url,
  onUploaded,
  onRemove,
}: {
  url: string | null;
  onUploaded: (url: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'garment');
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '上传失败');
      }
      const data = await res.json();
      onUploaded(data.url || data.path);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      {url ? (
        <>
          <img
            src={cacheImageUrl(url)}
            alt="视角图"
            className="w-full h-full object-cover rounded-xl border border-gray-200"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full h-full border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 hover:border-green-400 hover:bg-green-50/40 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          ) : (
            <ImagePlus className="w-5 h-5 text-gray-400" />
          )}
          <span className="text-[10px] text-gray-400">{uploading ? '上传中' : '添加'}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file).catch((err) => alert(err.message));
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** 加载 model-viewer Web Component（国内用 jsdelivr CDN） */
function useModelViewerScript() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    if ((window as unknown as { ModelViewer?: unknown }).ModelViewer) {
      setLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = MODEL_VIEWER_CDN;
    script.async = true;
    script.onload = () => setLoaded(true);
    script.onerror = () => setLoaded(false);
    document.head.appendChild(script);
  }, [loaded]);

  return loaded;
}

export default function Model3DPage() {
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null, null]);
  const [plan, setPlan] = useState<GenerationPlan | null>(null);

  // 生成状态
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<
    'idle' | 'submitting' | 'pending' | 'processing' | 'completed' | 'failed'
  >('idle');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [result, setResult] = useState<TaskResult | null>(null);

  const modelViewerReady = useModelViewerScript();

  const urls = photos.filter((p): p is string => !!p);
  const canGenerate = urls.length >= MIN_PHOTOS && taskStatus === 'idle';

  // 加载生成方案
  useEffect(() => {
    fetch('/api/outfit/generation-plans?purpose=model3d')
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => d.plans?.[0] && setPlan(d.plans[0]))
      .catch(() => undefined);
  }, []);

  // 轮询任务状态
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (!res.ok) return;
        const t = await res.json();
        if (cancelled) return;

        if (t.status === 'completed') {
          setTaskStatus('completed');
          setResult(t.result || {});
        } else if (t.status === 'failed') {
          setTaskStatus('failed');
          setTaskError(t.error || '生成失败');
        } else {
          setTaskStatus(t.status === 'processing' ? 'processing' : 'pending');
        }
      } catch {
        /* 网络抖动忽略，继续轮询 */
      }
    };

    poll();
    const timer = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [taskId]);

  const submit = async () => {
    if (!canGenerate) return;
    setTaskStatus('submitting');
    setTaskError(null);
    setResult(null);
    try {
      const res = await fetch('/api/3d/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrls: urls, planId: plan?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');
      setTaskId(data.taskId);
      setTaskStatus('pending');
    } catch (e) {
      setTaskStatus('failed');
      setTaskError(e instanceof Error ? e.message : '提交失败');
    }
  };

  const addSlot = () => {
    if (photos.length >= MAX_PHOTOS) return;
    setPhotos((p) => [...p, null]);
  };

  const removePhoto = (index: number) => {
    setPhotos((p) => {
      const next = [...p];
      next[index] = null;
      return next;
    });
  };

  const setPhoto = (index: number, url: string) => {
    setPhotos((p) => {
      const next = [...p];
      next[index] = url;
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 步骤 1：上传多视角照片 */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center">1</span>
          <h2 className="text-base font-semibold text-gray-900">上传多视角照片</h2>
          <span className="text-xs text-gray-400 ml-1">建议 2~8 张，围绕商品一周拍摄（正面 / 左侧 / 右侧 / 背面…）</span>
        </div>

        <div className="flex gap-3 flex-wrap">
          {photos.map((url, i) => (
            <PhotoSlot
              key={i}
              url={url}
              onUploaded={(u) => setPhoto(i, u)}
              onRemove={() => removePhoto(i)}
            />
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={addSlot}
              className="w-24 h-24 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              <Camera className="w-5 h-5" />
              <span className="text-[10px]">更多视角</span>
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          已上传 <strong className="text-gray-600">{urls.length}</strong>/{MAX_PHOTOS} 张，
          {urls.length < MIN_PHOTOS ? `至少需要 ${MIN_PHOTOS} 张` : '可以预览或生成 3D 模型'}
        </p>
      </section>

      {/* 步骤 2：A 方案 - 帧序列即时预览（免费） */}
      {urls.length >= 1 && (
        <section className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-6 h-6 bg-green-600 text-white text-xs font-bold rounded-full flex items-center justify-center">2</span>
            <h2 className="text-base font-semibold text-gray-900">即时预览（帧序列旋转）</h2>
            <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full">免费 · 无需 AI</span>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            按拍摄顺序轮播您的照片，鼠标拖拽或自动旋转查看各个角度。
            {urls.length < MIN_PHOTOS && <span className="text-amber-600 ml-1">多上传几张效果更佳。</span>}
          </p>
          <Spin360 images={urls} autoRotate={urls.length >= 3} height={420} />
        </section>
      )}

      {/* 步骤 3：B 方案 - 图生 3D 模型 */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 bg-purple-600 text-white text-xs font-bold rounded-full flex items-center justify-center">3</span>
          <h2 className="text-base font-semibold text-gray-900">生成 3D 模型（图生3D）</h2>
          <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
            {plan ? `腾讯混元生3D · ${plan.price.toFixed(2)} 元/次` : '腾讯混元生3D'}
          </span>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          基于多视角照片由 AI 重建可自由旋转缩放的真 3D 模型（GLB 格式），生成约需 2~5 分钟，完成后可拖动旋转查看。
        </p>

        {taskStatus === 'idle' && (
          <button
            type="button"
            onClick={submit}
            disabled={!canGenerate}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {canGenerate ? `生成 3D 模型（${plan ? plan.price.toFixed(2) : '3.60'} 元）` : `请先上传至少 ${MIN_PHOTOS} 张照片`}
          </button>
        )}

        {(taskStatus === 'submitting' || taskStatus === 'pending' || taskStatus === 'processing') && (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
            <span>
              {taskStatus === 'submitting'
                ? '正在提交生成任务...'
                : taskStatus === 'pending'
                  ? '排队中，等待 AI 生成...'
                  : 'AI 正在重建 3D 模型，预计 2~5 分钟，请稍候...'}
            </span>
            {taskId && <span className="text-xs text-gray-400">任务号：{taskId}</span>}
          </div>
        )}

        {taskStatus === 'failed' && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{taskError || '生成失败，请重试'}</span>
            <button
              type="button"
              onClick={() => setTaskStatus('idle')}
              className="ml-auto text-red-600 font-medium hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {taskStatus === 'completed' && result?.glbUrl && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              3D 模型生成完成，按住鼠标拖拽旋转、滚轮缩放查看
            </div>
            <div className="relative bg-gradient-to-b from-gray-100 to-gray-200 rounded-2xl overflow-hidden">
              {modelViewerReady ? (
                <model-viewer
                  src={result.glbUrl}
                  poster={result.previewUrl || undefined}
                  alt="商品 3D 模型"
                  camera-controls
                  auto-rotate
                  rotation-per-second="24deg"
                  shadow-intensity="1"
                  shadow-softness="0.8"
                  exposure="1"
                  style={{ width: '100%', height: 480 }}
                />
              ) : (
                <div className="w-full h-96 flex flex-col items-center justify-center gap-3 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-sm">正在加载 3D 查看器...</span>
                </div>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-white/90 text-xs bg-black/40 backdrop-blur rounded-full px-3 py-1 pointer-events-none">
                <MousePointer className="w-3.5 h-3.5" />
                拖拽旋转 · 滚轮缩放
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={result.glbUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white text-sm rounded-xl transition-colors"
              >
                <Rotate3D className="w-4 h-4" /> 下载 GLB 模型
              </a>
              {result.previewUrl && (
                <a
                  href={result.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-xl transition-colors"
                >
                  <Play className="w-4 h-4" /> 查看预览图
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 拍摄提示 */}
      <section className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-1.5">
          <Camera className="w-4 h-4" /> 拍摄建议
        </h3>
        <ul className="text-sm text-blue-800/80 space-y-1 list-disc list-inside">
          <li>同一件商品，围绕它一周拍 4~8 张，相邻照片角度间隔尽量均匀（约 45°）</li>
          <li>光线均匀，避免强反光与阴影遮挡；背景尽量干净、单一</li>
          <li>商品尽量置于画面中央，不要裁切边缘</li>
          <li>生成前可用上方的「即时预览」先查看拍摄顺序是否连贯</li>
        </ul>
      </section>

      <p className="text-xs text-gray-400 text-center">
        3D 模型由腾讯云混元生3D 生成，结果存储于 COS 公网地址，可分享给买家查看。
      </p>
    </div>
  );
}
