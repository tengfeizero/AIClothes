'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { Sparkles, Loader2, AlertCircle, CheckCircle2, Wand2 } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';
import type { GenerationPlan } from '@/types';

interface EditResult {
  taskId: string;
  status: string;
  progress: number;
  error?: string;
  resultImages?: string[];
}

const QUICK_PROMPTS = [
  '把衣服改成粉色',
  '把衣服改成蓝色',
  '添加一条项链',
  '背景换成海边',
  '背景换成花园',
  '改成漫画风格',
  '让她微笑',
  '把头发改成金色',
];

export default function EditPage() {
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [scale, setScale] = useState(0.5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('volcengine-seedit-v3');
  const [editResult, setEditResult] = useState<EditResult | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    fetch('/api/outfit/generation-plans?purpose=edit')
      .then((r) => r.json())
      .then((data) => {
        setPlans(data.plans || []);
      })
      .catch(() => {});
  }, []);

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
          setEditResult({
            taskId: id,
            status: 'completed',
            progress: 100,
            resultImages: resultData?.images || [],
          });
          return;
        }
        if (data.status === 'failed') {
          setEditResult({
            taskId: id,
            status: 'failed',
            progress: 0,
            error: data.error || '编辑失败',
          });
          return;
        }
      } catch {
        // 继续轮询
      }
    }
    setError('编辑超时，请稍后在任务中心查看');
    setSubmitting(false);
  }, []);

  const handleSubmit = async () => {
    if (!inputImage) {
      setError('请先上传一张图片');
      return;
    }
    if (!prompt.trim()) {
      setError('请输入编辑指令');
      return;
    }

    setSubmitting(true);
    setError('');
    setEditResult(null);

    try {
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentImagePath: inputImage,
          prompt: prompt.trim(),
          scale,
          planId: selectedPlanId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '提交失败');

      setTaskId(data.taskId);
      setProgress(5);
      await pollTask(data.taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : '编辑失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await uploadFile(file);
  }, []);

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'garment');

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.path) {
        setInputImage(data.path);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError('图片上传失败');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 pb-24">
        {/* 图片上传区域 */}
        <div className="mb-4">
          <div className="text-[13px] font-medium text-gray-700 mb-2">原图</div>
          {inputImage ? (
            <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-gray-50 border border-gray-100">
              <Image src={cacheImageUrl(inputImage)} alt="Input" fill className="object-contain" unoptimized />
              <button
                onClick={() => setInputImage(null)}
                className="absolute top-2 right-2 p-1.5 bg-white/90 rounded-full shadow-sm hover:bg-white text-gray-500"
              >
                <AlertCircle className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center w-full aspect-square rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
                dragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
              }`}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <Wand2 className="w-6 h-6 text-gray-400" />
                </div>
                <span className="text-[13px] text-gray-500">点击或拖拽上传图片</span>
                <span className="text-[11px] text-gray-400">支持 JPG、PNG 格式</span>
              </div>
              <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            </label>
          )}
        </div>

        {/* 编辑指令 */}
        <div className="mb-4">
          <div className="text-[13px] font-medium text-gray-700 mb-2">编辑指令</div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要的编辑效果，如：把衣服改成粉色"
            className="w-full h-24 px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none placeholder:text-gray-400"
          />
          {/* 快捷指令 */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {QUICK_PROMPTS.map((qp) => (
              <button
                key={qp}
                onClick={() => setPrompt(qp)}
                className="px-2.5 py-1 text-[11px] bg-gray-50 text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              >
                {qp}
              </button>
            ))}
          </div>
        </div>

        {/* 编辑强度 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-gray-700">编辑强度</span>
            <span className="text-[12px] text-gray-500">{scale.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-500"
          />
          <div className="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>保留原图更多</span>
            <span>跟随指令更多</span>
          </div>
        </div>

        {/* 生成方案选择 */}
        {plans.length > 1 && (
          <div className="mb-4">
            <div className="text-[13px] font-medium text-gray-700 mb-2">生成方案</div>
            <div className="grid grid-cols-1 gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${
                    selectedPlanId === plan.id
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 truncate">{plan.name}</div>
                    <div className="text-[11px] text-gray-500">{plan.provider} · {plan.totalCost}元</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-xl text-[13px] text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 进度条 */}
        {submitting && !editResult && (
          <div className="mb-4 p-4 bg-blue-50 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-[13px] font-medium text-blue-700">AI 编辑中...</span>
            </div>
            <div className="w-full bg-blue-100 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[11px] text-blue-500 mt-1 text-right">{progress}%</div>
          </div>
        )}

        {/* 编辑结果 */}
        {editResult && editResult.status === 'completed' && editResult.resultImages && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-[13px] font-medium text-green-700">编辑完成</span>
            </div>

            {/* 原图 vs 结果对比 */}
            <div className="grid grid-cols-2 gap-3">
              {inputImage && (
                <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                  <Image src={cacheImageUrl(inputImage)} alt="原图" fill className="object-contain" unoptimized />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded-full text-[10px] text-white">
                    原图
                  </div>
                </div>
              )}
              {editResult.resultImages[0] && (
                <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                  <Image src={cacheImageUrl(editResult.resultImages[0])} alt="编辑结果" fill className="object-contain" unoptimized />
                  <div className="absolute top-2 left-2 px-2 py-0.5 bg-blue-500 rounded-full text-[10px] text-white">
                    结果
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !inputImage || !prompt.trim()}
          className="w-full py-3 bg-blue-500 text-white rounded-xl font-medium text-[14px] flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>编辑中...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>开始编辑 {selectedPlan ? `(${selectedPlan.totalCost}元)` : ''}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
