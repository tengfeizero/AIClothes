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
  const [modelPath, setModelPath] = useState<string | null>(null);
  const [posePath, setPosePath] = useState<string | null>(null);
  const [garmentPath, setGarmentPath] = useState<string | null>(null);
  const [scenePrompt, setScenePrompt] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultImages, setResultImages] = useState<string[]>([]);

  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [outputResolution, setOutputResolution] = useState<string>('1024x1536');

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/generation-plans?purpose=replicate');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        setSelectedPlanId((prev) => prev || data.plans?.[0]?.id || '');
      }
    } catch { /* 忽略 */ }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];

  useEffect(() => {
    if (selectedPlan?.resolutionOptions?.length) {
      const preferred = selectedPlan.resolutionOptions.find(
        (r) => `${r.width}x${r.height}` === (selectedPlan.resolution || '').replace('*', 'x')
      );
      const target = preferred || selectedPlan.resolutionOptions[0];
      setOutputResolution(target.width === 0 ? 'original' : `${target.width}x${target.height}`);
    }
  }, [selectedPlan?.id]);

  const handleSubmit = useCallback(async () => {
    if (!referencePath) { alert('请选择参考图（爆款图片）'); return; }

    setSubmitting(true);
    setResultImages([]);

    try {
      const res = await fetch('/api/replicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceImagePath: referencePath,
          modelImagePath: modelPath || undefined,
          poseImagePath: posePath || undefined,
          garmentImagePath: garmentPath || undefined,
          scenePrompt: scenePrompt || undefined,
          planId: selectedPlanId || undefined,
          outputResolution,
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
  }, [referencePath, modelPath, posePath, garmentPath, scenePrompt, selectedPlanId, outputResolution]);

  const canSubmit = referencePath && !submitting && !taskId;

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

            {/* 分辨率 */}
            {selectedPlan?.resolutionOptions && selectedPlan.resolutionOptions.length > 0 && (
              <div className="mt-3">
                <div className="text-[12px] font-medium text-gray-700 mb-1.5">输出分辨率</div>
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

        {/* 参考图 + 可选项 */}
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
              label="模特图（选填）"
              description="不选则沿用参考图中的人物"
              value={modelPath}
              onChange={setModelPath}
              defaultType="model"
              pickerTitle="从素材中心选择模特图"
              placeholder="从素材中心选择模特图"
            />
            <AssetSelect
              label="姿势图（选填）"
              description="不选则沿用参考图中的动作姿势"
              value={posePath}
              onChange={setPosePath}
              pickerTitle="从素材中心选择姿势图"
              placeholder="从素材中心选择姿势图"
            />
            <AssetSelect
              label="服装图（选填）"
              description="不选则沿用参考图中的服装"
              value={garmentPath}
              onChange={setGarmentPath}
              pickerTitle="从素材中心选择服装图"
              placeholder="从素材中心选择服装图"
            />
          </div>
        </div>

        {/* 高级选项 */}
        <div className="mb-5">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-gray-700">额外指令（选填）</label>
            <textarea
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder="例如：保持原图光线和氛围，只替换服装和人物"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* 输入指令说明 */}
        <div className="mb-5 p-3 bg-blue-50 rounded-xl">
          <p className="text-[11px] text-blue-700">
            以参考图（图1）为基础复刻；选填的模特图、姿势图、服装图会依次作为后续输入图，未选填的部分沿用参考图内容，系统据此动态生成输入指令。
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
