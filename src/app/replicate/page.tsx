'use client';

import { useState, useEffect, useCallback } from 'react';
import { Info, Loader2, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { AssetSelect } from '@/components/assets/asset-select';
import { SectionTitle } from '@/components/ui/section-title';
import { TaskStatus } from '@/components/task-status/task-status';
import { cacheImageUrl } from '@/lib/utils';
import type { GenerationPlan } from '@/types';

export default function ReplicatePage() {
  const [referencePath, setReferencePath] = useState<string | null>(null);
  const [garmentPath, setGarmentPath] = useState<string | null>(null);
  const [uploadedModelPath, setUploadedModelPath] = useState<string | null>(null);
  const [scenePrompt, setScenePrompt] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultImages, setResultImages] = useState<string[]>([]);

  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/outfit/generation-plans?purpose=replicate');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        setSelectedPlanId((prev) => prev || data.plans?.[0]?.id || '');
      }
    } catch { /* 忽略 */ }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const isImg2Img = selectedPlan?.method === 'hunyuan-img2img';

  const handleSubmit = useCallback(async () => {
    if (!referencePath) { alert('请选择参考图（爆款图片）'); return; }
    if (!garmentPath) { alert('请选择要替换的服装图'); return; }
    if (!isImg2Img && !uploadedModelPath) { alert('请选择模特图'); return; }

    setSubmitting(true);
    setResultImages([]);

    try {
      const res = await fetch('/api/replicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceImagePath: referencePath,
          garmentImagePath: garmentPath,
          ...(isImg2Img ? {} : { modelImagePath: uploadedModelPath }),
          scenePrompt: scenePrompt || undefined,
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
  }, [referencePath, garmentPath, uploadedModelPath, scenePrompt, selectedPlanId, isImg2Img]);

  const canSubmit = referencePath && garmentPath && !submitting && !taskId && (isImg2Img || uploadedModelPath);

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 pb-24">
        {/* 生成方案 */}
        {plans.length > 0 && (
          <div className="mb-5">
            <SectionTitle>选择模型</SectionTitle>
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

        {/* 参考图 + 服装图选择 */}
        <div className="mb-5">
          <div className="flex flex-col gap-4">
            <AssetSelect
              label="参考图（爆款图）（必填）"
              description="选择想要复刻的网红/爆款穿搭图"
              value={referencePath}
              onChange={setReferencePath}
              pickerTitle="从素材中心选择参考图"
              placeholder="从素材中心选择参考图"
            />
            <AssetSelect
              label="替换服装图（必填）"
              description="选择要穿上的服装平铺图"
              value={garmentPath}
              onChange={setGarmentPath}
              pickerTitle="从素材中心选择服装图"
              placeholder="从素材中心选择服装图"
            />
          </div>
        </div>

        {/* 模特选择 */}
        {!isImg2Img && (
          <div className="mb-5">
            <AssetSelect
              label="模特图（必填）"
              description="选择已保存的模特或素材中心里的模特图"
              value={uploadedModelPath}
              onChange={setUploadedModelPath}
              defaultType="model"
              pickerTitle="从素材中心选择模特图"
              placeholder="从素材中心选择模特图"
            />
          </div>
        )}

        {/* 混元图生图提示 */}
        {isImg2Img && (
          <div className="mb-5 p-3 bg-blue-50 rounded-xl">
            <p className="text-[11px] text-blue-700">
              混元图生图方案将直接以参考图中的人物为基础复刻（姿势/背景最贴近原图），不指定模特。
            </p>
          </div>
        )}

        {/* 高级选项 */}
        <div className="mb-5">
          <SectionTitle>高级选项（选填）</SectionTitle>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-gray-700">额外场景描述</label>
            <textarea
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder="例如：保持原图光线和氛围，只替换服装和人物"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* 提示 */}
        <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            参考图质量直接影响复刻效果。建议选择主体清晰、人物全身、动作明显、场景完整的图片。
            AI会自动提取参考图的姿势和背景场景，替换为你选择的模特和服装。
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
              <ArrowLeftRight className="w-4 h-4" />
              开始复刻 {selectedPlan ? `(${selectedPlan.totalCost}元)` : ''}
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
              <span className="text-[13px] font-medium text-green-700">复刻完成</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {resultImages.map((img, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
                  <Image src={cacheImageUrl(img)} alt={`结果 ${i + 1}`} width={800} height={800} className="w-full h-auto" unoptimized />
                </div>
              ))}
            </div>
            <button
              onClick={() => setResultImages([])}
              className="mt-3 w-full py-2 text-[13px] text-blue-600 hover:text-blue-800 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
            >
              继续复刻
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
