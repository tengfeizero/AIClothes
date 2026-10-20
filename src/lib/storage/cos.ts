// @ts-ignore - cos-nodejs-sdk-v5 is CommonJS
import COS = require('cos-nodejs-sdk-v5');
import { generateId } from '../utils/id';

const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const COS_BUCKET = process.env.TENCENT_COS_BUCKET || '';
const COS_REGION = process.env.TENCENT_COS_REGION || 'ap-guangzhou';
const COS_PUBLIC_URL = process.env.TENCENT_COS_PUBLIC_URL || '';

export interface SaveFileOptions {
  type: 'garment' | 'model' | 'pose' | 'background' | 'results' | 'accessories' | 'shoes' | 'model3d';
  filename: string;
  buffer: Buffer;
  contentType?: string;
}

export interface SavedFile {
  id: string;
  key: string;
  publicPath: string;
  url: string;
}

let cosInstance: COS | null = null;

function getCos(): COS {
  if (!cosInstance) {
    if (!SECRET_ID || !SECRET_KEY || !COS_BUCKET) {
      throw new Error('Tencent COS not configured. Please set TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_COS_BUCKET in .env.local');
    }
    cosInstance = new COS({
      SecretId: SECRET_ID,
      SecretKey: SECRET_KEY,
    });
  }
  return cosInstance;
}

function getFileExt(filename: string): string {
  const ext = filename.split('.').pop();
  return ext ? `.${ext.toLowerCase()}` : '.jpg';
}

function getContentType(filename: string): string {
  const ext = getFileExt(filename);
  const types: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.obj': 'text/plain',
  };
  return types[ext] || 'image/jpeg';
}

export async function saveUploadedFile(options: SaveFileOptions): Promise<SavedFile> {
  const { type, filename, buffer, contentType } = options;
  const cos = getCos();

  const id = generateId();
  const ext = getFileExt(filename);
  const key = `uploads/${type}/${id}${ext}`;

  await cos.putObject({
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Key: key,
    Body: buffer,
    ContentType: contentType || getContentType(filename),
    ACL: 'public-read',
  });

  const url = COS_PUBLIC_URL ? `${COS_PUBLIC_URL}/${key}` : `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;

  return {
    id,
    key,
    publicPath: `/${key}`,
    url,
  };
}

export async function saveResultFile(buffer: Buffer, ext: string = '.jpg'): Promise<SavedFile> {
  return saveUploadedFile({
    type: 'results',
    filename: `result${ext}`,
    buffer,
    contentType: ext === '.png' ? 'image/png' : 'image/jpeg',
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

export function getCosConfig() {
  return {
    bucket: COS_BUCKET,
    region: COS_REGION,
    outputDir: '/results/',
  };
}
