'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, X, Info } from 'lucide-react';
import { AssetSelect } from '@/components/assets/asset-select';
import { AssetPicker } from '@/components/assets/asset-picker';
import { SectionTitle } from '@/components/ui/section-title';
import { cacheImageUrl } from '@/lib/utils';
import {
  ITEM_CATEGORY_LABELS,
  getMaterialSourceUrl,
  materialKey,
  type MaterialItem,
} from '@/lib/storage/material-types';
import type { Model, GenerationPlan } from '@/types';

const MAX_GARMENTS = 8;

interface ModelsResponse {
  models: Model[];
  defaultModel: Model | null;
}

export default function CreateOutfitPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scenePrompt, setScenePrompt] = useState('');
  const [modelImagePath, setModelImagePath] = useState<string | null>(null);
  const [selectedGarments, setSelectedGarments] = useState<MaterialItem[]>([]);
  const [garmentPickerOpen, setGarmentPickerOpen] = useState(false);

  const [plans, setPlans] = useState<GenerationPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/model')
      .then((r) => (r.ok ? r.json() : { models: [], defaultModel: null }))
      .then((d: ModelsResponse) => {
        if (d.defaultModel) setModelImagePath(d.defaultModel.identity_image_path);
      })
      .catch(() => {});
    fetch('/api/outfit/generation-plans?purpose=outfit')
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((d) => {
        const list: GenerationPlan[] = d.plans || [];
        setPlans(list);
        setSelectedPlanId((prev) => prev || list[0]?.id || '');
      })
      .catch(() => {});
  }, []);

  const removeGarment = (key: string) => {
    setSelectedGarments((prev) => prev.filter((item) => materialKey(item) !== key));
  };

  const handleGarmentConfirm = (items: MaterialItem[]) => {
    setSelectedGarments((prev) => {
      const merged = [...prev];
      for (const item of items) {
        if (!merged.some((m) => materialKey(m) === materialKey(item))) merged.push(item);
      }
      return merged.slice(0, MAX_GARMENTS);
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) { alert('请填写方案名称'); return; }
    if (selectedGarments.length === 0) { alert('请至少选择一件单品'); return; }
    if (!modelImagePath) { alert('请选择模特'); return; }

    setSubmitting(true);
    try {
      // 一个穿搭方案即一个生成任务：创建方案后立即提交生成，统一在任务中心查看
      const res = await fetch('/api/outfit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description || undefined,
          scenePrompt: scenePrompt || undefined,
          garments: selectedGarments.map((item) => ({
            imagePath: getMaterialSourceUrl(item),
            name: item.title || item.filename,
            category: item.itemCategory || 'top',
          })),
        }),
      });
      if (!res.ok) throw new Error('创建失败');
      const data = await res.json();

      const genRes = await fetch(`/api/outfit/${data.outfit.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlanId || undefined, modelImagePath }),
      });
      if (!genRes.ok) {
        const err = await genRes.json().catch(() => ({}) as { error?: string });
        throw new Error(err.error || '提交生成失败');
      }

      router.push('/tasks');
    } catch (error) {
      alert(error instanceof Error ? error.message : '创建失败');
      setSubmitting(false);
    }
  };

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0];
  const canSubmit = name.trim() && selectedGarments.length > 0 && modelImagePath && !submitting;

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部导航 */}
      {/* <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
          <Shirt className="w-4 h-4 text-blue-600" />
        </div>
        <h1 className="text-[15px] font-semibold text-gray-900">创建穿搭方案</h1>
      </div> */}

      <div className="max-w-5xl mx-auto p-4 pb-24">
        {/* 生成方案（厂商/模型/价格） */}
        <div className="mb-5">
          <SectionTitle>选择模型</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPlanId(p.id)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  selectedPlanId === p.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  <span className="text-xs font-semibold text-blue-600">{p.totalCost} 元/套</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {p.provider} · {p.model}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {p.price} 元/次 × {p.calls} 次 · {p.imagesPerCall * p.calls} 张
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 模特选择 */}
        <div className="mb-5">
          <AssetSelect
            label="模特选择"
            description="从素材中心直接选择模特图"
            value={modelImagePath}
            onChange={setModelImagePath}
            defaultType="model"
            pickerTitle="从素材中心选择模特图"
            placeholder="从素材中心选择模特图"
          />
        </div>

        {/* 单品选择 */}
        <div className="mb-5">
          <SectionTitle>
            选择单品
            {selectedGarments.length > 0 && (
              <span className="text-blue-500 ml-1">已选{selectedGarments.length}/{MAX_GARMENTS}</span>
            )}
          </SectionTitle>

          {selectedGarments.length === 0 ? (
            <button
              type="button"
              onClick={() => setGarmentPickerOpen(true)}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-xl text-[13px] text-gray-400 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            >
              从素材中心直接选择单品图（最多 {MAX_GARMENTS} 件）
            </button>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {selectedGarments.map((item) => (
                <div
                  key={materialKey(item)}
                  className="relative rounded-xl overflow-hidden border-2 border-blue-500 aspect-square"
                >
                  <img
                    src={cacheImageUrl(item.localPath)}
                    alt={item.title || item.filename}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`移除 ${item.title || item.filename}`}
                    onClick={() => removeGarment(materialKey(item))}
                    className="absolute top-1 left-1 w-5 h-5 bg-black/50 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                    <p className="text-[10px] text-white font-medium truncate">{item.title || item.filename}</p>
                    {item.itemCategory && (
                      <p className="text-[9px] text-white/70">{ITEM_CATEGORY_LABELS[item.itemCategory]}</p>
                    )}
                  </div>
                </div>
              ))}
              {selectedGarments.length < MAX_GARMENTS && (
                <button
                  type="button"
                  onClick={() => setGarmentPickerOpen(true)}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                  aria-label="继续添加单品"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          <AssetPicker
            open={garmentPickerOpen}
            maxCount={MAX_GARMENTS}
            defaultType="item"
            title="从素材中心选择单品"
            onClose={() => setGarmentPickerOpen(false)}
            onConfirm={handleGarmentConfirm}
          />
        </div>

        
        {/* 方案信息 */}
        <div className="mb-5">
          <SectionTitle>方案信息</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[12px] font-medium text-gray-700">方案名称（必填）</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：春日休闲穿搭"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">场景描述（选填）</label>
              <input
                type="text"
                value={scenePrompt}
                onChange={(e) => setScenePrompt(e.target.value)}
                placeholder="例如：在咖啡馆内，自然光"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-700">描述（选填）</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述这套穿搭..."
              rows={2}
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* 提示 */}
        <div className="mb-4 p-3 bg-blue-50 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-blue-700 leading-relaxed">
            选择1-8件单品，搭配模特一键生成穿搭方案。一个方案即一个生成任务，提交后会自动跳到任务中心查看进度与正/侧/背三视图结果。
          </p>
        </div>

        {/* 创建按钮 */}
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
              <Check className="w-4 h-4" />
              创建并生成{selectedPlan ? `（${selectedPlan.totalCost}元）` : ''}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
