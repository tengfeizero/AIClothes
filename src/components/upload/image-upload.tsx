'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';
import { cacheImageUrl, cn } from '@/lib/utils';

export interface UploadedFileInfo {
  /** 本地文件路径，如 /uploads/garment/xxx.jpg */
  publicPath?: string;
}

interface ImageUploadProps {
  value?: string | null;
  onChange: (path: string | null, file?: File, uploaded?: UploadedFileInfo) => void;
  type: 'general' | 'garment' | 'item' | 'model' | 'pose' | 'background';
  label: string;
  description?: string;
  className?: string;
  /** 紧凑模式：上传区固定 h-32（与自由生图页一致），默认为正方形大图 */
  compact?: boolean;
}

export function ImageUpload({ value, onChange, type, label, description, className, compact }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }

    setUploading(true);

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '上传失败');
      }

      const data = await res.json();
      // 使用COS完整URL（data.url），确保腾讯云MPS能通过公网访问图片
      onChange(data.url || data.path, file, { publicPath: data.publicPath });
    } catch (error) {
      alert(error instanceof Error ? error.message : '上传失败');
      setPreview(null);
      onChange(null);
    } finally {
      setUploading(false);
    }
  }, [type, onChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleClear = () => {
    setPreview(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const displayUrl = preview || (value ? value : null);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        {uploading && <span className="text-xs text-blue-600">上传中...</span>}
      </div>
      {description && <p className="text-xs text-gray-400">{description}</p>}

      {displayUrl ? (
        <div className="relative group">
          <img
            src={cacheImageUrl(displayUrl)}
            alt={label}
            className={cn(
              'w-full rounded-xl border border-gray-200',
              compact ? 'h-32 bg-gray-50 object-contain' : 'aspect-square object-cover'
            )}
          />
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            'w-full border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors',
            compact ? 'h-32 flex-row gap-3' : 'aspect-square flex-col gap-2',
            uploading && 'pointer-events-none opacity-50'
          )}
        >
          <div className={cn('bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0', compact ? 'w-8 h-8' : 'w-10 h-10')}>
            {uploading ? (
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <ImageIcon className={compact ? 'w-4 h-4 text-gray-400' : 'w-5 h-5 text-gray-400'} />
            )}
          </div>
          <div className={compact ? 'text-left' : 'text-center'}>
            <p className="text-sm font-medium text-gray-600">
              <Upload className="w-4 h-4 inline mr-1" />
              点击或拖拽上传
            </p>
            <p className="text-xs text-gray-400 mt-1">支持 JPG/PNG/WebP</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
