'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Images, X } from 'lucide-react';
import { cacheImageUrl } from '@/lib/utils';
import { getMaterialSourceUrl, type MaterialType } from '@/lib/storage/material-types';
import { AssetPicker } from './asset-picker';

export interface AssetSelectProps {
  label: string;
  description?: string;
  value: string | null;
  onChange: (path: string | null) => void;
  /** 弹窗标题，默认用 label */
  pickerTitle?: string;
  /** 打开弹窗时的默认类型标签 */
  defaultType?: MaterialType | 'all';
  placeholder?: string;
}

/** 单个图片选择框：从素材中心选择，已选后可预览与移除 */
export function AssetSelect({
  label,
  description,
  value,
  onChange,
  pickerTitle,
  defaultType = 'all',
  placeholder = '从素材中心选择',
}: AssetSelectProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block text-[13px] font-medium text-gray-700">{label}</label>
      {description && <p className="text-xs text-gray-400">{description}</p>}

      {value ? (
        <div className="relative w-full h-32 rounded-xl overflow-hidden bg-gray-50 border border-gray-100">
          <Image src={cacheImageUrl(value)} alt={label} fill className="object-contain" unoptimized />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 p-1 bg-white/90 rounded-full shadow-sm hover:bg-white"
            aria-label="移除"
          >
            <X className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-row items-center justify-center gap-3 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
        >
          <div className="bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 w-8 h-8">
            <Images className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-gray-600">{placeholder}</p>
            <p className="text-xs text-gray-400 mt-1">支持搜索与类型筛选</p>
          </div>
        </button>
      )}

      <AssetPicker
        open={open}
        maxCount={1}
        defaultType={defaultType}
        title={pickerTitle || label}
        onClose={() => setOpen(false)}
        onConfirm={(items) => {
          if (items[0]) onChange(getMaterialSourceUrl(items[0]));
          setOpen(false);
        }}
      />
    </div>
  );
}
