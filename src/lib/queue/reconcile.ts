import { getTask, updateTask } from './task-store';
import { queryTaskResult } from '@/lib/ai/tencent';
import { queryHunyuanTo3DProJob } from '@/lib/ai/tencent3d';
import { finalizeModel3DTask } from './workers/model3d';
import { downloadImageAsBuffer, saveResultFile } from '@/lib/storage/cos';
import { getOutfit, updateOutfit } from '@/lib/db/outfit-store';
import { recordGenerationForTask } from '@/lib/db/generation-store';
import { recordImageGenerationForTask } from '@/lib/db/image-generation-store';
import type { TaskRecord } from '@/types';

// 从任务 params 取生成记录元数据（老任务没有则兜底）
function genMetaFromParams(
  params: Record<string, unknown>,
  fallbackModel: string,
  fallbackPrice: number,
  fallbackCalls: number
): { provider: string; model: string; price: number; calls: number } {
  return {
    provider: (params.provider as string) || '腾讯云 MPS',
    model: (params.model as string) || fallbackModel,
    price: (params.price as number) ?? fallbackPrice,
    calls: (params.calls as number) ?? fallbackCalls,
  };
}

// 节流：同一任务 N 秒内最多 reconcile 一次，避免前端轮询时频繁查询腾讯云
const RECONCILE_THROTTLE_MS = 30 * 1000;
const lastReconcileAt = new Map<string, number>();

// 穿搭方案某个视角在腾讯云失败后的最大重试次数
const MAX_VIEW_RETRIES = 3;

type ViewKey = 'front' | 'side' | 'back';

/** 从结果 URL 推导图片扩展名 */
function extFromUrl(url: string): string {
  const match = url.match(/\.(png|jpe?g|webp)(\?|$)/i);
  if (!match) return '.jpg';
  return match[1].toLowerCase() === 'jpeg' ? '.jpg' : `.${match[1].toLowerCase()}`;
}

/**
 * 从错误信息中提取失败视角："View side timed out" → 'side'
 */
function extractViewFromError(error: string | null): ViewKey | undefined {
  if (!error) return undefined;
  const match = error.match(/View\s+(front|side|back)/i);
  if (!match) return undefined;
  return match[1].toLowerCase() as ViewKey;
}

async function ensureWorkerStarted(): Promise<void> {
  try {
    const { startWorker } = await import('./index');
    startWorker();
  } catch (e) {
    console.error('[Reconcile] Failed to start worker:', e);
  }
}

/**
 * 把任务重置为 pending，由 worker 从已完成视角断点续跑（outfit 里已有的视角路径会被跳过）
 */
async function resetToPending(task: TaskRecord, outfitId?: string): Promise<void> {
  if (outfitId) {
    updateOutfit(outfitId, { status: 'generating' });
  }
  updateTask(task.id, { status: 'pending', error: null, progress: Math.max(task.progress || 0, 10) });
  await ensureWorkerStarted();
}

/**
 * 删除失败视角的已提交记录并重新排队。每个视角最多重试 MAX_VIEW_RETRIES 次，
 * 超过则保持失败，避免对持续失败（如输入图下载不了）的任务无限重试计费。
 */
async function removeViewTaskAndRetry(task: TaskRecord, view: ViewKey): Promise<void> {
  const params = (task.params || {}) as Record<string, unknown>;
  const viewTasks = { ...((params.viewTasks || {}) as Record<string, string>) };
  delete viewTasks[view];

  const viewRetries = { ...((params.viewRetries || {}) as Record<string, number>) };
  const retries = (viewRetries[view] || 0) + 1;
  viewRetries[view] = retries;

  const outfitId = params.outfitId as string | undefined;

  if (retries > MAX_VIEW_RETRIES) {
    updateTask(task.id, {
      params: { ...params, viewTasks, viewRetries },
      error: `View ${view} failed after ${MAX_VIEW_RETRIES} retries`,
    });
    if (outfitId) {
      updateOutfit(outfitId, { status: 'failed' });
    }
    console.log(`[Reconcile] Outfit task ${task.id}: view ${view} exceeded max retries, keep failed`);
    return;
  }

  updateTask(task.id, { params: { ...params, viewTasks, viewRetries } });
  await resetToPending(task, outfitId);
  console.log(`[Reconcile] Outfit task ${task.id}: view ${view} will be resubmitted (retry ${retries}/${MAX_VIEW_RETRIES})`);
}

/**
 * 穿搭方案（outfit_batch）增量恢复：只恢复错误信息里指明的那个视角，
 * 其余已完成视角（outfit 里已有图片路径）由 worker 直接复用，不再重复生成。
 */
