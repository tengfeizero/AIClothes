import { promises as fs } from 'fs';
import path from 'path';

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function getUploadDir(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function getPublicUrl(filePath: string): string {
  const uploadDir = getUploadDir();
  if (filePath.startsWith(uploadDir)) {
    return filePath.replace(path.join(process.cwd(), 'public'), '');
  }
  return filePath;
}

export function getFileExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return ext || '.jpg';
}

export function isImageFile(filename: string): boolean {
  const ext = getFileExt(filename);
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext);
}
