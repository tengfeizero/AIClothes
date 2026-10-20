'use client';

import { useState, useCallback, useEffect } from 'react';
import { Wand2, Info, User, Star, Plus, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { ImageUpload } from '@/components/upload/image-upload';
import { TaskStatus } from '@/components/task-status/task-status';
import { cacheImageUrl } from '@/lib/utils';
import type { Model, GenerationPlan } from '@/types';

interface ModelsResponse {
  models: Model[];
  defaultModel: Model | null;
}

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

  const [modelSource, setModelSource] = useState<'saved' | 'upload'>('saved');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [uploadedModelPath, setUploadedModelPath] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/model')
      .then((res) => res.ok ? res.json() : { models: [], defaultModel: null })
      .then((data: ModelsResponse) => {
        setModels(data.models || []);
        if (data.defaultModel) {
          setSelectedModelId(data.defaultModel.id);
          setModelSource('saved');
        } else if ((data.models || []).length === 0) {
          setModelSource('upload');
        }
      })
      .catch(() => setModelSource('upload'))
      .finally(() => setModelsLoading(false));
  }, []);

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
    if (!garmentPath) { alert('请上传服装图'); return; }

    let modelParam: { modelId?: string; modelImagePath?: string };
    if (modelSource === 'saved' && selectedModelId) {
      modelParam = { modelId: selectedModelId };
    } else if (modelSource === 'upload' && uploadedModelPath) {
      modelParam = { modelImagePath: uploadedModelPath };
    } else {
      alert('请选择模特或上传模特图');
      return;
    }

    setSubmitting(true);
    setResultImages([]);

    try {
      const res = await fetch('/api/tryon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          garmentImagePath: garmentPath,
          ...modelParam,
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
  }, [garmentPath, modelSource, selectedModelId, uploadedModelPath, posePath, backgroundPrompt, selectedPlanId, selectedPlan, clothesType, outputResolution]);

  const canSubmit = garmentPath && !submitting && !taskId && (
    (modelSource === 'saved' && selectedModelId) ||
    (modelSource === 'upload' && uploadedModelPath)
  );

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

        {/* 服装上传 */}
        <div className="mb-5">
          <ImageUpload
            label="服装平铺图（必填）"
            description="建议背景简洁，服装完整呈现"
            type="garment"
            value={garmentPath}
            onChange={(path) => setGarmentPath(path)}
          />
        </div>

        {/* 模特选择 */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-medium text-gray-700">模特选择</span>
            <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setModelSource('saved')}
                disabled={models.length === 0}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  modelSource === 'saved'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 disabled:opacity-40'
                }`}
              >
                我的模特
              </button>
              <button
                type="button"
                onClick={() => setModelSource('upload')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  modelSource === 'upload'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                上传模特图
              </button>
            </div>
          </div>

          {modelSource === 'saved' ? (
            modelsLoading ? (
              <div className="text-center py-8 text-gray-400 text-[13px]">加载模特...</div>
            ) : models.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-2">
                  <User className="w-5 h-5 text-purple-400" />
                </div>
                <p className="text-[13px] text-gray-500 mb-2">还没有定制模特</p>
                <Link
                  href="/my-model"
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> 创建数字人
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setSelectedModelId(model.id)}
                    className={`relative rounded-xl overflow-hidden border-2 aspect-square transition-all ${
                      selectedModelId === model.id
                        ? 'border-blue-500 ring-2 ring-blue-100'
                        : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img src={cacheImageUrl(model.identity_image_path)} alt={model.name} className="w-full h-full object-cover" />
                    {model.is_default && (
                      <div className="absolute top-1 left-1 p-0.5 bg-yellow-500 rounded-full">
                        <Star className="w-2 h-2 text-white" />
                      </div>
                    )}
                    {selectedModelId === model.id && (
                      <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                        <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                      <p className="text-[10px] text-white font-medium truncate">{model.name}</p>
                    </div>
                  </button>
                ))}
                <Link
                  href="/my-model"
                  className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 aspect-square text-gray-400 hover:text-purple-500 hover:border-purple-300 transition-colors"
                >
                  <Plus className="w-5 h-5 mb-0.5" />
                  <span className="text-[10px]">添加</span>
                </Link>
              </div>
            )
          ) : (
            <ImageUpload
              label="模特参考图"
              description="建议单人正面照，背景简洁"
              type="model"
              value={uploadedModelPath}
              onChange={(path) => setUploadedModelPath(path)}
            />
          )}
        </div>

        {/* 高级选项 */}
        <div className="mb-5">
          <div className="text-[13px] font-medium text-gray-700 mb-3">高级选项（选填）</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageUpload
              label="姿势参考图"
              description="指定模特姿势动作"
              type="pose"
              value={posePath}
              onChange={(path) => setPosePath(path)}
            />
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-gray-700">场景描述</label>
              <textarea
                value={backgroundPrompt}
                onChange={(e) => setBackgroundPrompt(e.target.value)}
                placeholder="例如：在明亮的工作室里，自然光"
                className="w-full h-[calc(100%-22px)] px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        {/* 提示 */}
        <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            选择"我的模特"可使用已保存的数字人形象，换装结果会保留人物特征。提交后可在任务中心查看进度。
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
