import { getOutfit, updateOutfit } from '@/lib/db/outfit-store';
import { createPosterSuiteTask, queryTaskResult } from '@/lib/ai/tencent';
import { getTask, updateTask } from '../task-store';
import { recordGenerationForTask } from '@/lib/db/generation-store';
import { recordImageGenerationForTask } from '@/lib/db/image-generation-store';
import { downloadImageAsBuffer, saveResultFile } from '@/lib/storage/cos';
import type { TaskRecord } from '@/types';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 100;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 从结果 URL 推导图片扩展名（商品套图输出可能为 png/webp，不能一律按 jpg 保存） */
function extFromUrl(url: string): string {
  const match = url.match(/\.(png|jpe?g|webp)(\?|$)/i);
  if (!match) return '.jpg';
  return match[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${match[1].toLowerCase()}`;
}

/**
 * AI 商品套图任务：一次调用生成多张海报图（hero/detail/selling/atmosphere），
 * 结果以数组形式保存。
 * - 独立「商品套图」页：params.garmentImagePath 单件商品图，无 outfitId，写 image_generations 记录
 * - 兼容旧「穿搭方案」调用：有 outfitId 时写回 outfit.suite_image_paths + outfit_generations 记录
 * - 增量恢复：params.inputUrl / params.suiteTaskId 已持久化，超时后不重复拼图/提交
 */
export async function processOutfitSuiteTask(task: TaskRecord): Promise<void> {
  const params = task.params as {
    outfitId?: string;
    garmentImagePath?: string;
    garmentImagePaths?: string[];
    scenePrompt?: string;
    panelRatio?: string;
    panelResolution?: string;
    inputUrl?: string;
    suiteTaskId?: string;
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
    model: params.model || 'WAND-suite-1.0-flash',
    price: params.price ?? 0.79,
    calls: params.calls ?? 1,
  };

  const outfit = params.outfitId ? getOutfit(params.outfitId) : null;
  if (params.outfitId && !outfit) {
    throw new Error(`Outfit ${params.outfitId} not found`);
  }
  if (outfit) {
    updateOutfit(params.outfitId!, { status: 'generating' });
  }
  updateTask(task.id, { status: 'processing', progress: 5 });

  try {
    // 1. 商品主图：单件商品直接用原图（独立页入口）；穿搭方案旧逻辑多件才拼图
    let inputUrl = params.inputUrl;
    if (!inputUrl) {
      if (params.garmentImagePath) {
        inputUrl = resolveUrl(params.garmentImagePath);
      } else if (outfit) {
        if (outfit.garments.length === 1) {
          inputUrl = resolveUrl(outfit.garments[0].image_path);
        } else {
          // 旧逻辑：整套拼图（已不再推荐，识别不稳）
          const { createGarmentCollage } = await import('@/lib/canvas/garment-collage');
          const { saveUploadedFile } = await import('@/lib/storage/cos');
          const collageBuffer = await createGarmentCollage(
            outfit.garments.map((g) => ({ imagePath: g.image_path, category: g.category }))
          );
          const saved = await saveUploadedFile({
            type: 'garment',
            filename: 'suite-input.jpg',
            buffer: collageBuffer,
            contentType: 'image/jpeg',
          });
          inputUrl = saved.url;
        }
      } else {
        throw new Error('No garment image specified');
      }
      const current = getTask(task.id);
      const currentParams = (current?.params || {}) as Record<string, unknown>;
      updateTask(task.id, { params: { ...currentParams, inputUrl } });
    }

    // 2. 提交商品套图任务（已有 suiteTaskId 则不重复提交，避免重复计费）
    let suiteTaskId = params.suiteTaskId;
    if (!suiteTaskId) {
      // 独立页为单件商品，不传其他商品的视角图（不同商品图会误导主商品识别，导致主图偏重某一单品）
      suiteTaskId = await createPosterSuiteTask({
        inputUrl,
        panelRatio: params.panelRatio,
        panelResolution: params.panelResolution,
      });
      const current = getTask(task.id);
      const currentParams = (current?.params || {}) as Record<string, unknown>;
      updateTask(task.id, {
        params: { ...currentParams, suiteTaskId },
        provider_task_id: suiteTaskId,
      });
    }

    // 3. 轮询腾讯云结果
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const result = await queryTaskResult(suiteTaskId);

      if (result.Status === 'FINISH') {
        // 任务实际失败（如输入图下载失败）时返回的也是 FINISH 但带错误信息
        if (result.ErrMsg || result.Message) {
          throw new Error(`Suite failed: ${result.Message || result.ErrMsg}`);
        }

        // 收集所有输出图 URL（hero/detail/selling/atmosphere 各一张）
        const urls = (result.ImageProcessTaskResultSet || [])
          .map((item) => {
            const output = item.Output;
            const signedUrl = output?.SignedUrl;
            const cosBase = process.env.TENCENT_COS_PUBLIC_URL || '';
            const cosUrl = output?.Path && cosBase ? `${cosBase}/${output.Path.replace(/^\//, '')}` : undefined;
            return signedUrl || cosUrl;
          })
          .filter((u): u is string => !!u);

        if (urls.length === 0) {
          throw new Error(`Suite finished but no result URLs. Detail: ${result.Message || result.ErrMsg || 'unknown'}`);
        }

        // 下载并保存每张结果到 COS
        const savedUrls: string[] = [];
        for (const url of urls) {
          const imageBuffer = await downloadImageAsBuffer(url);
          const saved = await saveResultFile(imageBuffer, extFromUrl(url));
          savedUrls.push(saved.url);
        }

        if (outfit) {
          updateOutfit(params.outfitId!, { suiteImagePaths: savedUrls, status: 'completed' });
          // 穿搭方案旧入口：写入 outfit 生成记录
          await recordGenerationForTask(task.id, {
            outfitId: params.outfitId!,
            type: 'suite',
            provider: genMeta.provider,
            model: genMeta.model,
            price: genMeta.price,
            calls: genMeta.calls,
            images: savedUrls,
            taskId: task.id,
          });
        } else {
          // 独立商品套图页：写入单图生成记录
          await recordImageGenerationForTask(task.id, {
            taskType: 'suite',
            provider: genMeta.provider,
            model: genMeta.model,
            price: genMeta.price,
            calls: genMeta.calls,
            images: savedUrls,
            taskId: task.id,
          });
        }

        updateTask(task.id, {
          status: 'completed',
          progress: 100,
          result: {
            outfitId: params.outfitId || null,
            images: savedUrls,
            taskType: 'outfit_suite',
          },
        });
        return;
      }

      if (result.Status === 'FAILED') {
        throw new Error(result.ErrMsg || 'Suite generation failed');
      }

      // 仍在处理中，更新进度（保留前 5% 起步，避免归零）
      updateTask(task.id, { progress: Math.min(5 + Math.round((attempt / MAX_POLL_ATTEMPTS) * 90), 95) });
    }

    throw new Error('Suite task timed out');
  } catch (error) {
    // 失败也保留生成记录（含厂商/模型/费用），便于追溯
    if (outfit) {
      await recordGenerationForTask(task.id, {
        outfitId: params.outfitId!,
        type: 'suite',
        provider: genMeta.provider,
        model: genMeta.model,
        price: genMeta.price,
        calls: genMeta.calls,
        images: [],
        status: 'failed',
        taskId: task.id,
      }).catch(() => undefined);
      updateOutfit(params.outfitId!, { status: 'failed' });
    } else {
      await recordImageGenerationForTask(task.id, {
        taskType: 'suite',
        provider: genMeta.provider,
        model: genMeta.model,
        price: genMeta.price,
        calls: genMeta.calls,
        images: [],
        status: 'failed',
        taskId: task.id,
      }).catch(() => undefined);
    }
    throw error;
  }
}
