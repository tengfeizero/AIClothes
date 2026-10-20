'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Info, Loader2, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { ImageUpload } from '@/components/upload/image-upload';
import { TaskStatus } from '@/components/task-status/task-status';
import { cacheImageUrl } from '@/lib/utils';
import type { GenerationPlan } from '@/types';

export default function SuitePage() {
  const [garmentPath, setGarmentPath] = useState<string | null>(null);
  const [scenePrompt, setScenePrompt] = useState('');
  const [panelRatio, setPanelRatio] = useState<'3:4' | '1:1'>('3:4');
  const [panelResolution, setPanelResolution] = useState<'1K' | '2K'>('2K');

  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultImages, setResultImages] = useState<string[]>([]);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/outfit/generation-plans?purpose=suite');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        setSelectedPlanId((prev) => prev || data.plans?.[0]?.id || '');
      }
    } catch { /* 忽略 */ }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  const handleSubmit = useCallback(async () => {
    if (!garmentPath) { alert('请上传商品图'); return; }

    setSubmitting(true);
    setResultImages([]);

    try {
      const res = await fetch('/api/suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentImagePath: garmentPath,
          scenePrompt: scenePrompt || undefined,
          panelRatio,
          panelResolution,
          planId: selectedPlanId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '提交失败');
      }
      const data = await res.json();
      setTaskId(data.taskId);
    } catch (error) {
      alert(error instanceof Error ? error.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  }, [garmentPath, scenePrompt, panelRatio, panelResolution, selectedPlanId]);

  const canSubmit = garmentPath && !submitting && !taskId;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 pb-24">
        {/* 生成方案 */}
        {plans.length > 0 && (
          <div className="mb-5">
            <div className="text-[13px] font-medium text-gray-700 mb-2">生成方案</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlanId(p.id)}
                  className={`text-left p-3 rounded-xl border transition-colors ${
                    selectedPlanId === p.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-gray-800 truncate">{p.name}</span>
                    <span className="text-[11px] font-semibold text-blue-600 ml-2 flex-shrink-0">{p.totalCost}元</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{p.provider} · {p.model}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 商品图上传 */}
        <div className="mb-5">
          <ImageUpload
            label="商品图（必填）"
            description="建议上传白底商品平铺图，主体清晰、仅含一个商品"
            type="garment"
            value={garmentPath}
            onChange={(path) => setGarmentPath(path)}
          />
        </div>

        {/* 高级选项 */}
        <div className="mb-5">
          <div className="text-[13px] font-medium text-gray-700 mb-3">高级选项（选填）</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[12px] font-medium text-gray-700">海报比例</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['3:4', '1:1'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPanelRatio(r)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                      panelRatio === r
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">分辨率</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['1K', '2K'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setPanelResolution(r)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                      panelResolution === r
                        ? 'border-blue-500 bg-blue-50 text-blue-600'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-700">场景/文案描述</label>
            <textarea
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder="例如：户外露营场景，突出防泼水功能；卖点文案突出轻量便携"
              rows={2}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* 提示 */}
        <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            建议一次上传一件商品：单件商品识别最准确。商品套图由 AI 自动搭配场景与模特，与「定制模特」无关。
          </p>
        </div>

        {/* 生成按钮 */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 bg-blue-500 text-white rounded-xl font-medium text-[14px] flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              提交中...
            </>
          ) : (
            <>
              <Package className="w-4 h-4" />
              开始生成套图 {selectedPlan ? `(${selectedPlan.totalCost}元)` : ''}
            </>
          )}
        </button>

        {/* 生成进度 */}
        {taskId && (
          <div className="mt-4">
            <TaskStatus
              taskId={taskId}
              onComplete={(images) => {
                setResultImages(images);
                setTaskId(null);
              }}
            />
          </div>
        )}

        {/* 生成结果 */}
        {resultImages.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-[13px] font-medium text-green-700">生成完成</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {resultImages.map((img, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                  <Image src={cacheImageUrl(img)} alt={`套图 ${i + 1}`} width={400} height={400} className="w-full h-auto" unoptimized />
                </div>
              ))}
            </div>
            <button
              onClick={() => setResultImages([])}
              className="mt-3 w-full py-2 text-[13px] text-blue-600 hover:text-blue-800 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
            >
              继续生成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
