import { getModel } from '@/lib/db/model-store';
import { createTryOnTask, queryTaskResult } from '@/lib/ai/tencent';
import { changeClothes, imageToImage } from '@/lib/ai/hunyuan';
import { generateQwenImage } from '@/lib/ai/aliyun';
import { ALIYUN_QWEN_RESOLUTIONS } from '@/lib/ai/generation-plans';
import { createJimengTask, queryJimengTask, isJimengTaskId, createSeedEditTask, querySeedEditTask } from '@/lib/ai/volcengine';
import { updateTask } from '../task-store';
import { recordImageGenerationForTask } from '@/lib/db/image-generation-store';
import { downloadImageAsBuffer, saveResultFile, saveUploadedFile, getRemotePublicUrl } from '@/lib/storage/cos';
import sharp from 'sharp';
import type { TaskRecord } from '@/types';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60; // 3 minutes max

/** 任务参数：MPS 换装 / 混元换装 / 混元图生图 共用 */
interface TryonTaskParams {
  garmentImagePath: string;
  modelImagePath?: string;
  modelId?: string;
  backgroundPrompt?: string;
  poseImagePath?: string;
  identityImagePath?: string;
  backgroundImagePath?: string;
  accessoriesImagePath?: string;
  shoesImagePath?: string;
  /** 爆款复刻：参考图（复刻姿势与背景） */
  referenceImagePath?: string;
  /** 底层调用能力：mps-tryon | hunyuan-change-clothes | hunyuan-img2img */
  method?: string;
  /** 混元换装：服装类型 */
  clothesType?: string;
  quality?: 'lite' | 'flash' | 'pro';
  resolution?: '1K' | '2K' | '4K';
  view?: string;
  /** 即梦专用：输出面积（1K=1048576, 2K=4194304, 4K=16777216） */
  jimengSize?: number;
  /** 阿里云 qwen-image 专用：输出尺寸（W*H） */
  aliyunSize?: string;
  /** 完整输入指令（复刻等场景由 API 层按选填图动态生成） */
  fullPrompt?: string;
  /** AI 编辑：涂抹区域（相对原图的归一化比例 0~1） */
  region?: { x: number; y: number; width: number; height: number };
  /** AI 编辑：涂抹掩膜 URL（与涂抹区域同一坐标系，白色代表要修改的区域） */
  maskUrl?: string;
  // 生成记录元数据（提交时由方案写入）
  planId?: string;
  providerName?: string;
  model?: string;
  price?: number;
  calls?: number;
}

