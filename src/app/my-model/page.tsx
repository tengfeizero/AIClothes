'use client';

import { useState, useCallback, useEffect } from 'react';
import { User, Plus, Star, Trash2, Check } from 'lucide-react';
import { ImageUpload } from '@/components/upload/image-upload';
import { cacheImageUrl } from '@/lib/utils';
import type { Model } from '@/types';

interface ModelsResponse {
  models: Model[];
  defaultModel: Model | null;
}

export default function MyModelPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModel, setDefaultModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [newModelGender, setNewModelGender] = useState('female');
  const [newModelImage, setNewModelImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/model');
      if (res.ok) {
        const data: ModelsResponse = await res.json();
        setModels(data.models || []);
        setDefaultModel(data.defaultModel);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleCreateModel = async () => {
    if (!newModelName.trim() || !newModelImage) {
      alert('请填写名称并上传照片');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newModelName.trim(),
          identityImagePath: newModelImage,
          avatarPath: newModelImage,
          gender: newModelGender,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '保存失败');
      }

      setShowForm(false);
      setNewModelName('');
      setNewModelImage(null);
      setNewModelGender('female');
      await fetchModels();
    } catch (error) {
      alert(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      const res = await fetch(`/api/model/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setDefault: true }),
      });
      if (res.ok) {
        await fetchModels();
      }
    } catch (error) {
      console.error('Set default failed:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/model/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchModels();
      }
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setDeleteId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="text-center py-12 text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">添加新模特</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUpload
              label="人物照片（必填）"
              description="上传清晰的正面单人照，背景简洁效果最佳"
              type="model"
              value={newModelImage}
              onChange={(path) => setNewModelImage(path)}
            />
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模特名称</label>
                <input
                  type="text"
                  value={newModelName}
                  onChange={(e) => setNewModelName(e.target.value)}
                  placeholder="例如：我的数字人"
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">性别</label>
                <div className="flex gap-3">
                  {['female', 'male'].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setNewModelGender(g)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        newModelGender === g
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'
                      }`}
                    >
                      {g === 'female' ? '女' : '男'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-xs text-purple-700">
                  <strong>提示：</strong>新添加的模特会自动设为默认模特，换装时会优先使用。添加多个模特后可切换默认。
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateModel}
                  disabled={saving || !newModelName || !newModelImage}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {saving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> 保存中</>
                  ) : (
                    <><Check className="w-4 h-4" /> 保存模特</>
                  )}
                </button>
                <button
                  onClick={() => { setShowForm(false); setNewModelName(''); setNewModelImage(null); }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 text-sm font-medium rounded-xl transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tips */}
      {models.length === 0 && !showForm && (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">还没有定制模特</h2>
          <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
            上传你的正面照片，创建专属数字人。之后在AI换装中选择你的数字人，生成的穿搭图会保持你的面部特征和体型。
          </p>
          <div className="text-xs text-gray-400 mb-4">
            提示：推荐使用单人正面照、背景简洁、光线均匀的照片效果最佳
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> 创建第一个数字人
          </button>
        </div>
      )}

      {/* Model list */}
      {models.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 添加模特卡片 */}
          <button
            onClick={() => setShowForm(true)}
            className="bg-white rounded-2xl border-2 border-dashed border-purple-200 hover:border-purple-400 hover:bg-purple-50/50 transition-colors overflow-hidden group"
          >
            <div className="aspect-square bg-gray-50 flex flex-col items-center justify-center gap-2">
              <div className="w-14 h-14 bg-purple-100 group-hover:bg-purple-200 rounded-full flex items-center justify-center transition-colors">
                <Plus className="w-6 h-6 text-purple-600" />
              </div>
              <span className="text-sm font-medium text-gray-600 group-hover:text-purple-600 transition-colors">添加模特</span>
            </div>
          </button>
          {models.map((model) => (
            <div
              key={model.id}
              className={`bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md ${
                defaultModel?.id === model.id ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-200'
              }`}
            >
              <div className="relative aspect-square bg-gray-50">
                <img
                  src={cacheImageUrl(model.identity_image_path)}
                  alt={model.name}
                  className="w-full h-full object-cover"
                />
                {defaultModel?.id === model.id && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-purple-600 text-white text-xs rounded-full">
                    <Star className="w-3 h-3" /> 默认
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{model.name}</h3>
                  <span className="text-xs text-gray-400">{model.gender === 'female' ? '女' : '男'}</span>
                </div>
                <div className="flex gap-2">
                  {defaultModel?.id !== model.id && (
                    <button
                      onClick={() => handleSetDefault(model.id)}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                    >
                      <Star className="w-3.5 h-3.5" /> 设为默认
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteId(model.id)}
                    className="flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-6">删除后不可恢复，确定要删除这个模特吗？</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
