// 火山引擎即梦 Seedream 4.6 异步客户端。
// 文档：https://www.volcengine.com/docs/6444/1340578
// - 提交任务：POST https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31
// - 查询任务：POST https://visual.volcengineapi.com?Action=CVSync2AsyncGetResult&Version=2022-08-31
// - Region: cn-north-1, Service: cv

import { createHmac, createHash } from 'crypto';

const ACCESS_KEY = process.env.VOLCENGINE_ACCESS_KEY || '';
const SECRET_KEY = process.env.VOLCENGINE_SECRET_KEY || '';
const REGION = process.env.VOLCENGINE_REGION || 'cn-north-1';

const BASE_URL = 'https://visual.volcengineapi.com';

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * 生成火山引擎签名所需的 Authorization header。
 */
async function buildAuthHeaders(method: string, body: string, action: string): Promise<Record<string, string>> {
  if (!ACCESS_KEY || !SECRET_KEY) {
    throw new Error('Volcengine API key not configured. Please set VOLCENGINE_ACCESS_KEY and VOLCENGINE_SECRET_KEY in .env.local');
  }

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateShort = dateStr.slice(0, 8);

  const bodyHashHex = sha256Hex(body);

  // Canonical request
  const canonicalUri = '/';
  const canonicalQueryString = `Action=${action}&Version=2022-08-31`;
  const canonicalHeaders = `content-type:application/json\nhost:visual.volcengineapi.com\nx-content-sha256:${bodyHashHex}\nx-date:${dateStr}\n`;
  const signedHeaders = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${bodyHashHex}`;

  // String to sign
  const credentialScope = `${dateShort}/${REGION}/cv/request`;
  const canonicalHash = sha256Hex(canonicalRequest);
  const stringToSign = `HMAC-SHA256\n${dateStr}\n${credentialScope}\n${canonicalHash}`;

  // Signing key
  const kDate = hmacSha256(SECRET_KEY, dateShort);
  const kRegion = hmacSha256(kDate, REGION);
  const kService = hmacSha256(kRegion, 'cv');
  const kSigning = hmacSha256(kService, 'request');

  const signature = hmacSha256(kSigning, stringToSign).toString('hex');

  return {
    'Content-Type': 'application/json',
    'Host': 'visual.volcengineapi.com',
    'X-Content-Sha256': bodyHashHex,
    'X-Date': dateStr,
    'Authorization': `HMAC-SHA256 Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export interface JimengRequest {
  /** 输入图片 URL 列表（服装图 + 模特图，最多14张） */
  imageUrls: string[];
  /** 提示词（描述穿搭场景、风格、光线等） */
  prompt: string;
  /** 强制单图输出 */
  forceSingle?: boolean;
  /** 文本影响度（1-100，默认50） */
  scale?: number;
  /** 生成图片面积（默认4194304即2K） */
  size?: number;
}

/** 创建即梦异步任务，返回 task_id */
export async function createJimengTask(req: JimengRequest): Promise<string> {
  const bodyObj = {
    req_key: 'jimeng_seedream46_cvtob',
    image_urls: req.imageUrls,
    prompt: req.prompt,
    force_single: req.forceSingle ?? true,
    scale: req.scale ?? 50,
    size: req.size ?? 4194304,
  };

  const body = JSON.stringify(bodyObj);
  const headers = await buildAuthHeaders('POST', body, 'CVSync2AsyncSubmitTask');

  try {
    const res = await fetch(`${BASE_URL}?Action=CVSync2AsyncSubmitTask&Version=2022-08-31`, {
      method: 'POST',
      headers,
      body,
    });
    const data = await res.json().catch(() => ({}));

    if (data.code !== 10000) {
      throw new Error(`即梦任务创建失败: ${data.code} ${data.message || 'unknown'}`);
    }

    const taskId = data.data?.task_id;
    if (!taskId) {
      throw new Error('即梦未返回 task_id');
    }
    return taskId;
  } catch (error) {
    throw new Error(`即梦任务创建失败: ${toErrorMessage(error)}`);
  }
}

export interface JimengTaskResult {
  status: 'in_queue' | 'generating' | 'done' | 'not_found' | 'expired';
  /** 生成结果图 URL（24小时有效） */
  imageUrls?: string[];
  /** base64 格式结果图（备用） */
  binaryDataBase64?: string[];
  message?: string;
}

/** 查询即梦任务状态 */
export async function queryJimengTask(taskId: string): Promise<JimengTaskResult> {
  const bodyObj = {
    req_key: 'jimeng_seedream46_cvtob',
    task_id: taskId,
  };

  const body = JSON.stringify(bodyObj);
  const headers = await buildAuthHeaders('POST', body, 'CVSync2AsyncGetResult');

  const res = await fetch(`${BASE_URL}?Action=CVSync2AsyncGetResult&Version=2022-08-31`, {
    method: 'POST',
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}));

  if (data.code !== 10000) {
    throw new Error(`即梦任务查询失败: ${data.code} ${data.message || 'unknown'}`);
  }

  console.log('[Jimeng] query result:', JSON.stringify(data.data, null, 2).slice(0, 500));

  return {
    status: data.data?.status || 'unknown',
    imageUrls: data.data?.image_urls || [],
    binaryDataBase64: data.data?.binary_data_base64 || [],
    message: data.message,
  };
}

