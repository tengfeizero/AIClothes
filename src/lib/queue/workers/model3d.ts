import { submitHunyuanTo3DProJob, queryHunyuanTo3DProJob, type HunyuanTo3DFile } from '@/lib/ai/tencent3d';
import { updateTask } from '../task-store';
import { recordImageGenerationForTask } from '@/lib/db/image-generation-store';
import { downloadImageAsBuffer, saveUploadedFile } from '@/lib/storage/cos';
import type { TaskRecord } from '@/types';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60; // 5 minutes max

/** 多视角图默认视角顺序（front 会映射为混元的 left 视角） */
const DEFAULT_VIEWS = ['front', 'left', 'right', 'back', 'left_front', 'right_front', 'top', 'bottom'] as const;

function resolveUrl(imagePath: string): string {
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  const cosUrl = process.env.TENCENT_COS_PUBLIC_URL;
  if (cosUrl && (imagePath.startsWith('/uploads/') || imagePath.startsWith('uploads/'))) {
    return `${cosUrl}/${imagePath.replace(/^\//, '')}`;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${appUrl}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
}

function buildGenMeta(params: Record<string, unknown>): { provider: string; model: string; price: number; calls: number } {
  return {
    provider: (params.providerName as string) || '腾讯云 混元生3D',
    model: (params.model as string) || 'hy-3d-3.1',
    price: (params.price as number) ?? 3.6,
    calls: (params.calls as number) ?? 1,
  };
}

/**
 * 混元生3D 任务完成后的统一收尾：下载 GLB 与预览图转存 COS 永久 URL，
 * 写生成记录并把任务标记为 completed。worker 与 reconcile 恢复共用。
 */
export async function finalizeModel3DTask(task: TaskRecord, files: HunyuanTo3DFile[]): Promise<void> {
  const glbFile = files.find((f) => f.type.toUpperCase() === 'GLB');
  if (!glbFile?.url) {
    throw new Error(`混元生3D 任务成功但未返回 GLB 文件: ${files.map((f) => f.type).join(',')}`);
  }

  const glbBuffer = await downloadImageAsBuffer(glbFile.url);
  const savedGlb = await saveUploadedFile({
    type: 'model3d',
    filename: 'model.glb',
    buffer: glbBuffer,
    contentType: 'model/gltf-binary',
  });

  // 转存预览图（如返回）
  let previewUrl = '';
  const previewFile = files.find((f) => f.type.toUpperCase() === 'IMAGE' || f.previewImageUrl);
  const previewSrc = previewFile?.previewImageUrl || (previewFile?.url && previewFile.type.toUpperCase() === 'IMAGE' ? previewFile.url : '');
  if (previewSrc) {
    try {
      const previewBuffer = await downloadImageAsBuffer(previewSrc);
      const savedPreview = await saveUploadedFile({
        type: 'results',
        filename: 'preview.png',
        buffer: previewBuffer,
        contentType: 'image/png',
      });
      previewUrl = savedPreview.url;
    } catch (e) {
      console.warn(`[Model3D] Failed to persist preview for task ${task.id}:`, e);
    }
  }

  const params = (task.params || {}) as Record<string, unknown>;
  const meta = buildGenMeta(params);
  await recordImageGenerationForTask(task.id, {
    taskType: 'model3d',
    provider: meta.provider,
    model: meta.model,
    price: meta.price,
    calls: meta.calls,
    images: [savedGlb.url, previewUrl].filter(Boolean),
    taskId: task.id,
  }).catch(() => undefined);

  updateTask(task.id, {
    status: 'completed',
    progress: 100,
    error: null,
    result: { glbUrl: savedGlb.url, previewUrl, taskType: 'model3d' },
  });
  console.log(`[Model3D] Task ${task.id} completed, glb: ${savedGlb.url}`);
}

export async function processModel3DTask(task: TaskRecord): Promise<void> {
  const params = (task.params || {}) as Record<string, unknown>;
  const imageUrls = (params.imageUrls as string[]) || [];
  if (imageUrls.length === 0) {
    throw new Error('model3d 任务缺少输入图片 imageUrls');
  }
  if (imageUrls.length > 8) {
    throw new Error(`model3d 最多支持 8 张多视角图，当前 ${imageUrls.length} 张`);
  }

  // 增量恢复：已有 provider_task_id（JobId）则跳过重新提交（避免重复扣积分）
  let jobId = task.provider_task_id;
  if (jobId) {
    updateTask(task.id, { status: 'processing', progress: 15 });
  } else {
    updateTask(task.id, { status: 'processing', progress: 10 });

    const viewTypes = (params.viewTypes as string[]) || [];
    const multiViewImages = imageUrls.slice(1).map((url, i) => ({
      viewType: (viewTypes[i + 1] || DEFAULT_VIEWS[i + 1] || 'left') as 'left' | 'right' | 'back',
      imageUrl: resolveUrl(url),
    }));

    const submitParams: Parameters<typeof submitHunyuanTo3DProJob>[0] = {
      // model3dVersion 为混元 API 的真实版本号（3.0/3.1）；params.model 是方案展示名（如 hy-3d-3.1）
      model: (params.model3dVersion as '3.0' | '3.1') || '3.1',
      resultFormat: (params.resultFormat as 'GLB') || 'GLB',
      enablePbr: params.enablePbr as boolean | undefined,
      generateType: 'Normal',
    };

    if (multiViewImages.length > 0) {
      // 第一张作为主视角（front），其余作为多视角补充
      const mainUrl = resolveUrl(imageUrls[0]);
      submitParams.multiViewImages = [
        { viewType: 'front', imageUrl: mainUrl },
        ...multiViewImages,
      ];
    } else {
      submitParams.imageUrl = resolveUrl(imageUrls[0]);
    }

    jobId = await submitHunyuanTo3DProJob(submitParams);
    updateTask(task.id, { provider_task_id: jobId, progress: 15 });
  }

  // 轮询任务结果
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const result = await queryHunyuanTo3DProJob(jobId);

    if (result.status === 'DONE') {
      await finalizeModel3DTask(task, result.files);
      return;
    }

    if (result.status === 'FAIL') {
      throw new Error(`混元生3D 任务失败: ${result.errorMessage || result.errorCode || 'unknown'}`);
    }

    // WAIT / RUN：继续轮询，更新进度
    updateTask(task.id, { progress: Math.min(95, 15 + Math.floor((attempt / MAX_POLL_ATTEMPTS) * 80)) });
  }

  throw new Error('混元生3D 任务超时');
}
