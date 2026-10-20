'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Shirt, Check, Loader2, User, Star, Plus, X, Info } from 'lucide-react';
import Link from 'next/link';
import { ImageUpload } from '@/components/upload/image-upload';
import { cacheImageUrl } from '@/lib/utils';
import type { Garment, Model, GarmentCategory } from '@/types';

const CATEGORIES: { value: GarmentCategory; label: string }[] = [
  { value: 'top', label: '上装' },
  { value: 'bottom', label: '下装' },
  { value: 'dress', label: '连衣裙' },
  { value: 'accessories', label: '配饰' },
  { value: 'shoes', label: '鞋履' },
];

interface ModelsResponse {
  models: Model[];
  defaultModel: Model | null;
}

export default function CreateOutfitPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scenePrompt, setScenePrompt] = useState('');
  const [garments, setGarments] = useState<Garment[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  const [showAddGarment, setShowAddGarment] = useState(false);
  const [newGarmentName, setNewGarmentName] = useState('');
  const [newGarmentCategory, setNewGarmentCategory] = useState<GarmentCategory>('top');
  const [newGarmentImage, setNewGarmentImage] = useState<string | null>(null);
  const [addingGarment, setAddingGarment] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/garment')
      .then((r) => (r.ok ? r.json() : { garments: [] }))
      .then((d) => setGarments(d.garments || []))
      .catch(() => {});
    fetch('/api/model')
      .then((r) => (r.ok ? r.json() : { models: [], defaultModel: null }))
      .then((d: ModelsResponse) => {
        setModels(d.models || []);
        if (d.defaultModel) setSelectedModelId(d.defaultModel.id);
      })
      .catch(() => {})
      .finally(() => setModelsLoading(false));
  }, []);

  const [selectedGarmentIds, setSelectedGarmentIds] = useState<Set<string>>(new Set());

  const toggleGarment = (id: string) => {
    setSelectedGarmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 4) {
          alert('最多选择4件单品');
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const handleAddGarment = async () => {
    if (!newGarmentName.trim() || !newGarmentImage) {
      alert('请填写单品名称并上传图片');
      return;
    }
    setAddingGarment(true);
    try {
      const res = await fetch('/api/garment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGarmentName.trim(),
          category: newGarmentCategory,
          imagePath: newGarmentImage,
        }),
      });
      if (!res.ok) throw new Error('添加失败');
      const data = await res.json();
      setGarments((prev) => [data.garment, ...prev]);
      setSelectedGarmentIds((prev) => new Set([...prev, data.garment.id]));
      setShowAddGarment(false);
      setNewGarmentName('');
      setNewGarmentImage(null);
      setNewGarmentCategory('top');
    } catch (error) {
      alert(error instanceof Error ? error.message : '添加失败');
    } finally {
      setAddingGarment(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) { alert('请填写方案名称'); return; }
    if (selectedGarmentIds.size === 0) { alert('请至少选择一件单品'); return; }
    if (!selectedModelId) { alert('请选择模特'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/outfit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description || undefined,
          modelId: selectedModelId,
          scenePrompt: scenePrompt || undefined,
          garmentIds: Array.from(selectedGarmentIds),
        }),
      });
      if (!res.ok) throw new Error('创建失败');
      const data = await res.json();
      router.push(`/outfit/${data.outfit.id}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : '创建失败');
      setSubmitting(false);
    }
  };

  const selectedGarments = garments.filter((g) => selectedGarmentIds.has(g.id));
  const canSubmit = name.trim() && selectedGarmentIds.size > 0 && selectedModelId && !submitting;

  return (
    <div className="min-h-screen bg-white">
      {/* 顶部导航 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <div className="w-8 h-8 bg-pink-100 rounded-lg flex items-center justify-center">
          <Shirt className="w-4 h-4 text-pink-600" />
        </div>
        <h1 className="text-[15px] font-semibold text-gray-900">创建穿搭方案</h1>
      </div>

      <div className="max-w-5xl mx-auto p-4 pb-24">
        {/* 方案信息 */}
        <div className="mb-5">
          <div className="text-[13px] font-medium text-gray-700 mb-2">方案信息</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[12px] font-medium text-gray-700">方案名称（必填）</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：春日休闲穿搭"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-pink-400"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-700">场景描述（选填）</label>
              <input
                type="text"
                value={scenePrompt}
                onChange={(e) => setScenePrompt(e.target.value)}
                placeholder="例如：在咖啡馆内，自然光"
                className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-pink-400"
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
              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] resize-none focus:outline-none focus:border-pink-400"
            />
          </div>
        </div>

        {/* 模特选择 */}
        <div className="mb-5">
          <div className="text-[13px] font-medium text-gray-700 mb-2">模特选择</div>
          {modelsLoading ? (
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
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedModelId(model.id)}
                  className={`relative rounded-xl overflow-hidden border-2 aspect-square transition-all ${
                    selectedModelId === model.id
                      ? 'border-pink-500 ring-2 ring-pink-100'
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
                    <div className="absolute inset-0 bg-pink-500/20 flex items-center justify-center">
                      <div className="w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                    <p className="text-[10px] text-white font-medium truncate">{model.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 单品选择 */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[13px] font-medium text-gray-700">
              选择单品
              {selectedGarmentIds.size > 0 && (
                <span className="text-pink-500 ml-1">已选{selectedGarmentIds.size}/4</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAddGarment(!showAddGarment)}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 上传新单品
            </button>
          </div>

          {showAddGarment && (
            <div className="mb-4 p-3 bg-gray-50 rounded-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ImageUpload
                  label="单品图片"
                  description="上传服装平铺图"
                  type="garment"
                  value={newGarmentImage}
                  onChange={(path) => setNewGarmentImage(path)}
                />
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">单品名称</label>
                    <input
                      type="text"
                      value={newGarmentName}
                      onChange={(e) => setNewGarmentName(e.target.value)}
                      placeholder="例如：白色T恤"
                      className="mt-0.5 w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-[12px] focus:outline-none focus:border-pink-400"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">分类</label>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setNewGarmentCategory(cat.value)}
                          className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
                            newGarmentCategory === cat.value
                              ? 'border-pink-500 bg-pink-50 text-pink-600'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddGarment}
                      disabled={addingGarment || !newGarmentName || !newGarmentImage}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-200 text-white text-[11px] font-medium rounded-lg transition-colors"
                    >
                      {addingGarment ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      添加并选中
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddGarment(false); setNewGarmentName(''); setNewGarmentImage(null); }}
                      className="px-2 py-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {garments.length === 0 && !showAddGarment ? (
            <div className="text-center py-8 text-gray-400 text-[13px]">还没有单品，请上传新单品</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
              {garments.map((garment) => {
                const selected = selectedGarmentIds.has(garment.id);
                return (
                  <button
                    key={garment.id}
                    type="button"
                    onClick={() => toggleGarment(garment.id)}
                    className={`relative rounded-xl overflow-hidden border-2 aspect-square transition-all ${
                      selected
                        ? 'border-pink-500 ring-2 ring-pink-100'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <img src={cacheImageUrl(garment.image_path)} alt={garment.name} className="w-full h-full object-cover" />
                    {selected && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-pink-500 rounded-full flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                      <p className="text-[10px] text-white font-medium truncate">{garment.name}</p>
                      <p className="text-[9px] text-white/70">{CATEGORIES.find((c) => c.value === garment.category)?.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 提示 */}
        <div className="mb-4 p-3 bg-pink-50 rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 text-pink-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-pink-700 leading-relaxed">
            选择1-4件单品，搭配模特一键生成穿搭方案。生成后可查看正面/侧面/背面三视图和单品清单。
          </p>
        </div>

        {/* 创建按钮 */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full py-3 bg-pink-500 text-white rounded-xl font-medium text-[14px] flex items-center justify-center gap-2 hover:bg-pink-600 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              创建中...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              创建穿搭方案
            </>
          )}
        </button>
      </div>
    </div>
  );
}
