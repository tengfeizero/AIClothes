'use client';

import { useState, useCallback, useEffect } from 'react';
import { Wand2, Info, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import { AssetSelect } from '@/components/assets/asset-select';
import { SectionTitle } from '@/components/ui/section-title';
import { TaskStatus } from '@/components/task-status/task-status';
import { cacheImageUrl } from '@/lib/utils';
import type { GenerationPlan } from '@/types';

export default function TryonPage() {
  const [garmentPath, setGarmentPath] = useState<string | null>(null);
  const [posePath, setPosePath] = useState<string | null>(null);
  const [backgroundPrompt, setBackgroundPrompt] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultImages, setResultImages] = useState<string[]>([]);
  const [clothesType, setClothesType] = useState<'Upper-body' | 'Lower-body' | 'Dress'>('Upper-body');

  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('volcengine-jimeng-tryon');
  const [outputResolution, setOutputResolution] = useState<string>('2048x2048');

  const [uploadedModelPath, setUploadedModelPath] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/outfit/generation-plans?purpose=tryon');
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
      // 优先选方案声明的默认档位（resolution 字段），否则取第一个选项
      const preferred = selectedPlan.resolutionOptions.find(
        (r) => `${r.width}x${r.height}` === (selectedPlan.resolution || '').replace('*', 'x')
      );
      const target = preferred || selectedPlan.resolutionOptions[0];
      setOutputResolution(target.width === 0 ? 'original' : `${target.width}x${target.height}`);
    }
  }, [selectedPlan?.id]);

  const handleSubmit = useCallback(async () => {
    if (!garmentPath) { alert('请选择服装图'); return; }
    if (!uploadedModelPath) { alert('请选择模特图'); return; }

    setSubmitting(true);
    setResultImages([]);

    try {
      const res = await fetch('/api/tryon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentImagePath: garmentPath,
          modelImagePath: uploadedModelPath,
          poseImagePath: posePath || undefined,
          backgroundPrompt: backgroundPrompt || undefined,
          view: 'front',
          planId: selectedPlanId || undefined,
          clothesType: selectedPlan?.method === 'hunyuan-change-clothes' ? clothesType : undefined,
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
  }, [garmentPath, uploadedModelPath, posePath, backgroundPrompt, selectedPlanId, selectedPlan, clothesType, outputResolution]);

  const canSubmit = garmentPath && uploadedModelPath && !submitting && !taskId;

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

            {/* 混元服装类型 */}
            {selectedPlan?.method === 'hunyuan-change-clothes' && (
              <div className="mt-3 p-3 bg-blue-50 rounded-xl">
                <div className="text-[11px] font-medium text-blue-700 mb-2">服装类型</div>
                <div className="flex gap-2">
                  {[
                    { value: 'Upper-body' as const, label: '上衣' },
                    { value: 'Lower-body' as const, label: '下装' },
                    { value: 'Dress' as const, label: '连衣裙' },
                  ].map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setClothesType(o.value)}
                      className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                        clothesType === o.value
                          ? 'border-blue-500 bg-white text-blue-600'
                          : 'border-transparent bg-blue-100/60 text-blue-700 hover:bg-white'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 服装选择 */}
        <div className="mb-5">
          <AssetSelect
            label="服装平铺图（必填）"
            description="建议背景简洁，服装完整呈现"
            value={garmentPath}
            onChange={setGarmentPath}
            pickerTitle="从素材中心选择服装图"
            placeholder="从素材中心选择服装图"
          />
        </div>

        {/* 模特选择 */}
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

        {/* 高级选项 */}
        <div className="mb-5">
          <SectionTitle>高级选项（选填）</SectionTitle>
          <div className="flex flex-col gap-4">
            <AssetSelect
              label="姿势参考图"
              description="指定模特姿势动作"
              value={posePath}
              onChange={setPosePath}
              defaultType="pose"
              pickerTitle="从素材中心选择姿势图"
              placeholder="从素材中心选择姿势图"
            />
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-gray-700">场景描述</label>
              <textarea
                value={backgroundPrompt}
                onChange={(e) => setBackgroundPrompt(e.target.value)}
                placeholder="例如：在明亮的工作室里，自然光"
                className="w-full h-24 px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        {/* 提示 */}
        <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            素材中心里的模特都可直接选择，换装结果会保留人物特征。提交后可在任务中心查看进度。
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
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              提交中...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              开始生成 {selectedPlan ? `(${selectedPlan.totalCost}元)` : ''}
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
              继续生成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
