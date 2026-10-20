import { getModel } from '@/lib/db/model-store';
import { getOutfit, updateOutfit } from '@/lib/db/outfit-store';
import { createTryOnTask, queryTaskResult } from '@/lib/ai/tencent';
import { generateQwenImage } from '@/lib/ai/aliyun';
import { getTask, updateTask } from '../task-store';
import { createGarmentCollage } from '@/lib/canvas/garment-collage';
import { recordGenerationForTask } from '@/lib/db/generation-store';
import { downloadImageAsBuffer, saveResultFile, saveUploadedFile } from '@/lib/storage/cos';
import type { TaskRecord } from '@/types';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60;

type ViewKey = 'front' | 'side' | 'back';

const VIEW_PROMPTS: Record<ViewKey, string> = {
  front: '正面视角，模特面向镜头，展示服装正面细节，全身照',
  side: '侧面视角，模特侧身站立，展示服装侧面轮廓，全身照',
  back: '背面视角，模特背对镜头，展示服装背面设计，全身照',
};

const VIEW_ORDER: ViewKey[] = ['front', 'side', 'back'];

function resolveUrl(imagePath: string): string {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  // 相对路径（旧数据格式 /uploads/xxx）：拼接COS公网地址，确保腾讯云可访问
  const cosUrl = process.env.TENCENT_COS_PUBLIC_URL;
  if (cosUrl && (imagePath.startsWith('/uploads/') || imagePath.startsWith('uploads/'))) {
    return `${cosUrl}/${imagePath.replace(/^\//, '')}`;
  }
  // 兜底：拼接APP_URL（本地开发场景）
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

/**
 * 生成单个视角的试衣图。
 * - 该视角已有 provider_task_id（此前提交过、本地超时后恢复）→ 直接轮询，不重复提交/计费
 * - 首次提交 → 提交后立即把 provider_task_id 持久化到 task.params.viewTasks，
 *   这样即使该视角后面超时，也能凭它做增量恢复
 */
async function runSingleView(
  taskId: string,
  garmentUrl: string,
  modelUrl: string,
  identityUrl: string | undefined,
  view: ViewKey,
  basePrompt: string | undefined,
  quality: 'lite' | 'flash' | 'pro' = 'flash',
  resolution: '1K' | '2K' | '4K' = '1K',
  existingTaskId?: string
): Promise<string> {
  const prompt = [basePrompt, VIEW_PROMPTS[view]].filter(Boolean).join('，');

  const tencentReq = {
    modelUrl,
    garmentUrl,
    identityUrl,
    prompt,
    model: `WAND-tryon-1.0-${quality}` as const,
    resolution,
  };

  let providerTaskId: string | undefined = existingTaskId;
  if (!providerTaskId) {
    providerTaskId = await createTryOnTask(tencentReq);
    // 持久化该视角的 provider_task_id，供超时后增量恢复
    const current = getTask(taskId);
    const currentParams = (current?.params || {}) as Record<string, unknown>;
    const viewTasks = { ...((currentParams.viewTasks || {}) as Record<string, string>) };
    viewTasks[view] = providerTaskId;
    updateTask(taskId, { params: { ...currentParams, viewTasks } });
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const result = await queryTaskResult(providerTaskId);

    if (result.Status === 'FINISH') {
      // 如果任务实际失败（下载输入图失败等），返回的也是 FINISH 但带错误信息
      if (result.ErrMsg || result.Message) {
        throw new Error(`View ${view} failed: ${result.Message || result.ErrMsg}`);
      }

      const output = result.ImageProcessTaskResultSet?.[0]?.Output;
      // 优先使用签名URL，其次用 COS 路径构造公网URL
      const signedUrl = output?.SignedUrl;
      const cosBase = process.env.TENCENT_COS_PUBLIC_URL || '';
      const cosUrl = output?.Path && cosBase ? `${cosBase}/${output.Path.replace(/^\//, '')}` : undefined;
      const resultUrl = signedUrl || cosUrl;

      if (!resultUrl) {
        throw new Error(`View ${view} finished but no result URL. Detail: ${result.Message || result.ErrMsg || 'unknown'}`);
      }
      const imageBuffer = await downloadImageAsBuffer(resultUrl);
      const saved = await saveResultFile(imageBuffer, '.jpg');
      return saved.url;
    }

    if (result.Status === 'FAILED') {
      throw new Error(result.ErrMsg || `View ${view} generation failed`);
    }
  }

  throw new Error(`View ${view} timed out`);
}

/**
 * qwen-image 生成单个视角的试衣图（多模态图生图，同步）。
 * 通过文本指令控制正/侧/背视角，实现真正三视角。
 * 返回 COS 永久 URL（兼容 base64 返回）。同步接口无 provider_task_id，超时重跑会重复计费（0.2 元/张，可接受）。
 */
async function runQwenImageView(
  garmentUrl: string,
  modelUrl: string,
  view: ViewKey,
  model: string = 'qwen-image-2.0'
): Promise<string> {
  const prompt = `图1中的模特穿上图2中的服装，${VIEW_PROMPTS[view]}，保持人物五官、脸型、发型、身材不变，服装版型、颜色、图案与原图完全一致，高清写实`;
  const imageRef = await generateQwenImage({ images: [modelUrl, garmentUrl], prompt, model });

  // 兼容 URL 与 base64 返回，统一转存为 COS 永久 URL
  let permanentUrl: string;
  if (imageRef.startsWith('data:')) {
    const mime = imageRef.slice(5, imageRef.indexOf(';')) || 'image/png';
    const buffer = Buffer.from(imageRef.split(',')[1] || '', 'base64');
    const ext = mime.includes('png') ? '.png' : '.jpg';
    permanentUrl = (await saveResultFile(buffer, ext)).url;
  } else {
    const buffer = await downloadImageAsBuffer(imageRef);
    permanentUrl = (await saveResultFile(buffer, '.jpg')).url;
  }
  return permanentUrl;
}

export async function processOutfitBatchTask(task: TaskRecord): Promise<void> {
  const params = task.params as {
    outfitId: string;
    garmentImagePath: string;
    modelId?: string;
    modelImagePath?: string;
    scenePrompt?: string;
    quality?: 'lite' | 'flash' | 'pro';
    resolution?: '1K' | '2K' | '4K';
    viewTasks?: Partial<Record<ViewKey, string>>;
    garmentCollageUrl?: string;
    // 底层调用能力：mps-tryon（默认）/ aliyun-qwen-image
    method?: string;
    // 生成记录元数据（generate 时由方案写入）
    planId?: string;
    provider?: string;
    model?: string;
    price?: number;
    calls?: number;
  };

  // 生成记录元数据（老任务可能没有，用默认值兜底）
  const genMeta = {
    provider: params.provider || '腾讯云 MPS',
    model: params.model || `WAND-tryon-1.0-${params.quality || 'flash'}`,
    price: params.price ?? 2.12,
    calls: params.calls ?? 3,
  };

  const outfit = getOutfit(params.outfitId);
  if (!outfit) {
    throw new Error(`Outfit ${params.outfitId} not found`);
  }

  // Update outfit status to generating
  updateOutfit(params.outfitId, { status: 'generating' });
  updateTask(task.id, { status: 'processing', progress: 5 });

  // Resolve model
  let modelUrl: string;
  let identityUrl: string | undefined;

  if (params.modelId) {
    const model = getModel(params.modelId);
    if (!model) throw new Error(`Model ${params.modelId} not found`);
    modelUrl = resolveUrl(model.identity_image_path);
    identityUrl = resolveUrl(model.identity_image_path);
  } else if (params.modelImagePath) {
    modelUrl = resolveUrl(params.modelImagePath);
  } else {
    throw new Error('No model specified');
  }

  // 各视角已提交到腾讯云的 provider_task_id（超时恢复用）
  let viewTasks: Partial<Record<ViewKey, string>> = params.viewTasks || {};

  // 已完成视角的图片路径（增量恢复时直接复用，不重复生成）
  const completedPaths: Partial<Record<ViewKey, string>> = {
    front: outfit.front_image_path || undefined,
    side: outfit.side_image_path || undefined,
    back: outfit.back_image_path || undefined,
  };

  const results: Partial<Record<ViewKey, string>> = {};
  let completedCount = 0;
  let garmentUrl: string;

  try {
    // 生成"整套服装平铺图"作为试衣素材，让模特一次穿上所有选中的单品
    if (params.garmentCollageUrl) {
      // 增量恢复：复用已生成的拼图，避免重复拼图/上传
      garmentUrl = params.garmentCollageUrl;
    } else if (outfit.garments.length === 1) {
      // 单件：直接用原图
      garmentUrl = resolveUrl(outfit.garments[0].image_path);
    } else {
      // 多件：本地把所有单品拼成一张平铺图并上传COS，作为整套试衣素材。
      // 若已有旧逻辑生成的"单品视角"图（未用拼图），一并清除，统一用整套重新生成，避免三视角不一致
      const hasLegacyViews = VIEW_ORDER.some((v) => completedPaths[v]);
      if (hasLegacyViews) {
        updateOutfit(params.outfitId, {
          frontImagePath: null,
          sideImagePath: null,
          backImagePath: null,
        } as unknown as Parameters<typeof updateOutfit>[1]);
        for (const v of VIEW_ORDER) {
          completedPaths[v] = undefined;
        }
        // 旧单品逻辑遗留的视角任务记录一并清掉，避免后续复用失效的 provider_task_id
        viewTasks = {};
        updateTask(task.id, { params: { ...params, viewTasks: {} } });
        console.log(`[OutfitBatch] ${params.outfitId}: clear legacy single-garment views, regenerate with full outfit`);
      }

      const collageBuffer = await createGarmentCollage(
        outfit.garments.map((g) => ({ imagePath: g.image_path, category: g.category }))
      );
      const saved = await saveUploadedFile({
        type: 'garment',
        filename: 'collage.jpg',
        buffer: collageBuffer,
        contentType: 'image/jpeg',
      });
      garmentUrl = saved.url;
      // 持久化拼图URL，恢复时避免重复拼图/上传
      const current = getTask(task.id);
      const currentParams = (current?.params || {}) as Record<string, unknown>;
      updateTask(task.id, { params: { ...currentParams, garmentCollageUrl: saved.url } });
    }

    for (let i = 0; i < VIEW_ORDER.length; i++) {
      const view = VIEW_ORDER[i];
      const existingPath = completedPaths[view];

      if (existingPath) {
        // 该视角已生成过，直接复用
        results[view] = existingPath;
        completedCount++;
        updateTask(task.id, { progress: Math.round((completedCount / VIEW_ORDER.length) * 95) });
        continue;
      }

      const path = await (params.method === 'aliyun-qwen-image'
        ? runQwenImageView(garmentUrl, modelUrl, view, params.model || 'qwen-image-2.0')
        : runSingleView(
            task.id,
            garmentUrl,
            modelUrl,
            identityUrl,
            view,
            params.scenePrompt,
            params.quality,
            params.resolution,
            viewTasks[view]
          ));
      results[view] = path;
      completedCount++;

      if (view === 'front') {
        updateOutfit(params.outfitId, { frontImagePath: path });
      } else if (view === 'side') {
        updateOutfit(params.outfitId, { sideImagePath: path });
      } else {
        updateOutfit(params.outfitId, { backImagePath: path });
      }
      updateTask(task.id, { progress: Math.round((completedCount / VIEW_ORDER.length) * 95) });
    }

    // Mark outfit as completed (item list image will be generated client-side)
    updateOutfit(params.outfitId, { status: 'completed' });

    // 写入生成记录（永久保留，含厂商/模型/费用）
    await recordGenerationForTask(task.id, {
      outfitId: params.outfitId,
      type: 'tryon',
      provider: genMeta.provider,
      model: genMeta.model,
      price: genMeta.price,
      calls: genMeta.calls,
      images: [results.front!, results.side!, results.back!],
      taskId: task.id,
    });

    updateTask(task.id, {
      status: 'completed',
      progress: 100,
      result: {
        outfitId: params.outfitId,
        images: {
          front: results.front!,
          side: results.side!,
          back: results.back!,
        },
        taskType: 'outfit_batch',
      },
    });
  } catch (error) {
    // 失败也保留生成记录（含厂商/模型/费用），便于追溯
    await recordGenerationForTask(task.id, {
      outfitId: params.outfitId,
      type: 'tryon',
      provider: genMeta.provider,
      model: genMeta.model,
      price: genMeta.price,
      calls: genMeta.calls,
      images: [],
      status: 'failed',
      taskId: task.id,
    }).catch(() => undefined);
    updateOutfit(params.outfitId, { status: 'failed' });
    throw error;
  }
}
