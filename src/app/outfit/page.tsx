'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Trash2, Eye, Loader2 } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';
import type { OutfitWithGarments } from '@/types';

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'bg-gray-100 text-gray-600' },
  generating: { text: '生成中', color: 'bg-blue-100 text-blue-600' },
  completed: { text: '已完成', color: 'bg-green-100 text-green-600' },
  failed: { text: '失败', color: 'bg-red-100 text-red-600' },
};

export default function OutfitListPage() {
  const [outfits, setOutfits] = useState<OutfitWithGarments[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOutfits = useCallback(async () => {
    try {
      const res = await fetch('/api/outfit');
      if (res.ok) {
        const data = await res.json();
        setOutfits(data.outfits || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOutfits();
  }, [fetchOutfits]);

  // Auto-refresh while generating
  useEffect(() => {
    const hasGenerating = outfits.some((o) => o.status === 'generating');
    if (!hasGenerating) return;
    const timer = setInterval(fetchOutfits, 3000);
    return () => clearInterval(timer);
  }, [outfits, fetchOutfits]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个穿搭方案吗？')) return;
    await fetch(`/api/outfit/${id}`, { method: 'DELETE' });
    await fetchOutfits();
  };

  return (
    <div className="max-w-5xl mx-auto">
      {loading ? (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      ) : outfits.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CalendarDays className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">暂无穿搭方案</h2>
          <p className="text-gray-500 text-sm mb-4">创建你的第一个穿搭方案，生成正面/侧面/背面/单品清单四图排版</p>
          <Link
            href="/outfit/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> 创建第一个方案
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 创建方案卡片 */}
          <Link
            href="/outfit/create"
            className="bg-white rounded-2xl border-2 border-dashed border-pink-200 hover:border-pink-400 hover:bg-pink-50/50 transition-colors overflow-hidden group"
          >
            <div className="relative aspect-square bg-gray-50 flex flex-col items-center justify-center gap-2">
              <div className="w-14 h-14 bg-pink-100 group-hover:bg-pink-200 rounded-full flex items-center justify-center transition-colors">
                <Plus className="w-6 h-6 text-pink-600" />
              </div>
              <span className="text-sm font-medium text-gray-600 group-hover:text-pink-600 transition-colors">创建方案</span>
            </div>
          </Link>
          {outfits.map((outfit) => {
            const status = STATUS_LABELS[outfit.status] || STATUS_LABELS.draft;
            const coverImg = outfit.front_image_path || (outfit.garments[0]?.image_path);
            return (
              <div key={outfit.id} className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                <Link href={`/outfit/${outfit.id}`}>
                  <div className="relative aspect-square bg-gray-50">
                    {coverImg ? (
                      <img src={cacheImageUrl(coverImg)} alt={outfit.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <CalendarDays className="w-12 h-12" />
                      </div>
                    )}
                    <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                      {outfit.status === 'generating' && <Loader2 className="w-3 h-3 animate-spin" />}
                      {status.text}
                    </div>
                  </div>
                </Link>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <Link href={`/outfit/${outfit.id}`}>
                        <h3 className="font-semibold text-gray-900 truncate hover:text-pink-600 transition-colors">{outfit.name}</h3>
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {outfit.garments.length} 件单品 · {new Date(outfit.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Link
                        href={`/outfit/${outfit.id}`}
                        className="p-1.5 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(outfit.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
