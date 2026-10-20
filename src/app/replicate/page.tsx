'use client';

import { useState, useEffect, useCallback } from 'react';
import { Info, Check, User, Star, Plus, Loader2, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
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

export default function ReplicatePage() {
  const [referencePath, setReferencePath] = useState<string | null>(null);
  const [garmentPath, setGarmentPath] = useState<string | null>(null);
  const [modelSource, setModelSource] = useState<'saved' | 'upload'>('saved');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [uploadedModelPath, setUploadedModelPath] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [scenePrompt, setScenePrompt] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resultImages, setResultImages] = useState<string[]>([]);

  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  useEffect(() => {
    fetch('/api/model')
      .then((res) => (res.ok ? res.json() : { models: [], defaultModel: null }))
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
    if (!referencePath) { alert('请上传参考图（爆款图片）'); return; }
    if (!garmentPath) { alert('请上传要替换的服装图'); return; }

    let modelParam: { modelId?: string; modelImagePath?: string } = {};
    if (!isImg2Img) {
      if (modelSource === 'saved' && selectedModelId) {
        modelParam = { modelId: selectedModelId };
      } else if (modelSource === 'upload' && uploadedModelPath) {
        modelParam = { modelImagePath: uploadedModelPath };
      } else {
        alert('请选择模特或上传模特图');
        return;
      }
    }

    setSubmitting(true);
    setResultImages([]);

    try {
      const res = await fetch('/api/replicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceImagePath: referencePath,
          garmentImagePath: garmentPath,
          ...modelParam,
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
  }, [referencePath, garmentPath, modelSource, selectedModelId, uploadedModelPath, scenePrompt, selectedPlanId, isImg2Img]);

  const canSubmit = referencePath && garmentPath && !submitting && !taskId && (
    isImg2Img ||
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
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-gray-800 truncate">{p.name}</span>
                    <span className="text-[11px] font-semibold text-orange-600 ml-2 flex-shrink-0">{p.totalCost}元</span>
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{p.provider} · {p.model}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 图片上传：参考图 + 服装图 并排 */}
        <div className="mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageUpload
              label="参考图（爆款图）（必填）"
              description="上传想要复刻的网红/爆款穿搭图"
              type="pose"
              value={referencePath}
              onChange={(path) => setReferencePath(path)}
            />
            <ImageUpload
              label="替换服装图（必填）"
              description="上传要穿上的服装平铺图"
              type="garment"
              value={garmentPath}
              onChange={(path) => setGarmentPath(path)}
            />
          </div>
        </div>

        {/* 模特选择 */}
        {!isImg2Img && (
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
                      ? 'bg-white text-orange-600 shadow-sm'
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
                      ? 'bg-white text-orange-600 shadow-sm'
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
                          ? 'border-orange-500 ring-2 ring-orange-100'
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
                        <div className="absolute inset-0 bg-orange-500/20 flex items-center justify-center">
                          <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
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
        )}

        {/* 混元图生图提示 */}
        {isImg2Img && (
          <div className="mb-5 p-3 bg-orange-50 rounded-xl">
            <p className="text-[11px] text-orange-700">
              混元图生图方案将直接以参考图中的人物为基础复刻（姿势/背景最贴近原图），不指定模特。
            </p>
          </div>
        )}

        {/* 高级选项 */}
        <div className="mb-5">
          <div className="text-[13px] font-medium text-gray-700 mb-3">高级选项（选填）</div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-gray-700">额外场景描述</label>
            <textarea
              value={scenePrompt}
              onChange={(e) => setScenePrompt(e.target.value)}
              placeholder="例如：保持原图光线和氛围，只替换服装和人物"
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-orange-400"
            />
          </div>
        </div>

        {/* 提示 */}
        <div className="mb-4 p-3 bg-orange-50 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-orange-700 leading-relaxed">
            参考图质量直接影响复刻效果。推荐上传：主体清晰、人物全身、动作明显、场景完整的图片。
            AI会自动提取参考图的姿势和背景场景，替换为你选择的模特和服装。
          </p>
        </div>

        {/* 生成按钮 */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 bg-orange-500 text-white rounded-xl font-medium text-[14px] flex items-center justify-center gap-2 hover:bg-orange-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
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
              className="mt-3 w-full py-2 text-[13px] text-orange-600 hover:text-orange-800 border border-orange-200 rounded-xl hover:bg-orange-50 transition-colors"
            >
              继续复刻
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