async function reconcileOutfitBatchTask(task: TaskRecord): Promise<void> {
  const params = (task.params || {}) as Record<string, unknown>;
  const viewTasks = (params.viewTasks || {}) as Partial<Record<ViewKey, string>>;
  const view = extractViewFromError(task.error);
  const outfitId = params.outfitId as string | undefined;
  const providerTaskId = view ? viewTasks[view] : undefined;

  if (!outfitId) {
    updateTask(task.id, { error: 'Outfit id missing in task params' });
    return;
  }

  if (!view || !providerTaskId) {
    // 无法定位失败视角，或该视角从未提交成功：重置 pending，worker 跳过已完成视角继续
    await resetToPending(task, outfitId);
    console.log(`[Reconcile] Outfit task ${task.id}: no submitted view found, reset to pending for incremental retry`);
    return;
  }

  // 查询腾讯云该视角任务，统一为 finished / failed / processing 三种结论
  let finished = false;
  let failed = false;
  let errMsg: string | undefined;
  let resultUrl: string | undefined;

  const r = await queryTaskResult(providerTaskId);
  if (r.Status === 'FINISH') {
    if (r.ErrMsg || r.Message) {
      failed = true;
      errMsg = r.Message || r.ErrMsg;
    } else {
      finished = true;
      const output = r.ImageProcessTaskResultSet?.[0]?.Output;
      const signedUrl = output?.SignedUrl;
      const cosBase = process.env.TENCENT_COS_PUBLIC_URL || '';
      const cosUrl = output?.Path && cosBase ? `${cosBase}/${output.Path.replace(/^\//, '')}` : undefined;
      resultUrl = signedUrl || cosUrl;
    }
  } else if (r.Status === 'FAILED') {
    failed = true;
    errMsg = r.ErrMsg || 'unknown';
  }

  if (failed) {
    console.log(`[Reconcile] View ${view} failed on Tencent: ${errMsg}`);
    await removeViewTaskAndRetry(task, view);
    return;
  }

  if (finished) {
    if (!resultUrl) {
      await removeViewTaskAndRetry(task, view);
      return;
    }

    // 下载并保存该视角结果到 COS
    const imageBuffer = await downloadImageAsBuffer(resultUrl);
    const saved = await saveResultFile(imageBuffer, '.jpg');

    if (view === 'front') {
      updateOutfit(outfitId, { frontImagePath: saved.url, status: 'generating' });
    } else if (view === 'side') {
      updateOutfit(outfitId, { sideImagePath: saved.url, status: 'generating' });
    } else {
      updateOutfit(outfitId, { backImagePath: saved.url, status: 'generating' });
    }

    // 清理已恢复视角的已提交记录
    const nextViewTasks = { ...viewTasks };
    delete nextViewTasks[view];
    updateTask(task.id, { params: { ...params, viewTasks: nextViewTasks } });

    const outfit = getOutfit(outfitId);
    if (outfit && outfit.front_image_path && outfit.side_image_path && outfit.back_image_path) {
      // 三个视角都齐了 → 整体完成
      updateOutfit(outfitId, { status: 'completed' });

      // 补写生成记录（worker 已写则幂等跳过）
      const meta = genMetaFromParams(params, 'WAND-tryon-1.0-flash', 2.12, 3);
      await recordGenerationForTask(task.id, {
        outfitId,
        type: 'tryon',
        provider: meta.provider,
        model: meta.model,
        price: meta.price,
        calls: meta.calls,
        images: [outfit.front_image_path, outfit.side_image_path, outfit.back_image_path],
        taskId: task.id,
      }).catch(() => undefined);

      updateTask(task.id, {
        status: 'completed',
        progress: 100,
        error: null,
        result: {
          outfitId,
          images: {
            front: outfit.front_image_path,
            side: outfit.side_image_path,
            back: outfit.back_image_path,
          },
          taskType: 'outfit_batch',
        },
      });
      console.log(`[Reconcile] Outfit task ${task.id} fully recovered as completed`);
    } else {
      // 还有剩余视角未生成：重置 pending，worker 继续生成
      await resetToPending(task, outfitId);
      console.log(`[Reconcile] Outfit task ${task.id}: view ${view} recovered, continue remaining views`);
    }
    return;
  }

  // 厂商侧仍在处理该视角：重置 pending，worker 带着该视角的 provider_task_id 继续轮询（不重复提交）
  await resetToPending(task, outfitId);
  console.log(`[Reconcile] Outfit task ${task.id}: view ${view} still processing on Tencent, continue polling`);
}

/**
 * AI 商品套图任务恢复：单次提交，凭 params.suiteTaskId 查询腾讯云，
 * 成功则收集所有输出图保存到 outfit.suite_image_paths。
 */
