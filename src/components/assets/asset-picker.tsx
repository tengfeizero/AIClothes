'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';
import {
  ITEM_CATEGORY_LABELS,
  MATERIAL_LABELS,
  materialKey,
  type MaterialItem,
  type MaterialType,
} from '@/lib/storage/material-types';

/** 类型标签（背景并入通用，与素材中心一致） */
const TYPE_TABS: Array<{ value: MaterialType | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'general', label: '通用' },
  { value: 'garment', label: '套装' },
  { value: 'item', label: '单品' },
  { value: 'model', label: '模特' },
  { value: 'pose', label: '姿势' },
  { value: 'results', label: '生成结果' },
];

const PAGE_SIZE = 120;

export interface AssetPickerProps {
  open: boolean;
  /** 最多可选数量，1 为单选（再次选择会替换） */
  maxCount?: number;
  /** 打开时默认选中的类型标签 */
  defaultType?: MaterialType | 'all';
  title?: string;
  onClose: () => void;
  onConfirm: (items: MaterialItem[]) => void;
}

/** 素材中心选择弹窗：搜索 + 类型标签过滤 + 单选/多选 */
export function AssetPicker({
  open,
  maxCount = 1,
  defaultType = 'all',
  title = '从素材中心选择',
  onClose,
  onConfirm,
}: AssetPickerProps) {
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<MaterialType | 'all'>(defaultType);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setQuery('');
    setType(defaultType);
    setSelected(new Set());
    setLimit(PAGE_SIZE);
    setError('');
    setLoading(true);

    (async () => {
      try {
        const res = await fetch('/api/assets');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '素材加载失败');
        // 已同步到对象存储的素材排在最前（厂商可直接拉取），同组内保持原有时间倒序
        const materials: MaterialItem[] = data.materials || [];
        if (!cancelled) {
          setItems([...materials].sort((a, b) => Number(b.synced) - Number(a.synced)));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '素材加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, defaultType]);

  const typeFiltered = useMemo(() => {
    if (type === 'all') return items;
    if (type === 'general') {
      return items.filter((item) => item.type === 'general' || item.type === 'background');
    }
    return items.filter((item) => item.type === type);
  }, [items, type]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return typeFiltered;
    return typeFiltered.filter((item) => {
      const categoryLabel = item.itemCategory ? ITEM_CATEGORY_LABELS[item.itemCategory] : '';
      return [
        item.title || '',
        item.filename,
        MATERIAL_LABELS[item.type],
        categoryLabel,
        item.category || '',
        ...item.tags,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [typeFiltered, query]);

  if (!open) return null;

  const toggle = (item: MaterialItem) => {
    const key = materialKey(item);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      if (next.size >= maxCount) {
        // 单选时直接替换；多选达到上限时忽略
        return maxCount === 1 ? new Set([key]) : prev;
      }
      next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const picked = Array.from(selected)
      .map((key) => items.find((item) => materialKey(item) === key))
      .filter((item): item is MaterialItem => Boolean(item));
    if (picked.length === 0) return;
    onConfirm(picked);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              已选 {selected.size} / {maxCount} 张
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 flex items-center justify-center"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              placeholder="搜索名称、分类或标签"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-[13px] focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex gap-1.5 mt-2.5 overflow-x-auto">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setType(tab.value);
                  setLimit(PAGE_SIZE);
                }}
                className={`px-2.5 py-1 text-[12px] rounded-lg border whitespace-nowrap transition-colors ${
                  type === tab.value
                    ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-gray-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 加载素材...
            </div>
          ) : error ? (
            <div className="py-16 text-center text-[13px] text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-[13px] text-gray-400">
              暂无素材，可先去素材中心上传
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {filtered.slice(0, limit).map((item) => {
                const key = materialKey(item);
                const isSelected = selected.has(key);
                const order = isSelected && maxCount > 1 ? Array.from(selected).indexOf(key) + 1 : 0;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(item)}
                    className={`relative aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-transparent hover:border-gray-300'
                    }`}
                  >
                    <img
                      src={cacheImageUrl(item.localPath)}
                      alt={item.title || item.filename}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full bg-blue-500 text-white flex items-center justify-center">
                        {maxCount > 1 ? (
                          <span className="text-[10px] font-semibold">{order}</span>
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-1 text-[10px] text-white truncate text-left">
                      {MATERIAL_LABELS[item.type]}
                      {item.itemCategory ? ` · ${ITEM_CATEGORY_LABELS[item.itemCategory]}` : ''}
                      {item.title ? ` · ${item.title}` : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {!loading && !error && filtered.length > limit && (
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="px-3 py-1.5 text-[12px] text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                加载更多（{filtered.length - limit}）
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            确认选择
          </button>
        </div>
      </div>
    </div>
  );
}
