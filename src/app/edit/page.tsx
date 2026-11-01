'use client';

import { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { X, Sparkles, Loader2, AlertCircle, CheckCircle2, Images } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';
import { getMaterialSourceUrl } from '@/lib/storage/material-types';
import { AssetPicker } from '@/components/assets/asset-picker';
import { SectionTitle } from '@/components/ui/section-title';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('volcengine-seedit-v3');
  const [editResult, setEditResult] = useState<EditResult | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const [showAssetPicker, setShowAssetPicker] = useState(false);

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

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 pb-24">
        {/* 模型选择 */}
        {plans.length > 0 && (
          <div className="mb-4">
            <SectionTitle>选择模型</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
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
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {plan.provider} · {plan.resolution || '跟随原图'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 原图上传 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <SectionTitle className="">原图（必填）</SectionTitle>
            <span className="text-[11px] text-gray-400">{inputImage ? '1/1' : '0/1'}</span>
          </div>

          {inputImage ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                <Image src={cacheImageUrl(inputImage)} alt="原图" fill className="object-contain" unoptimized />
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 rounded-full text-[10px] text-white">
                  原图
                </div>
                <button
                  onClick={() => setInputImage(null)}
                  className="absolute top-2 right-2 p-1 bg-white/90 rounded-full shadow-sm hover:bg-white"
                >
                  <X className="w-3 h-3 text-gray-500" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowAssetPicker(true)}
              className="flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-400 bg-gray-50 hover:bg-blue-50 transition-colors"
            >
              <div className="flex flex-col items-center gap-1">
                <Images className="w-6 h-6 text-gray-400" />
                <span className="text-[12px] text-gray-500">从素材中心选择原图</span>
                <span className="text-[11px] text-gray-400">支持通用、套装、单品、模特、姿势等素材</span>
              </div>
            </button>
          )}
        </div>

        {/* 编辑指令 */}
        <div className="mb-4">
          <SectionTitle>编辑指令（必填）</SectionTitle>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={'描述你想要的编辑效果，例如：\n把衣服改成粉色，背景换成海边'}
            className="w-full h-32 px-3 py-2 text-[13px] border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 resize-none placeholder:text-gray-400"
          />
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

      <AssetPicker
        open={showAssetPicker}
        maxCount={1}
        title="从素材中心选择原图"
        onClose={() => setShowAssetPicker(false)}
        onConfirm={(items) => {
          if (items[0]) setInputImage(getMaterialSourceUrl(items[0]));
          setShowAssetPicker(false);
        }}
      />
    </div>
  );
}
