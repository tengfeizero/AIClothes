'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Loader2, RefreshCw, Trash2, CloudUpload, AlertCircle, CheckCircle2, X, Search, ExternalLink } from 'lucide-react';
import { MATERIAL_LABELS, type MaterialItem, type MaterialType } from '@/lib/storage/material-types';

const TYPE_TABS: Array<{ value: MaterialType | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'general', label: MATERIAL_LABELS.general },
  { value: 'garment', label: MATERIAL_LABELS.garment },
  { value: 'model', label: MATERIAL_LABELS.model },
  { value: 'pose', label: MATERIAL_LABELS.pose },
  { value: 'background', label: MATERIAL_LABELS.background },
  { value: 'accessories', label: MATERIAL_LABELS.accessories },
  { value: 'shoes', label: MATERIAL_LABELS.shoes },
  { value: 'results', label: MATERIAL_LABELS.results },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function AssetsPage() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MaterialType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/assets');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '读取素材失败');
      setMaterials(data.materials || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取素材失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: materials.length };
    for (const item of materials) {
      map[item.type] = (map[item.type] || 0) + 1;
    }
    return map;
  }, [materials]);

  const visible = useMemo(
    () => (tab === 'all' ? materials : materials.filter((m) => m.type === tab)),
    [materials, tab]
  );

  // 当前分类下可选分类（图库素材才有分类）
  const categories = useMemo(
    () => Array.from(new Set(visible.map((m) => m.category).filter((c): c is string => Boolean(c)))).sort(),
    [visible]
  );

  // 分类筛选 + 关键词检索（文件名 / 标题 / 分类 / 标签）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((m) => {
      if (category && m.category !== category) return false;
      if (!q) return true;
      return [m.filename, m.title, m.category, ...(m.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [visible, query, category]);

  const shown = useMemo(() => filtered.slice(0, visibleLimit), [filtered, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(60);
  }, [tab, query, category]);

  useEffect(() => {
    // 切换类型时清掉不属于当前类型的分类筛选
    setCategory('');
    setVisibleLimit(60);
  }, [tab]);

  const handleSync = async (item: MaterialItem) => {
    const key = `${item.type}/${item.filename}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: item.type, filename: item.filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '同步失败');
      setMaterials((prev) =>
        prev.map((m) => (m.type === item.type && m.filename === item.filename ? { ...m, synced: true } : m))
      );
      setNotice(`已同步 ${item.filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步失败');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (item: MaterialItem) => {
    if (item.referenceCount > 0) return;
    const localOnly = item.type === 'results';
    const message = localOnly
      ? `确定删除 ${item.filename}？（仅删除本地文件）`
      : `确定删除 ${item.filename}？（本地文件和对象存储副本一并删除）`;
    if (!confirm(message)) return;

    const key = `${item.type}/${item.filename}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      const res = await fetch(
        `/api/assets?type=${encodeURIComponent(item.type)}&filename=${encodeURIComponent(item.filename)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error || '删除失败');
      setMaterials((prev) => prev.filter((m) => !(m.type === item.type && m.filename === item.filename)));
      setNotice(`已删除 ${item.filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 pb-24">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-blue-500" />
            <h1 className="text-[16px] font-semibold text-gray-900">素材中心</h1>
            <span className="text-[12px] text-gray-400">{materials.length} 个文件</span>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <p className="text-[11px] text-gray-400 mb-3">
          缩略图统一引用本地文件；对象存储副本仅用于给模型拉取素材。被穿搭方案引用的素材不可删除。已导入服装图库、姿势图库的素材，可按分类与关键词检索。
        </p>

        <div className="relative mb-4">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索文件名、标题、分类或关键词"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-[12px] focus:outline-none focus:border-blue-400"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <span className="text-[11px] text-gray-400">分类</span>
            <button
              onClick={() => setCategory('')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                category === '' ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              全部
            </button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  category === c ? 'bg-gray-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {c}
              </button>
            ))}
            <span className="text-[11px] text-gray-400 ml-auto">共 {filtered.length} 项</span>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mb-4">
          {TYPE_TABS.map((item) => {
            const active = tab === item.value;
            return (
              <button
                key={item.value}
                onClick={() => setTab(item.value)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                  active ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label} {counts[item.value] ?? 0}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 rounded-xl text-[13px] text-red-600 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="mb-4 p-3 bg-green-50 rounded-xl text-[13px] text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-[13px] text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-gray-400">
            {query.trim() ? '没有匹配的素材' : '暂无素材'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {shown.map((item) => {
              const key = `${item.type}/${item.filename}`;
              const busy = busyKey === key;
              const disabledDelete = item.referenceCount > 0 || busy;
              const localOnly = item.type === 'results';

              return (
                <div key={key} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                  <div className="relative aspect-square bg-gray-50">
                    {/* 缩略图一律引用本地地址 */}
                    <button
                      type="button"
                      onClick={() => setPreviewImage(item.localPath)}
                      title="点击查看大图"
                      className="w-full h-full block cursor-zoom-in"
                    >
                      <img
                        src={item.localPath}
                        alt={item.filename}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    </button>
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white">
                      {item.source || MATERIAL_LABELS[item.type]}
                    </div>
                    <div
                      className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] text-white ${
                        localOnly ? 'bg-blue-500/90' : item.synced ? 'bg-green-500/90' : 'bg-amber-500/90'
                      }`}
                    >
                      {localOnly ? '本地生成' : item.synced ? '已同步' : '仅本地'}
                    </div>
                  </div>

                  <div className="p-2">
                    <p className="text-[11px] text-gray-700 font-medium truncate" title={item.title || item.filename}>
                      {item.title || item.filename}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {item.category ? `${item.category} · ` : ''}
                      {formatSize(item.size)} · {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                    </p>
                    {item.title && (
                      <p className="text-[9px] text-gray-400 truncate" title={item.filename}>
                        {item.filename}
                      </p>
                    )}
                    {item.tags && item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-[9px]">
                            {tag}
                          </span>
                        ))}
                        {item.tags.length > 3 && (
                          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded text-[9px]">
                            +{item.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                    {item.referenceCount > 0 && (
                      <p className="text-[10px] text-amber-600 mt-0.5">{item.referenceReason}</p>
                    )}

                    <div className="flex gap-1.5 mt-2">
                      {item.remoteUrl && (
                        <a
                          href={item.remoteUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="查看图库原图"
                          className="flex items-center justify-center px-2 py-1.5 text-[11px] rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {!localOnly && (
                        <button
                          onClick={() => handleSync(item)}
                          disabled={busy || item.synced}
                          title={item.synced ? '已同步' : '同步到对象存储'}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudUpload className="w-3 h-3" />}
                          {item.synced ? '已同步' : '同步'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(item)}
                        disabled={disabledDelete}
                        title={item.referenceCount > 0 ? item.referenceReason : localOnly ? '删除本地文件' : '删除本地与对象存储文件'}
                        className={`${
                          localOnly ? 'flex-1' : ''
                        } flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] rounded-lg bg-red-50 text-red-600 hover:bg-red-100 disabled:bg-gray-50 disabled:text-gray-400`}
                      >
                        <Trash2 className="w-3 h-3" />
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && filtered.length > shown.length && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setVisibleLimit((v) => v + 60)}
              className="px-4 py-2 text-[12px] text-gray-600 bg-gray-50 rounded-xl hover:bg-gray-100"
            >
              加载更多（剩余 {filtered.length - shown.length}）
            </button>
          </div>
        )}
      </div>

      {/* 图片放大预览 */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 overflow-auto flex"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 hover:bg-white text-gray-900 rounded-full flex items-center justify-center transition-colors shadow-lg"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={previewImage}
            alt="预览大图"
            className="m-auto rounded-xl shadow-2xl max-w-none max-h-none"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