function resolveUrl(imagePath: string): string {
  // 如果已经是完整URL（COS或其他公网地址），直接返回
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  // 相对路径（旧数据格式 /uploads/xxx）：按当前存储提供方拼接公网地址，确保厂商可访问
  if (imagePath.startsWith('/uploads/') || imagePath.startsWith('uploads/')) {
    const remoteUrl = getRemotePublicUrl(imagePath);
    if (remoteUrl) return remoteUrl;
  }
  // 兜底：拼接APP_URL（本地开发场景）
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

/** 解析模特图 URL（优先上传的模特图，其次自定义模特 identity 图） */
function resolveModelUrl(params: TryonTaskParams): { modelUrl: string; identityUrl?: string } {
  if (params.modelImagePath) {
    return { modelUrl: resolveUrl(params.modelImagePath) };
  }
  if (params.modelId) {
    const model = getModel(params.modelId);
    if (!model) {
      throw new Error(`Model ${params.modelId} not found`);
    }
    // 使用自定义模特时同时作为 identity，保留人物特征
    return { modelUrl: resolveUrl(model.identity_image_path), identityUrl: resolveUrl(model.identity_image_path) };
  }
  throw new Error('No model specified. Please provide modelImagePath or modelId');
}

/** 生成记录元数据（老任务可能没有，用默认值兜底） */
function buildGenMeta(params: TryonTaskParams, task: TaskRecord) {
  return {
    provider: params.providerName || '腾讯云 MPS',
    model: params.model || `WAND-tryon-1.0-${params.quality || 'flash'}`,
    price: params.price ?? 2.12,
    calls: params.calls ?? 1,
  };
}

/** 保存结果图并写生成记录 + 完成任务（已拿到图片 Buffer 时直接传入，避免重复落盘） */
async function finalizeTask(
  task: TaskRecord,
  result: string | Buffer,
  taskType: 'tryon' | 'replicate' | 'generate',
  ext: string = '.jpg'
) {
  const params = task.params as unknown as TryonTaskParams;
  const genMeta = buildGenMeta(params, task);

  const imageBuffer = Buffer.isBuffer(result) ? result : await downloadImageAsBuffer(result);
  const saved = await saveResultFile(imageBuffer, ext);

  await recordImageGenerationForTask(task.id, {
    taskType,
    provider: genMeta.provider,
    model: genMeta.model,
    price: genMeta.price,
    calls: genMeta.calls,
    images: [saved.url],
    taskId: task.id,
  });

  updateTask(task.id, {
    status: 'completed',
    progress: 100,
    result: {
      images: [saved.url],
      taskType,
    },
  });
}

/** 混元生图 模特换装（ChangeClothes，同步） */
async function processHunyuanChangeClothes(task: TaskRecord): Promise<void> {
  const params = task.params as unknown as TryonTaskParams;
  const recordTaskType = (task.type === 'replicate' ? 'replicate' : 'tryon') as 'tryon' | 'replicate';

  const { modelUrl } = resolveModelUrl(params);
  const garmentUrl = resolveUrl(params.garmentImagePath);

  const clothesType = (params.clothesType as 'Upper-body' | 'Lower-body' | 'Dress') || 'Upper-body';
  if (!['Upper-body', 'Lower-body', 'Dress'].includes(clothesType)) {
    throw new Error(`Invalid clothesType: ${clothesType}`);
  }

  updateTask(task.id, { status: 'processing', progress: 20 });

  // 同步接口，直接等结果（1 小时有效 URL）
  const resultUrl = await changeClothes({
    modelUrl,
    clothesUrl: garmentUrl,
    clothesType,
  });

  await finalizeTask(task, resultUrl, recordTaskType);
}

/** 混元生图 图生图（ImageToImage，同步）：参考图 + 服装图拼图后复刻 */
async function processHunyuanImg2Img(task: TaskRecord): Promise<void> {
  const params = task.params as unknown as TryonTaskParams;

  // 参考图（复刻姿势与背景）；replicate 路由传 referenceImagePath，旧任务兼容 pose/background
  const referencePath = params.referenceImagePath || params.backgroundImagePath || params.poseImagePath;
  if (!referencePath) {
    throw new Error('referenceImagePath is required for hunyuan-img2img');
  }
  const referenceUrl = resolveUrl(referencePath);
  const garmentUrl = resolveUrl(params.garmentImagePath);

  updateTask(task.id, { status: 'processing', progress: 15 });

  // 拼图：左 = 参考场景图，右 = 服装平铺图，让图生图模型知道要换的服装
  const referenceBuffer = await downloadImageAsBuffer(referenceUrl);
  const garmentBuffer = await downloadImageAsBuffer(garmentUrl);
  const compositeBuffer = await composeReferenceAndGarment(referenceBuffer, garmentBuffer);
  const composite = await saveUploadedFile({
    type: 'background',
    filename: 'composite.jpg',
    buffer: compositeBuffer,
    contentType: 'image/jpeg',
  });

  updateTask(task.id, { progress: 25 });

  const basePrompt =
    '保持参考图的人物动作、姿势和背景场景不变，将人物身上的服装更换为右侧平铺图中的服装，服装版型、颜色、图案保持一致';
  const prompt = params.backgroundPrompt ? `${basePrompt}。${params.backgroundPrompt}` : basePrompt;

  const resultUrl = await imageToImage({
    inputUrl: composite.url,
    prompt,
    negativePrompt: '服装变形、服装褶皱异常、人物五官改变、背景改变',
    strength: 0.65,
  });

  await finalizeTask(task, resultUrl, 'replicate');
}

/** 参考图 + 服装平铺图横向拼接（统一高度 1024），用于混元图生图复刻 */
async function composeReferenceAndGarment(referenceBuffer: Buffer, garmentBuffer: Buffer): Promise<Buffer> {
  const TARGET_HEIGHT = 1024;
  const refMeta = await sharp(referenceBuffer).metadata();
  const garMeta = await sharp(garmentBuffer).metadata();

  const refWidth = Math.max(1, Math.round(((refMeta.width || 1) / (refMeta.height || 1)) * TARGET_HEIGHT));
  const garWidth = Math.max(1, Math.round(((garMeta.width || 1) / (garMeta.height || 1)) * TARGET_HEIGHT));

  const refResized = await sharp(referenceBuffer).resize(refWidth, TARGET_HEIGHT).toBuffer();
  const garResized = await sharp(garmentBuffer).resize(garWidth, TARGET_HEIGHT).toBuffer();

  return sharp({
    create: {
      width: refWidth + garWidth,
      height: TARGET_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: refResized, left: 0, top: 0 },
      { input: garResized, left: refWidth, top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** MPS AI 换装（WAND-tryon，异步任务 + 轮询） */
async function processMpsTryonTask(task: TaskRecord): Promise<void> {
  const params = task.params as unknown as TryonTaskParams;
  const recordTaskType = (task.type === 'replicate' ? 'replicate' : 'tryon') as 'tryon' | 'replicate';

  const { modelUrl, identityUrl } = resolveModelUrl(params);
  const garmentUrl = resolveUrl(params.garmentImagePath);

  const tencentReq = {
    modelUrl,
    garmentUrl,
    identityUrl,
    poseUrl: params.poseImagePath ? resolveUrl(params.poseImagePath) : undefined,
    backgroundUrl: params.backgroundImagePath ? resolveUrl(params.backgroundImagePath) : undefined,
    accessoriesUrl: params.accessoriesImagePath ? resolveUrl(params.accessoriesImagePath) : undefined,
    shoesUrl: params.shoesImagePath ? resolveUrl(params.shoesImagePath) : undefined,
    prompt: params.backgroundPrompt,
    model: params.quality ? `WAND-tryon-1.0-${params.quality}` as const : 'WAND-tryon-1.0-flash' as const,
    resolution: params.resolution || '1K',
  };

  // 如果任务已有 provider_task_id（如超时后恢复继续轮询），跳过重新提交，直接轮询
  let providerTaskId: string | undefined;
  if (task.provider_task_id) {
    providerTaskId = task.provider_task_id;
    updateTask(task.id, { status: 'processing', progress: 20 });
  } else {
    // Submit task to Tencent
    updateTask(task.id, { status: 'processing', progress: 10 });
    providerTaskId = await createTryOnTask(tencentReq);
    updateTask(task.id, { provider_task_id: providerTaskId, progress: 20 });
  }

  // Poll for result
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const result = await queryTaskResult(providerTaskId);

    if (result.Status === 'FINISH') {
      // 如果任务实际失败（下载输入图失败等），返回的也是 FINISH 但带错误信息
      if (result.ErrMsg || result.Message) {
        throw new Error(`Tencent task failed: ${result.Message || result.ErrMsg}`);
      }

      const output = result.ImageProcessTaskResultSet?.[0]?.Output;
      // 优先使用签名URL，其次用 COS 路径构造公网URL
      const signedUrl = output?.SignedUrl;
      const cosBase = process.env.TENCENT_COS_PUBLIC_URL || '';
      const cosUrl = output?.Path && cosBase ? `${cosBase}/${output.Path.replace(/^\//, '')}` : undefined;
      const resultUrl = signedUrl || cosUrl;

      if (!resultUrl) {
        throw new Error(`Task finished but no result URL returned. Detail: ${result.Message || result.ErrMsg || 'unknown'}`);
      }

      await finalizeTask(task, resultUrl, recordTaskType);
      return;
    }

    if (result.Status === 'FAILED') {
      throw new Error(result.ErrMsg || 'Tencent task failed');
    }

    // Still processing, update progress
    const progress = Math.min(90, 20 + Math.floor((attempt / MAX_POLL_ATTEMPTS) * 70));
    updateTask(task.id, { progress });
  }

  throw new Error('Task timed out waiting for Tencent API response');
}

/** 阿里云 qwen-image 换衣/复刻（多模态图生图，同步）：参考图 + 服装图 + 文本指令 */
async function processAliyunQwenImage(task: TaskRecord): Promise<void> {
  const params = task.params as unknown as TryonTaskParams;

  // AI 编辑：单图 + 可选框选区域（裁切局部 → qwen 编辑 → 羽化贴回）
  if (task.type === 'edit') {
    await processQwenEdit(task, params);
    return;
  }

  const recordTaskType = (task.type === 'replicate' ? 'replicate' : 'tryon') as 'tryon' | 'replicate';

  let images: string[];
  let prompt: string;
  if (task.type === 'replicate') {
    // 爆款复刻：图1 = 参考图，其后按 模特 → 姿势 → 服装 追加实际选填的图
    const referencePath =
      params.referenceImagePath || params.backgroundImagePath || params.poseImagePath;
    if (!referencePath) {
      throw new Error('referenceImagePath is required for aliyun-qwen-image replicate');
    }
    images = [resolveUrl(referencePath)];
    if (params.modelImagePath) images.push(resolveUrl(params.modelImagePath));
    if (params.poseImagePath) images.push(resolveUrl(params.poseImagePath));
    if (params.garmentImagePath) images.push(resolveUrl(params.garmentImagePath));

    // 指令由 API 层按实际选填项动态生成，worker 直接使用
    prompt =
      params.fullPrompt ||
      '以图1为爆款参考，保持图1人物的五官、动作姿势、服装和背景场景，高清写实，全身照';
  } else {
    const { modelUrl } = resolveModelUrl(params);
    images = [modelUrl, resolveUrl(params.garmentImagePath)];
    prompt =
      '图1中的模特穿上图2中的服装，保持人物五官、脸型、发型、身材和姿势不变，服装版型、颜色、图案与原图完全一致，高清写实，全身照';
  }

  updateTask(task.id, { status: 'processing', progress: 20 });

  // replicate 的 fullPrompt 已包含额外场景描述，避免重复拼接
  const fullPrompt =
    task.type === 'replicate' || !params.backgroundPrompt
      ? prompt
      : `${prompt}。${params.backgroundPrompt}`;
  const imageRef = await generateQwenImage({
    images,
    prompt: fullPrompt,
    size: params.aliyunSize,
    model: params.model,
  });

  // 兼容 URL 与 base64 返回，统一交给 finalizeTask 落盘一次
  const resultBuffer = await imageRefToBuffer(imageRef);
  await finalizeTask(task, resultBuffer, recordTaskType);
}

/** 按局部图片的长宽比挑选最接近的 qwen-image 官方输出尺寸，避免生成图比例失真 */
function pickQwenEditSize(width: number, height: number): string {
  const targetAspect = width / height;
  let best = ALIYUN_QWEN_RESOLUTIONS[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const option of ALIYUN_QWEN_RESOLUTIONS) {
    const aspectScore = Math.abs(Math.log(option.width / option.height / targetAspect));
    const sizeScore = Math.abs(Math.log(Math.max(option.width, option.height) / Math.max(width, height)));
    const score = aspectScore * 4 + sizeScore * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }
  return `${best.width}*${best.height}`;
}

/** 阿里云 qwen-image 编辑：框选时裁出局部精修后羽化贴回，不框选则整图编辑 */
async function processQwenEdit(task: TaskRecord, params: TryonTaskParams): Promise<void> {
  const sourceUrl = resolveUrl(params.garmentImagePath);
  const prompt = params.backgroundPrompt || '按描述编辑图片';

  const originalBuffer = await downloadImageAsBuffer(sourceUrl);
  const meta = await sharp(originalBuffer).metadata();
  const imageWidth = meta.width || 1024;
  const imageHeight = meta.height || 1024;

  updateTask(task.id, { status: 'processing', progress: 20 });

  if (params.region) {
    const box = regionToPixelBox(params.region, imageWidth, imageHeight);
    const cropBuffer = await sharp(originalBuffer).extract(box).jpeg({ quality: 92 }).toBuffer();
    const savedCrop = await saveUploadedFile({
      type: 'pose',
      filename: 'edit-region.jpg',
      buffer: cropBuffer,
      contentType: 'image/jpeg',
    });

    const imageRef = await generateQwenImage({
      images: [savedCrop.url],
      prompt,
      size: pickQwenEditSize(box.width, box.height),
      model: params.model,
    });
    const editedBuffer = await imageRefToBuffer(imageRef);
    const finalBuffer = await pasteEditedRegion(originalBuffer, editedBuffer, box, params.maskUrl);
    await finalizeTask(task, finalBuffer, 'tryon');
    return;
  }

  const imageRef = await generateQwenImage({
    images: [sourceUrl],
    prompt,
    size: pickQwenEditSize(imageWidth, imageHeight),
    model: params.model,
  });
  const editedBuffer = await imageRefToBuffer(imageRef);
  const finalBuffer = await sharp(editedBuffer)
    .resize(imageWidth, imageHeight, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toBuffer();
  await finalizeTask(task, finalBuffer, 'tryon');
}

/** 兼容 qwen-image 返回的公网 URL 或 base64（data:image/...） */
async function imageRefToBuffer(imageRef: string): Promise<Buffer> {
  if (imageRef.startsWith('data:')) {
    return Buffer.from(imageRef.split(',')[1] || '', 'base64');
  }
  return downloadImageAsBuffer(imageRef);
}

/** 火山引擎即梦 Seedream 4.6（异步任务 + 轮询）：复刻按参考图+选填图，换装按模特+服装 */
async function processVolcengineJimeng(task: TaskRecord): Promise<void> {
  const params = task.params as unknown as TryonTaskParams;
  const recordTaskType = task.type === 'replicate' ? 'replicate' : 'tryon';

  let imageUrls: string[];
  let prompt: string;
  if (task.type === 'replicate') {
    // 爆款复刻：图1 = 参考图，其后按 模特 → 姿势 → 服装 追加实际选填的图
    const referencePath =
      params.referenceImagePath || params.backgroundImagePath || params.poseImagePath;
    if (!referencePath) {
      throw new Error('referenceImagePath is required for volcengine-jimeng replicate');
    }
    imageUrls = [resolveUrl(referencePath)];
    if (params.modelImagePath) imageUrls.push(resolveUrl(params.modelImagePath));
    if (params.poseImagePath) imageUrls.push(resolveUrl(params.poseImagePath));
    if (params.garmentImagePath) imageUrls.push(resolveUrl(params.garmentImagePath));
    prompt =
      params.fullPrompt ||
      '以图1为爆款参考，保持图1人物的五官、动作姿势、服装和背景场景，高清写实，全身照';
  } else {
    const { modelUrl } = resolveModelUrl(params);
    imageUrls = [resolveUrl(params.garmentImagePath), modelUrl];
    prompt = params.backgroundPrompt || '模特穿着该服装，高清写实，全身照';
  }

  // 增量恢复：已有 provider_task_id 则跳过重新提交
  let providerTaskId = task.provider_task_id;
  if (providerTaskId) {
    updateTask(task.id, { status: 'processing', progress: 15 });
  } else {
    updateTask(task.id, { status: 'processing', progress: 10 });
    providerTaskId = await createJimengTask({
      imageUrls,
      prompt,
      size: params.jimengSize || 4194304,
    });
    updateTask(task.id, { provider_task_id: providerTaskId, progress: 20 });
  }

  // 轮询任务结果（即梦一般 10-30 秒完成）
  const MAX_JIMENG_POLL_ATTEMPTS = 40;
  for (let attempt = 0; attempt < MAX_JIMENG_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const result = await queryJimengTask(providerTaskId);

    if (result.status === 'done') {
      if (result.imageUrls?.length) {
        await finalizeTask(task, result.imageUrls[0], recordTaskType);
        return;
      }
      // 备用：base64 格式结果图
      if (result.binaryDataBase64?.length) {
        const buf = Buffer.from(result.binaryDataBase64[0], 'base64');
        await finalizeTask(task, buf, recordTaskType, '.png');
        return;
      }
      throw new Error('即梦任务成功但未返回结果图');
    }
    if (result.status === 'not_found' || result.status === 'expired') {
      throw new Error(`即梦任务失败: ${result.status}`);
    }

    // 仍在处理（in_queue / generating），更新进度
    updateTask(task.id, { progress: Math.min(95, 15 + Math.floor((attempt / MAX_JIMENG_POLL_ATTEMPTS) * 80)) });
  }

  throw new Error('即梦任务超时');
}

/** 归一化选区 → 原图像素框（最小 8px） */
function regionToPixelBox(
  region: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
) {
  const left = Math.max(0, Math.min(imageWidth - 1, Math.round(region.x * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(region.y * imageHeight)));
  const width = Math.max(8, Math.min(imageWidth - left, Math.round(region.width * imageWidth)));
  const height = Math.max(8, Math.min(imageHeight - top, Math.round(region.height * imageHeight)));
  return { left, top, width, height };
}

/** 边缘羽化后把局部编辑结果贴回原图选区，避免生硬接缝；有涂抹掩膜时按掩膜形状贴回 */
async function pasteEditedRegion(
  original: Buffer,
  edited: Buffer,
  box: { left: number; top: number; width: number; height: number },
  maskUrl?: string
): Promise<Buffer> {
  const resized = await sharp(edited)
    .resize(box.width, box.height, { fit: 'fill' })
    .removeAlpha()
    .toBuffer();

  let alphaPng: Buffer;
  if (maskUrl) {
    // 涂抹掩膜：与整图对齐后裁出同一选区，羽化边缘作为 alpha
    const originalMeta = await sharp(original).metadata();
    const imageWidth = originalMeta.width || box.left + box.width;
    const imageHeight = originalMeta.height || box.top + box.height;
    const maskBuffer = await downloadImageAsBuffer(resolveUrl(maskUrl));
    const maskMeta = await sharp(maskBuffer).metadata();
    let pipeline = sharp(maskBuffer).removeAlpha();
    if (maskMeta.width !== imageWidth || maskMeta.height !== imageHeight) {
      pipeline = pipeline.resize(imageWidth, imageHeight, { fit: 'fill' });
    }
    const feather = Math.min(6, Math.max(1.5, Math.min(box.width, box.height) * 0.01));
    // 强制输出单通道灰度作为 alpha，避免多通道掩膜被误当作颜色数据
    const alphaRaw = await pipeline
      .extract(box)
      .blur(feather)
      .greyscale()
      .raw()
      .toBuffer();
    alphaPng = await sharp(alphaRaw, {
      raw: { width: box.width, height: box.height, channels: 1 },
    })
      .png()
      .toBuffer();
  } else {
    // 无掩膜（旧任务）：选区内部不透明，边缘渐变透明
    const feather = Math.max(2, Math.round(Math.min(box.width, box.height) * 0.03));
    const maskRaw = Buffer.alloc(box.width * box.height);
    for (let y = 0; y < box.height; y++) {
      for (let x = 0; x < box.width; x++) {
        const edge = Math.min(x, y, box.width - 1 - x, box.height - 1 - y);
        maskRaw[y * box.width + x] = Math.max(0, Math.min(255, Math.round((edge / feather) * 255)));
      }
    }
    alphaPng = await sharp(maskRaw, {
      raw: { width: box.width, height: box.height, channels: 1 },
    })
      .png()
      .toBuffer();
  }

  const withAlpha = await sharp(resized).joinChannel(alphaPng).png().toBuffer();

  return sharp(original)
    .composite([{ input: withAlpha, left: box.left, top: box.top, blend: 'over' }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** 火山引擎 SeedEdit 3.0 指令编辑（异步任务 + 轮询）；框选时裁切编辑后羽化贴回 */
async function processSeedEdit(task: TaskRecord): Promise<void> {
  const params = task.params as unknown as TryonTaskParams;
  const sourceUrl = resolveUrl(params.garmentImagePath);
  const prompt = params.backgroundPrompt || '换成粉色';

  // 框选编辑：先裁出选区交给 SeedEdit，结果再按原坐标贴回
  let originalBuffer: Buffer | null = null;
  let box: { left: number; top: number; width: number; height: number } | null = null;
  let inputUrl = sourceUrl;
  if (params.region) {
    originalBuffer = await downloadImageAsBuffer(sourceUrl);
    const meta = await sharp(originalBuffer).metadata();
    box = regionToPixelBox(params.region, meta.width || 1024, meta.height || 1024);
    const cropBuffer = await sharp(originalBuffer).extract(box).jpeg({ quality: 92 }).toBuffer();
    const savedCrop = await saveUploadedFile({
      type: 'pose',
      filename: 'edit-region.jpg',
      buffer: cropBuffer,
      contentType: 'image/jpeg',
    });
    inputUrl = savedCrop.url;
  }

  // 增量恢复：已有 provider_task_id 则跳过重新提交
  let providerTaskId = task.provider_task_id;
  if (providerTaskId) {
    updateTask(task.id, { status: 'processing', progress: 15 });
  } else {
    updateTask(task.id, { status: 'processing', progress: 10 });
    providerTaskId = await createSeedEditTask({
      imageUrl: inputUrl,
      prompt,
      scale: 0.5,
      seed: -1,
    });
    updateTask(task.id, { provider_task_id: providerTaskId, progress: 20 });
  }

  // 轮询任务结果
  const MAX_POLL = 40;
  for (let attempt = 0; attempt < MAX_POLL; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const result = await querySeedEditTask(providerTaskId);

    if (result.status === 'done') {
      let resultBuffer: Buffer;
      if (result.imageUrls?.length) {
        resultBuffer = await downloadImageAsBuffer(result.imageUrls[0]);
      } else if (result.binaryDataBase64?.length) {
        resultBuffer = Buffer.from(result.binaryDataBase64[0], 'base64');
      } else {
        throw new Error('SeedEdit任务成功但未返回结果图');
      }

      const finalBuffer =
        originalBuffer && box
          ? await pasteEditedRegion(originalBuffer, resultBuffer, box, params.maskUrl)
          : resultBuffer;
      await finalizeTask(task, finalBuffer, 'tryon');
      return;
    }
    if (result.status === 'not_found' || result.status === 'expired') {
      throw new Error(`SeedEdit任务失败: ${result.status}`);
    }

    updateTask(task.id, { progress: Math.min(95, 15 + Math.floor((attempt / MAX_POLL) * 80)) });
  }

  throw new Error('SeedEdit任务超时');
}

/** 自由生图（多图参考 + 提示词，支持即梦/Qwen Image） */
async function processGenerate(task: TaskRecord): Promise<void> {
  const params = task.params as unknown as {
    imagePaths?: string[];
    prompt?: string;
    method?: string;
    model?: string;
    jimengSize?: number;
    aliyunSize?: string;
  };

  const method = params.method || 'volcengine-jimeng';
  const prompt = params.prompt || '';
  const imageUrls = (params.imagePaths || []).map((p) => resolveUrl(p));

  if (method === 'volcengine-jimeng') {
    // 即梦：多图参考 + 提示词
    let providerTaskId = task.provider_task_id;
    if (providerTaskId) {
      updateTask(task.id, { status: 'processing', progress: 15 });
    } else {
      updateTask(task.id, { status: 'processing', progress: 10 });
      const { createJimengTask } = await import('@/lib/ai/volcengine');
      providerTaskId = await createJimengTask({
        imageUrls,
        prompt,
        size: params.jimengSize,
      });
      updateTask(task.id, { provider_task_id: providerTaskId, progress: 20 });
    }

    // 轮询即梦结果
    const MAX_JIMENG_POLL = 40;
    for (let attempt = 0; attempt < MAX_JIMENG_POLL; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const { queryJimengTask } = await import('@/lib/ai/volcengine');
      const result = await queryJimengTask(providerTaskId);

      if (result.status === 'done') {
        if (result.imageUrls?.length) {
          await finalizeTask(task, result.imageUrls[0], 'generate');
          return;
        }
        if (result.binaryDataBase64?.length) {
          const buf = Buffer.from(result.binaryDataBase64[0], 'base64');
          await finalizeTask(task, buf, 'generate', '.jpg');
          return;
        }
        throw new Error('即梦任务成功但未返回结果图');
      }
      if (result.status === 'not_found' || result.status === 'expired') {
        throw new Error(`即梦任务失败: ${result.status}`);
      }
      updateTask(task.id, { progress: Math.min(95, 15 + Math.floor((attempt / MAX_JIMENG_POLL) * 80)) });
    }
    throw new Error('即梦任务超时');
  }

  if (method === 'aliyun-qwen-image') {
    // Qwen Image：多图参考 + 提示词（同步调用）
    updateTask(task.id, { status: 'processing', progress: 30 });
    const { generateQwenImage } = await import('@/lib/ai/aliyun');
    const resultUrl = await generateQwenImage({
      images: imageUrls,
      prompt,
      size: params.aliyunSize || '1024*1536',
      model: params.model || 'qwen-image-2.1-turbo',
    });

    const resultBuffer = await downloadImageAsBuffer(resultUrl);
    await finalizeTask(task, resultBuffer, 'generate', '.jpg');
    return;
  }

  if (method === 'hunyuan-img2img') {
    // 混元图生图：单张参考图 + 提示词（同步调用）
    if (!imageUrls.length) {
      throw new Error('混元图生图需要至少一张参考图');
    }
    updateTask(task.id, { status: 'processing', progress: 30 });
    const { imageToImage } = await import('@/lib/ai/hunyuan');
    const resultUrl = await imageToImage({
      inputUrl: imageUrls[0],
      prompt,
      negativePrompt: '低质量、模糊、畸形、多余肢体、水印',
      strength: 0.6,
    });

    const resultBuffer = await downloadImageAsBuffer(resultUrl);
    await finalizeTask(task, resultBuffer, 'generate', '.jpg');
    return;
  }

  throw new Error(`不支持的生图方法: ${method}`);
}

export async function processTryonTask(task: TaskRecord): Promise<void> {
  // 自由生图任务走独立流程
  if (task.type === 'generate') {
    await processGenerate(task);
    return;
  }

  const params = (task.params || {}) as unknown as TryonTaskParams;
  const method = params.method || 'mps-tryon';

  if (method === 'volcengine-jimeng') {
    // 增量恢复：已有 provider_task_id 且不是即梦格式，走 MPS 恢复
    if (task.provider_task_id && !isJimengTaskId(task.provider_task_id)) {
      await processMpsTryonTask(task);
      return;
    }
    await processVolcengineJimeng(task);
    return;
  }
  if (method === 'volcengine-seedit') {
    await processSeedEdit(task);
    return;
  }
  if (method === 'hunyuan-change-clothes') {
    await processHunyuanChangeClothes(task);
    return;
  }
  if (method === 'hunyuan-img2img') {
    await processHunyuanImg2Img(task);
    return;
  }
  if (method === 'aliyun-qwen-image') {
    await processAliyunQwenImage(task);
    return;
  }
  await processMpsTryonTask(task);
}
