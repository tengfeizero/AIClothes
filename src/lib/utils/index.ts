import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * 将外部图片 URL 代理到本地缓存。
 * 本地路径（/uploads/xxx）直接返回；外部 URL 走 /api/image-cache 代理缓存。
 */
export function cacheImageUrl(url: string): string {
  if (!url) return url;
  // 仅代理 http/https 外部图片，本地路径、data:/blob: 等直接返回
  if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  return `/api/image-cache?url=${encodeURIComponent(url)}`;
}