async function reconcileSuiteTask(task: TaskRecord): Promise<void> {
  const params = (task.params || {}) as Record<string, unknown>;
  const outfitId = params.outfitId as string | undefined;
  const suiteTaskId = params.suiteTaskId as string | undefined;

  if (!outfitId || !suiteTaskId) {
    updateTask(task.id, { error: 'Suite task params missing (outfitId/suiteTaskId)' });
    return;
  }

  const result = await queryTaskResult(suiteTaskId);

  if (result.Status === 'FINISH') {
    if (result.ErrMsg || result.Message) {
      // 腾讯云侧实际失败（如输入图下载失败）：保持失败，前端可重新生成
      updateTask(task.id, { error: `Suite failed on Tencent: ${result.Message || result.ErrMsg}` });
      return;
    }

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
      updateTask(task.id, { error: 'Suite finished but no result URLs' });
      return;
    }

    const savedUrls: string[] = [];
    for (const url of urls) {
      const imageBuffer = await downloadImageAsBuffer(url);
      const saved = await saveResultFile(imageBuffer, extFromUrl(url));
      savedUrls.push(saved.url);
    }

    updateOutfit(outfitId, { suiteImagePaths: savedUrls, status: 'completed' });

    // 补写生成记录（worker 已写则幂等跳过）
    const meta = genMetaFromParams(params, 'WAND-suite-1.0-flash', 0.79, 1);
    await recordGenerationForTask(task.id, {
      outfitId,
      type: 'suite',
      provider: meta.provider,
      model: meta.model,
      price: meta.price,
      calls: meta.calls,
      images: savedUrls,
      taskId: task.id,
    }).catch(() => undefined);

    updateTask(task.id, {
      status: 'completed',
      progress: 100,
      error: null,
      result: { outfitId, images: savedUrls, taskType: 'outfit_suite' },
    });
    console.log(`[Reconcile] Suite task ${task.id} recovered as completed`);
  } else if (result.Status === 'FAILED') {
    updateTask(task.id, { error: result.ErrMsg || 'Suite task failed on Tencent' });
  } else {
    // 腾讯云仍在处理：重置 pending，worker 凭 suiteTaskId 继续轮询（不重复提交）
    updateOutfit(outfitId, { status: 'generating' });
    updateTask(task.id, { status: 'pending', progress: Math.max(task.progress || 0, 10), error: null });
    await ensureWorkerStarted();
    console.log(`[Reconcile] Suite task ${task.id} still processing on Tencent, reset to pending`);
  }
}

/**
 * 腾讯混元生3D 任务恢复：凭 provider_task_id（JobId）查询，
 * DONE → 转存 GLB 到 COS 并完成任务；WAIT/RUN → 重置 pending 续轮询
 */
async function reconcileModel3DTask(task: TaskRecord): Promise<void> {
  const jobId = task.provider_task_id;
  if (!jobId) {
    updateTask(task.id, { error: 'model3d 任务缺少 provider_task_id' });
    return;
  }

  const result = await queryHunyuanTo3DProJob(jobId);

  if (result.status === 'DONE') {
    await finalizeModel3DTask(task, result.files);
    console.log(`[Reconcile] Task ${task.id} recovered as completed (hunyuan-3d)`);
  } else if (result.status === 'FAIL') {
    updateTask(task.id, { error: `混元生3D 任务失败: ${result.errorMessage || result.errorCode || 'unknown'}` });
  } else {
    // 腾讯云仍在处理：重置 pending，worker 凭 JobId 继续轮询（不重复提交扣积分）
    updateTask(task.id, { status: 'pending', progress: 10, error: null });
    await ensureWorkerStarted();
    console.log(`[Reconcile] Task ${task.id} still processing on Tencent (hunyuan-3d), reset to pending`);
  }
}

/**
 * 单图任务（tryon/replicate）恢复逻辑
 */
