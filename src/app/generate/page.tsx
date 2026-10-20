'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Plus, X, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';
import type { GenerationPlan } from '@/types';

interface GenerateResult {
  taskId: string;
  status: string;
  progress: number;
  error?: string;
  resultImages?: string[];
}

export default function GeneratePage() {
  const [images, setImages] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('volcengine-jimeng-free');
  const [outputResolution, setOutputResolution] = useState<string>('2048x2048');
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetch('/api/outfit/generation-plans?purpose=generate')
      .then((r) => r.json())
      .then((data) => setPlans(data.plans || []))
      .catch(() => {});
  }, []);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const maxImages = selectedPlan?.maxImages || 4;

  // 切换模型时，分辨率默认取方案声明的默认档位（resolution 字段），否则取第一个选项
  useEffect(() => {
    if (selectedPlan?.resolutionOptions?.length) {
      const preferred = selectedPlan.resolutionOptions.find(
        (r) => `${r.width}x${r.height}` === (selectedPlan.resolution || '').replace('*', 'x')
      );
      const target = preferred || selectedPlan.resolutionOptions[0];
      setOutputResolution(target.width === 0 ? 'original' : `${target.width}x${target.height}`);
    }
  }, [selectedPlan?.id]);

  const pollTask = useCallback(async (id: string) => {
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/tasks/${id}`);
        if (!res.ok) continue;
        const data = await res.json();
        setProgress(data.progress || 0);

        if (data.status === 'completed') {
          const resultData = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          setGenerateResult({
            taskId: id,
            status: 'completed',
            progress: 100,
            resultImages: resultData?.images || [],
          });
          return;
        }
        if (data.status === 'failed') {
          setGenerateResult({
            taskId: id,
            status: 'failed',
            progress: 0,
            error: data.error || '生图失败',
          });
          return;
        }
      } catch { /* 继续轮询 */ }
    }
    setError('生图超时，请稍后在任务中心查看');
    setSubmitting(false);
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      setError('请输入提示词');
      return;
    }

    setSubmitting(true);
    setError('');
    setGenerateResult(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePaths: images,
          prompt: prompt.trim(),
          planId: selectedPlanId,
          outputResolution,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');

      setProgress(5);
      await pollTask(data.taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生图失败');
    } finally {
      setSubmitting(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (images.length >= maxImages) {
      setError(`当前模型最多支持 ${maxImages} 张参考图`);
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'garment');
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.path) {
        setImages((prev) => [...prev, data.path]);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError('图片上传失败');
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    for (const file of files.slice(0, maxImages - images.length)) {
      await uploadFile(file);
    }
  }, [images.length, maxImages]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files.slice(0, maxImages - images.length)) {
      await uploadFile(file);
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 pb-24">
        {/* 模型选择 */}
        {plans.length > 0 && (
          <div className="mb-4">
            <div className="text-[13px] font-medium text-gray-700 mb-2">选择模型</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => {
                    setSelectedPlanId(plan.id);
                    // 如果新模型限制更小，裁剪图片
                    const newMax = plan.maxImages || 4;
                    if (images.length > newMax) {
                      setImages((prev) => prev.slice(0, newMax));
                    }
                  }}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    selectedPlanId === plan.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-gray-800 truncate">{plan.name}</span>
                    <span className="text-[11px] font-semibold text-blue-600 ml-2 flex-shrink-0">{plan.totalCost}元</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{plan.provider} · 最多{plan.maxImages || 4}张参考图</div>
                </button>
              ))}
            </div>

            {/* 分辨率 */}
            {selectedPlan?.resolutionOptions && selectedPlan.resolutionOptions.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] font-medium text-gray-500 mb-1.5">输出分辨率</div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPlan.resolutionOptions.map((r, idx) => {
                    const value = r.width === 0 ? 'original' : `${r.width}x${r.height}`;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setOutputResolution(value)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                          outputResolution === value
                            ? 'border-blue-500 bg-blue-50 text-blue-600'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 参考图上传 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-gray-700">参考图（可选，最多{maxImages}张）</span>
            <span className="text-[11px] text-gray-400">{images.length}/{maxImages}</span>
          </div>

          {/* 已上传图片 */}
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              {images.map((img, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                  <Image src={cacheImageUrl(img)} alt={`参考图 ${index + 1}`} fill className="object-contain" unoptimized />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded-full text-[10px] text-white">
                    图{index + 1}
                  </div>
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 p-1 bg-white/90 rounded-full shadow-sm hover:bg-white"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 上传按钮 */}
          {images.length < maxImages && (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <Plus className="w-6 h-6 text-gray-400" />
                <span className="text-[12px] text-gray-500">点击或拖拽添加参考图</span>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* 提示词 */}
        <div className="mb-4">
          <div className="text-[13px] font-medium text-gray-700 mb-2">提示词（必填）</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={`描述你想生成的内容，例如：\n让图1的人物，穿上图2中的衣服，摆着图3中的姿势在图4的场景中\n\n图1/图2/图3/图4 对应上方上传的参考图顺序`}
            className="w-full h-32 px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none placeholder:text-gray-400"
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-xl text-[13px] text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 进度条 */}
        {submitting && !generateResult && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-[13px] font-medium text-blue-700">AI 生图中...</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <div className="text-[11px] text-blue-500 mt-1 text-right">{progress}%</div>
          </div>
        )}

        {/* 生成结果 */}
        {generateResult && generateResult.status === 'completed' && generateResult.resultImages && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-[13px] font-medium text-green-700">生图完成</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {generateResult.resultImages.map((img, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                  <Image src={cacheImageUrl(img)} alt={`结果 ${index + 1}`} fill className="object-contain" unoptimized />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !prompt.trim()}
          className="w-full py-3 bg-blue-500 text-white rounded-xl font-medium text-[14px] flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>生图中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>开始生图 {selectedPlan ? `(${selectedPlan.totalCost}元)` : ''}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
