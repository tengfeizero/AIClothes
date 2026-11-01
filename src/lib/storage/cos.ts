// @ts-ignore - cos-nodejs-sdk-v5 is CommonJS
import COS = require('cos-nodejs-sdk-v5');
import { generateId } from '../utils/id';
import {
  saveUploadedFile as saveLocalUploadedFile,
  saveResultFile as saveLocalResultFile,
} from './local';
import {
  deleteAliyunOssObject,
  isAliyunOssConfigured,
  listAliyunOssObjects,
  putObjectToAliyunOss,
} from './aliyun-oss';

const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const COS_BUCKET = process.env.TENCENT_COS_BUCKET || '';
const COS_REGION = process.env.TENCENT_COS_REGION || 'ap-guangzhou';
const COS_PUBLIC_URL = process.env.TENCENT_COS_PUBLIC_URL || '';

/** 对象存储提供方：aliyun（阿里云 OSS）| tencent（腾讯云 COS） */
const OSS_PROVIDER = (process.env.STORAGE_PROVIDER || process.env.OSS_PROVIDER || 'tencent')
  .trim()
  .toLowerCase();

function useAliyunOss(): boolean {
  if (OSS_PROVIDER === 'aliyun') {
    if (!isAliyunOssConfigured()) {
      throw new Error(
        'OSS_PROVIDER=aliyun but Aliyun OSS is not configured. Please set ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET in .env.local'
      );
    }
    return true;
  }
  return false;
}

async function uploadToRemote(key: string, buffer: Buffer, contentType: string): Promise<string> {
  if (useAliyunOss()) {
    return putObjectToAliyunOss(key, buffer, contentType);
  }

  const cos = getCos();
  await cos.putObject({
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: 'public-read',
  });

  return COS_PUBLIC_URL
    ? `${COS_PUBLIC_URL}/${key}`
    : `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`;
}

export interface SaveFileOptions {
  type: 'general' | 'garment' | 'model' | 'pose' | 'background' | 'results' | 'accessories' | 'shoes' | 'model3d';
  filename: string;
  buffer: Buffer;
  contentType?: string;
}

export interface SavedFile {
  id: string;
  /** COS 对象键（仅上传到 COS 的文件才有；本地文件为空字符串） */
  key: string;
  publicPath: string;
  url: string;
}

/**
 * 生成结果类型：这些是 AI 生成的产物（图片/3D 模型），无需上传到 COS，
 * 直接落本地 public/uploads/ 即可。
 * 其余类型（garment/model/pose/background/accessories/shoes）是用户上传的素材，
 * 必须上传 COS 提供公网 URL，供 AI 厂商读取输入图。
 */
const LOCAL_RESULT_TYPES = new Set<string>(['results', 'model3d']);

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

export async function saveUploadedFile(options: SaveFileOptions): Promise<SavedFile> {
  const { type, filename, buffer, contentType } = options;

  // AI 生成的产物（results/model3d）落本地，不上传 COS
  if (LOCAL_RESULT_TYPES.has(type)) {
    const local = await saveLocalUploadedFile({
      type: type as 'results' | 'model3d',
      filename,
      buffer,
    });
    return {
      id: local.id,
      key: '',
      publicPath: local.publicPath,
      url: local.url,
    };
  }

  // 用户上传的素材：先落本地（缓存），再同步到对象存储（提供公网 URL 给 AI 厂商）
  const id = generateId();
  const ext = getFileExt(filename);
  const key = `uploads/${type}/${id}${ext}`;
  const fileContentType = contentType || getContentType(filename);

  // 1. 先写本地，文件名与对象存储保持一致（同 id）
  await saveLocalUploadedFile({ type, filename, buffer, id });

  // 2. 再同步到对象存储（阿里云 OSS / 腾讯云 COS，由 OSS_PROVIDER 决定）
  const url = await uploadToRemote(key, buffer, fileContentType);

  return {
    id,
    key,
    publicPath: `/${key}`,
    url,
  };
}

export async function saveResultFile(buffer: Buffer, ext: string = '.jpg'): Promise<SavedFile> {
  // 生成结果直接存本地
  const local = await saveLocalResultFile(buffer, ext);
  return {
    id: local.id,
    key: '',
    publicPath: local.publicPath,
    url: local.url,
  };
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

/** 对象存储是否已配置（未配置时素材只保留本地副本） */
export function isRemoteStorageConfigured(): boolean {
  if (OSS_PROVIDER === 'aliyun') return isAliyunOssConfigured();
  return Boolean(SECRET_ID && SECRET_KEY && COS_BUCKET);
}

/** 列出对象存储中指定前缀下的 key 列表 */
export async function listRemoteKeys(prefix: string): Promise<string[]> {
  if (useAliyunOss()) {
    return listAliyunOssObjects(prefix);
  }
  const cos = getCos();
  const res = await cos.getBucket({
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Prefix: prefix,
    MaxKeys: 1000,
  });
  return (res.Contents || [])
    .map((item) => item.Key)
    .filter((key): key is string => Boolean(key));
}

/** 删除对象存储中的文件（文件不存在时视为成功） */
export async function deleteRemoteObject(key: string): Promise<void> {
  if (useAliyunOss()) {
    await deleteAliyunOssObject(key);
    return;
  }
  await getCos().deleteObject({
    Bucket: COS_BUCKET,
    Region: COS_REGION,
    Key: key,
  });
}

/** 上传本地文件到对象存储，返回公网 URL（素材同步用） */
export async function uploadFileToRemote(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  return uploadToRemote(key, buffer, contentType);
}

export function getContentType(filename: string): string {
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
