import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir, getUploadDir, getPublicUrl, getFileExt } from '../utils/file';
import { generateId } from '../utils/id';

export interface SaveFileOptions {
  type: 'garment' | 'model' | 'pose' | 'background' | 'results';
  filename: string;
  buffer: Buffer;
}

export interface SavedFile {
  id: string;
  absolutePath: string;
  publicPath: string;
  url: string;
}

export async function saveUploadedFile(options: SaveFileOptions): Promise<SavedFile> {
  const { type, filename, buffer } = options;
  const uploadDir = getUploadDir();
  const targetDir = path.join(uploadDir, type);
  await ensureDir(targetDir);

  const id = generateId();
  const ext = getFileExt(filename);
  const savedFilename = `${id}${ext}`;
  const absolutePath = path.join(targetDir, savedFilename);

  await fs.writeFile(absolutePath, buffer);

  const publicPath = path.join('/uploads', type, savedFilename).replace(/\\/g, '/');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return {
    id,
    absolutePath,
    publicPath,
    url: `${appUrl}${publicPath}`,
  };
}

export async function saveResultFile(buffer: Buffer, ext: string = '.jpg'): Promise<SavedFile> {
  return saveUploadedFile({
    type: 'results',
    filename: `result${ext}`,
    buffer,
  });
}

export async function downloadImageAsBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
