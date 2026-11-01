'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Loader2, RefreshCw, Trash2, CloudUpload, AlertCircle, CheckCircle2, X, Search, ExternalLink, User, Plus, Star, Shirt, ImageIcon } from 'lucide-react';
import { ImageUpload, type UploadedFileInfo } from '@/components/upload/image-upload';
import {
  isItemCategory,
  ITEM_CATEGORIES,
  ITEM_CATEGORY_LABELS,
  MATERIAL_LABELS,
  type ItemCategory,
  type MaterialItem,
  type MaterialType,
} from '@/lib/storage/material-types';

type TabValue = MaterialType | 'all';

const TYPE_TABS: Array<{ value: TabValue; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'general', label: MATERIAL_LABELS.general },
  { value: 'garment', label: MATERIAL_LABELS.garment },
  { value: 'item', label: MATERIAL_LABELS.item },
  { value: 'model', label: MATERIAL_LABELS.model },
  { value: 'pose', label: MATERIAL_LABELS.pose },
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
  const [tab, setTab] = useState<TabValue>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState<ItemCategory | ''>('');
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showModelForm, setShowModelForm] = useState(false);
  const [modelName, setModelName] = useState('');
  const [modelGender, setModelGender] = useState<'female' | 'male'>('female');
  const [modelImage, setModelImage] = useState<string | null>(null);
  const [savingModel, setSavingModel] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemSubCategory, setItemSubCategory] = useState<ItemCategory>('top');
  const [itemImage, setItemImage] = useState<string | null>(null);
  const [itemFilename, setItemFilename] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [showGeneralForm, setShowGeneralForm] = useState(false);
  const [generalName, setGeneralName] = useState('');
  const [generalImage, setGeneralImage] = useState<string | null>(null);
  const [generalFilename, setGeneralFilename] = useState('');
  const [savingGeneral, setSavingGeneral] = useState(false);

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

  // 背景并入通用：通用标签下同时展示 general + background
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: materials.length };
    for (const item of materials) {
      map[item.type] = (map[item.type] || 0) + 1;
    }
    map.general = (map.general || 0) + (map.background || 0);
    return map;
  }, [materials]);

  const visible = useMemo(() => {
    if (tab === 'all') return materials;
    if (tab === 'general') return materials.filter((m) => m.type === 'general' || m.type === 'background');
    return materials.filter((m) => m.type === tab);
  }, [materials, tab]);

  // 当前分类下可选分类（图库素材才有分类；单品子类单独用一行筛选，不混入）
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          visible
            .map((m) => m.category)
            .filter((c): c is string => Boolean(c) && !isItemCategory(c))
        )
      ).sort(),
    [visible]
  );

  // 子类 / 分类筛选 + 关键词检索（文件名 / 标题 / 分类 / 标签）
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((m) => {
      if (subCategory && m.itemCategory !== subCategory) return false;
      if (category && m.category !== category) return false;
      if (!q) return true;
      return [
        m.filename,
        m.title,
        m.category,
        m.itemCategory ? ITEM_CATEGORY_LABELS[m.itemCategory] : '',
        ...(m.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [visible, query, category, subCategory]);

  const shown = useMemo(() => filtered.slice(0, visibleLimit), [filtered, visibleLimit]);

  useEffect(() => {
    setVisibleLimit(60);
  }, [tab, query, category, subCategory]);

  useEffect(() => {
    // 切换类型时清掉不属于当前类型的子类与分类筛选
    setCategory('');
    setSubCategory('');
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

  const handleCreateModel = async () => {
    if (!modelName.trim() || !modelImage) {
      setError('请填写模特名称并上传人物照片');
      return;
    }
    setSavingModel(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: modelName.trim(),
          identityImagePath: modelImage,
          avatarPath: modelImage,
          gender: modelGender,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存模特失败');
      setNotice(`已添加模特「${modelName.trim()}」，并设为默认模特`);
      setShowModelForm(false);
      setModelName('');
      setModelImage(null);
      setModelGender('female');
      setTab('model');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存模特失败');
    } finally {
      setSavingModel(false);
    }
  };

  // 单品统一存 uploads/item，子类只影响元数据，切换时无需重新上传
  const handleItemSubCategoryChange = (next: ItemCategory) => {
    setItemSubCategory(next);
  };

  const handleItemFileChange = (path: string | null, _file?: File, uploaded?: UploadedFileInfo) => {
    setItemImage(path);
    const filename = uploaded?.publicPath ? uploaded.publicPath.split('/').pop() || '' : '';
    setItemFilename(decodeURIComponent(filename));
  };

  const handleCreateItem = async () => {
    if (!itemImage || !itemFilename) {
      setError('请上传单品图片');
      return;
    }
    setSavingItem(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'metadata',
          type: 'item',
          filename: itemFilename,
          category: itemSubCategory,
          title: itemName.trim() || undefined,
          source: '单品上传',
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error || '保存单品失败');
      setNotice(`已添加单品「${itemName.trim() || itemFilename}」`);
      setShowItemForm(false);
      setItemName('');
      setItemImage(null);
      setItemFilename('');
      setItemSubCategory('top');
      setTab('item');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存单品失败');
    } finally {
      setSavingItem(false);
    }
  };

  const handleGeneralFileChange = (path: string | null, _file?: File, uploaded?: UploadedFileInfo) => {
    setGeneralImage(path);
    const filename = uploaded?.publicPath ? uploaded.publicPath.split('/').pop() || '' : '';
    setGeneralFilename(decodeURIComponent(filename));
  };

  const handleCreateGeneral = async () => {
    if (!generalImage || !generalFilename) {
      setError('请上传图片');
      return;
    }
    setSavingGeneral(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'metadata',
          type: 'general',
          filename: generalFilename,
          title: generalName.trim() || undefined,
          source: '通用上传',
        }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error || '保存通用素材失败');
      setNotice(`已添加通用素材「${generalName.trim() || generalFilename}」`);
      setShowGeneralForm(false);
      setGeneralName('');
      setGeneralImage(null);
      setGeneralFilename('');
      setTab('general');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存通用素材失败');
    } finally {
      setSavingGeneral(false);
    }
  };

  const handleSetDefaultModel = async (item: MaterialItem) => {
    if (!item.modelId) return;
    setBusyKey(`${item.type}/${item.filename}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/model/${item.modelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setDefault: true }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error || '设置默认模特失败');
      await load();
      setNotice(`已将「${item.title || item.filename}」设为默认模特`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '设置默认模特失败');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (item: MaterialItem) => {
    if (item.referenceCount > 0) return;
    const localOnly = item.type === 'results';
    const isModel = Boolean(item.modelId);
    const message = isModel
      ? `确定删除模特「${item.title || item.filename}」？（模特记录与图片文件一并删除）`
      : localOnly
        ? `确定删除 ${item.filename}？（仅删除本地文件）`
        : `确定删除 ${item.filename}？（本地文件和对象存储副本一并删除）`;
    if (!confirm(message)) return;

    const key = `${item.type}/${item.filename}`;
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      // 模特素材需先删除模特记录，被穿搭方案使用时接口会拒绝
      if (item.modelId) {
        const res = await fetch(`/api/model/${item.modelId}`, { method: 'DELETE' });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}) as { error?: string });
          throw new Error(data.error || '删除模特失败');
        }
      }
      const res = await fetch(
        `/api/assets?type=${encodeURIComponent(item.type)}&filename=${encodeURIComponent(item.filename)}`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error || '删除失败');
      if (item.modelId) {
        await load();
        setNotice(`已删除模特「${item.title || item.filename}」`);
      } else {
        setMaterials((prev) => prev.filter((m) => !(m.type === item.type && m.filename === item.filename)));
        setNotice(`已删除 ${item.filename}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto p-4 pb-24">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-blue-500" />
            <h1 className="text-[16px] font-semibold text-gray-900">素材中心</h1>
            <span className="text-[12px] text-gray-400">{materials.length} 个文件</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                setError('');
                setNotice('');
                setShowGeneralForm(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              上传通用
            </button>
            <button
              onClick={() => {
                setError('');
                setNotice('');
                setShowItemForm(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              <Shirt className="w-3.5 h-3.5" />
              上传单品
            </button>
            <button
              onClick={() => {
                setError('');
                setNotice('');
                setShowModelForm(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-white bg-purple-600 rounded-lg hover:bg-purple-700"
            >
              <User className="w-3.5 h-3.5" />
              上传模特
            </button>
            <button
              onClick={load}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 mb-3">
          缩略图统一引用本地文件；对象存储副本仅用于给模型拉取素材。被穿搭方案引用的素材不可删除。套装为服装图库素材；单品包含上装、下装、连衣裙、配饰、鞋履，上传时选择子类即可按子类筛选。模特在此上传后会出现在换装/穿搭方案的模特列表，并自动设为默认。
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

        {tab === 'item' && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[11px] text-gray-400">子类</span>
            <button
              onClick={() => setSubCategory('')}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                subCategory === '' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              全部
            </button>
            {ITEM_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setSubCategory(c)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  subCategory === c ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {ITEM_CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}

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
              const typeLabel = item.itemCategory
                ? ITEM_CATEGORY_LABELS[item.itemCategory]
                : MATERIAL_LABELS[item.type];
              const displayCategory = item.itemCategory
                ? ITEM_CATEGORY_LABELS[item.itemCategory]
                : item.category;

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
                    <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[10px] text-white flex items-center gap-0.5">
                      {item.isDefault && <Star className="w-2.5 h-2.5 text-yellow-400" />}
                      {item.isDefault ? '默认模特' : item.source || typeLabel}
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
                      {displayCategory ? `${displayCategory} · ` : ''}
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
                      {item.modelId && !item.isDefault && (
                        <button
                          onClick={() => handleSetDefaultModel(item)}
                          disabled={busy}
                          title="设为默认模特"
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 disabled:bg-gray-50 disabled:text-gray-400"
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                          设为默认
                        </button>
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
                        title={
                          item.referenceCount > 0
                            ? item.referenceReason
                            : item.modelId
                              ? '删除模特记录与图片文件'
                              : localOnly
                                ? '删除本地文件'
                                : '删除本地与对象存储文件'
                        }
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

      {/* 上传模特 */}
      {showModelForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowModelForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-gray-900">上传模特</h3>
              <button
                type="button"
                onClick={() => setShowModelForm(false)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <ImageUpload
                label="人物照片（必填）"
                description="建议上传清晰的正面单人照，背景简洁"
                type="model"
                value={modelImage}
                onChange={(path) => setModelImage(path)}
                compact
              />
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">模特名称</label>
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="例如：我的数字人"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">性别</label>
                <div className="flex gap-2">
                  {(['female', 'male'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setModelGender(g)}
                      className={`px-4 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                        modelGender === g
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      {g === 'female' ? '女' : '男'}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                保存后自动设为默认模特，换装与穿搭方案会优先使用；被穿搭方案使用中的模特不可删除。
              </p>
              {error && (
                <p className="text-[11px] text-red-600 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowModelForm(false)}
                  className="flex-1 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateModel}
                  disabled={savingModel || !modelName.trim() || !modelImage}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {savingModel ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> 保存模特
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 上传单品 */}
      {showItemForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowItemForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-gray-900">上传单品</h3>
              <button
                type="button"
                onClick={() => setShowItemForm(false)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">子类</label>
                <div className="flex flex-wrap gap-2">
                  {ITEM_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleItemSubCategoryChange(c)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                        itemSubCategory === c
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      {ITEM_CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>
              <ImageUpload
                label="单品图片（必填）"
                description="建议上传白底平铺图，背景简洁"
                type="item"
                value={itemImage}
                onChange={handleItemFileChange}
                compact
              />
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">单品名称（选填）</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="例如：白色针织衫"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-blue-400"
                />
              </div>
              <p className="text-[11px] text-gray-400">
                单品统一存放在 uploads/item，按所选子类记录；保存后可在“单品”分类下按上装、下装、连衣裙、配饰、鞋履筛选。
              </p>
              {error && (
                <p className="text-[11px] text-red-600 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowItemForm(false)}
                  className="flex-1 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateItem}
                  disabled={savingItem || !itemImage || !itemFilename}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {savingItem ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> 保存单品
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 上传通用 */}
      {showGeneralForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowGeneralForm(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[15px] font-semibold text-gray-900">上传通用</h3>
              <button
                type="button"
                onClick={() => setShowGeneralForm(false)}
                className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <ImageUpload
                label="通用图片（必填）"
                description="可上传背景、场景或其它通用素材"
                type="general"
                value={generalImage}
                onChange={handleGeneralFileChange}
                compact
              />
              <div>
                <label className="block text-[12px] font-medium text-gray-700 mb-1">名称（选填）</label>
                <input
                  type="text"
                  value={generalName}
                  onChange={(e) => setGeneralName(e.target.value)}
                  placeholder="例如：咖啡馆场景"
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-emerald-400"
                />
              </div>
              <p className="text-[11px] text-gray-400">
                通用素材存放在 uploads/general，与背景素材一起展示在“通用”分类下。
              </p>
              {error && (
                <p className="text-[11px] text-red-600 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {error}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowGeneralForm(false)}
                  className="flex-1 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleCreateGeneral}
                  disabled={savingGeneral || !generalImage || !generalFilename}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {savingGeneral ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" /> 保存通用
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