async function reconcileSingleTask(task: TaskRecord): Promise<void> {
  const params = (task.params || {}) as Record<string, unknown>;
  // 腾讯混元生3D 走 ai3d 查询接口
  if (task.type === 'model3d') {
    return reconcileModel3DTask(task);
  }
  // 同步接口（混元/通用图生图）无 provider_task_id：保持失败，前端重新生成即可
  if (!task.provider_task_id) {
    return;
  }

  const result = await queryTaskResult(task.provider_task_id);

  if (result.Status === 'FINISH') {
    if (result.ErrMsg || result.Message) {
      updateTask(task.id, { error: `Tencent task failed: ${result.Message || result.ErrMsg}` });
      return;
    }

    const output = result.ImageProcessTaskResultSet?.[0]?.Output;
    const signedUrl = output?.SignedUrl;
    const cosBase = process.env.TENCENT_COS_PUBLIC_URL || '';
    const cosUrl = output?.Path && cosBase ? `${cosBase}/${output.Path.replace(/^\//, '')}` : undefined;
    const resultUrl = signedUrl || cosUrl;

    if (!resultUrl) {
      updateTask(task.id, { error: `Task finished but no result URL. Detail: ${result.Message || result.ErrMsg || 'unknown'}` });
      return;
    }

    // 下载并保存结果到 COS
    const imageBuffer = await downloadImageAsBuffer(resultUrl);
    const saved = await saveResultFile(imageBuffer, '.jpg');

    // 补写生成记录（worker 已写则幂等跳过）
    const params = (task.params || {}) as Record<string, unknown>;
    const meta = genMetaFromParams(params, 'WAND-tryon-1.0-flash', 2.12, 1);
    await recordImageGenerationForTask(task.id, {
      taskType: task.type === 'replicate' ? 'replicate' : 'tryon',
      provider: meta.provider,
      model: meta.model,
      price: meta.price,
      calls: meta.calls,
      images: [saved.url],
      taskId: task.id,
    }).catch(() => undefined);

    updateTask(task.id, {
      status: 'completed',
      progress: 100,
      error: null,
      result: {
        images: [saved.url],
        taskType: task.type === 'replicate' ? 'replicate' : 'tryon',
      },
    });
    console.log(`[Reconcile] Task ${task.id} recovered as completed`);
  } else if (result.Status === 'FAILED') {
    updateTask(task.id, { error: result.ErrMsg || 'Tencent task failed' });
  } else {
    // 腾讯云任务仍在运行：重置为 pending，worker 会基于已有 provider_task_id 继续轮询（不会重复提交）
    updateTask(task.id, { status: 'pending', progress: 10, error: null });
    await ensureWorkerStarted();
    console.log(`[Reconcile] Task ${task.id} still processing on Tencent, reset to pending`);
  }
}

/**
 * 本地轮询超时/解析失败的任务（腾讯云任务可能仍在运行或已完成）。
 * 用户刷新页面时调用此函数重新向腾讯云查询任务状态：
 * - tryon/replicate：整体查询 task.provider_task_id 并恢复
 * - outfit_batch：从 task.params.viewTasks 中定位错误信息里的视角，只恢复该视角，
 *   已完成视角由 worker 直接复用，实现增量恢复
 * - outfit_suite：凭 task.params.suiteTaskId 查询腾讯云并恢复，成功后保存全部套图结果
 */
export async function reconcileProviderTask(task: TaskRecord): Promise<TaskRecord> {
  const isOutfitBatch = task.type === 'outfit_batch';
  const isSuite = task.type === 'outfit_suite';
  const params = (task.params || {}) as Record<string, unknown>;

  // 只处理本地判定为失败的任务（腾讯/阿里异步任务刷新时重新查询并恢复）
  if (task.status !== 'failed') {
    return task;
  }

  if (isSuite) {
    // 商品套图：必须有 suiteTaskId，且失败原因是本地侧问题（超时/未拿到结果URL）
    const params = (task.params || {}) as Record<string, unknown>;
    if (!params.suiteTaskId || !task.error || !/timed out|no result URL/i.test(task.error)) {
      return task;
    }
  } else if (isOutfitBatch) {
    // 穿搭方案：错误信息里必须指明具体视角才可恢复。
    // 老任务可能没有 viewTasks（此前未持久化视角任务id），此时直接重置 pending，
    // 由 worker 基于 outfit 里已完成的视角路径增量续跑
    if (!extractViewFromError(task.error)) return task;
  } else {
    // 单图任务：必须已有 provider_task_id，且失败原因是本地轮询超时/未拿到结果URL
    // （中文"超时"与英文 timed out 均视为可恢复的本地问题；厂商侧已确认失败的除外）
    if (!task.provider_task_id || !task.error) return task;
    const isRecoverable = /timed out|no result URL/i.test(task.error) || /超时/i.test(task.error);
    if (!isRecoverable) return task;
  }

  // 节流：避免高频轮询时重复查询
  const now = Date.now();
  const last = lastReconcileAt.get(task.id) || 0;
  if (now - last < RECONCILE_THROTTLE_MS) {
    return task;
  }
  lastReconcileAt.set(task.id, now);

  try {
    if (isSuite) {
      await reconcileSuiteTask(task);
    } else if (isOutfitBatch) {
      await reconcileOutfitBatchTask(task);
    } else {
      await reconcileSingleTask(task);
    }
  } catch (e) {
    // 查询腾讯云失败则保持原样，下次刷新再试
    console.error(`[Reconcile] Query provider failed for task ${task.id}:`, e);
  }

  return getTask(task.id)!;
}