/** 判断是否为火山引擎即梦任务 ID（纯数字格式） */
export function isJimengTaskId(taskId: string): boolean {
  return /^\d{10,}$/.test(taskId);
}

// ═══════════════════════════════════════════════════════════════
// SeedEdit 3.0 指令编辑（图生图）
// 文档：docs/api_seed.md
// req_key: seededit_v3.0
// ═══════════════════════════════════════════════════════════════

export interface SeedEditRequest {
  /** 输入图片 URL（单张） */
  imageUrl: string;
  /** 编辑指令提示词 */
  prompt: string;
  /** 编辑强度（0-1，默认0.5） */
  scale?: number;
  /** 随机种子（默认-1随机） */
  seed?: number;
}

/** 创建 SeedEdit 3.0 异步任务，返回 task_id */
export async function createSeedEditTask(req: SeedEditRequest): Promise<string> {
  const bodyObj = {
    req_key: 'seededit_v3.0',
    image_urls: [req.imageUrl],
    prompt: req.prompt,
    scale: req.scale ?? 0.5,
    seed: req.seed ?? -1,
  };

  const body = JSON.stringify(bodyObj);
  const headers = await buildAuthHeaders('POST', body, 'CVSync2AsyncSubmitTask');

  try {
    const res = await fetch(`${BASE_URL}?Action=CVSync2AsyncSubmitTask&Version=2022-08-31`, {
      method: 'POST',
      headers,
      body,
    });
    const data = await res.json().catch(() => ({}));

    if (data.code !== 10000) {
      throw new Error(`SeedEdit任务创建失败: ${data.code} ${data.message || 'unknown'}`);
    }

    const taskId = data.data?.task_id;
    if (!taskId) {
      throw new Error('SeedEdit未返回 task_id');
    }
    return taskId;
  } catch (error) {
    throw new Error(`SeedEdit任务创建失败: ${toErrorMessage(error)}`);
  }
}

export interface SeedEditTaskResult {
  status: 'in_queue' | 'generating' | 'done' | 'not_found' | 'expired';
  /** 生成结果图 URL（24小时有效，JPEG格式） */
  imageUrls?: string[];
  /** base64 格式结果图（备用） */
  binaryDataBase64?: string[];
  message?: string;
}

/** 查询 SeedEdit 3.0 任务状态 */
export async function querySeedEditTask(taskId: string): Promise<SeedEditTaskResult> {
  const bodyObj = {
    req_key: 'seededit_v3.0',
    task_id: taskId,
  };

  const body = JSON.stringify(bodyObj);
  const headers = await buildAuthHeaders('POST', body, 'CVSync2AsyncGetResult');

  const res = await fetch(`${BASE_URL}?Action=CVSync2AsyncGetResult&Version=2022-08-31`, {
    method: 'POST',
    headers,
    body,
  });
  const data = await res.json().catch(() => ({}));

  if (data.code !== 10000) {
    throw new Error(`SeedEdit任务查询失败: ${data.code} ${data.message || 'unknown'}`);
  }

  console.log('[SeedEdit] query result:', JSON.stringify(data.data, null, 2).slice(0, 500));

  return {
    status: data.data?.status || 'unknown',
    imageUrls: data.data?.image_urls || [],
    binaryDataBase64: data.data?.binary_data_base64 || [],
    message: data.message,
  };
}

/** 判断是否为 SeedEdit 任务 ID（纯数字格式，与即梦相同） */
export function isSeedEditTaskId(taskId: string): boolean {
  return /^\d{10,}$/.test(taskId);
}
