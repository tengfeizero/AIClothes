import { getTask, updateTask } from './task-store';
import { queryTaskResult } from '@/lib/ai/tencent';
import { queryHunyuanTo3DProJob } from '@/lib/ai/tencent3d';
import { finalizeModel3DTask } from './workers/model3d';
import { downloadImageAsBuffer, saveResultFile } from '@/lib/storage/cos';
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

async function ensureWorkerStarted(): Promise<void> {
  try {
    const { startWorker } = await import('./index');
    startWorker();
  } catch (e) {
    console.error('[Reconcile] Failed to start worker:', e);
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
 */
export async function reconcileProviderTask(task: TaskRecord): Promise<TaskRecord> {
  // 只处理本地判定为失败的任务（腾讯/阿里异步任务刷新时重新查询并恢复）
  if (task.status !== 'failed') {
    return task;
  }

  // 单图任务：必须已有 provider_task_id，且失败原因是本地轮询超时/未拿到结果URL
  // （中文"超时"与英文 timed out 均视为可恢复的本地问题；厂商侧已确认失败的除外）
  if (!task.provider_task_id || !task.error) return task;
  const isRecoverable = /timed out|no result URL/i.test(task.error) || /超时/i.test(task.error);
  if (!isRecoverable) return task;

  // 节流：避免高频轮询时重复查询
  const now = Date.now();
  const last = lastReconcileAt.get(task.id) || 0;
  if (now - last < RECONCILE_THROTTLE_MS) {
    return task;
  }
  lastReconcileAt.set(task.id, now);

  try {
    await reconcileSingleTask(task);
  } catch (e) {
    // 查询腾讯云失败则保持原样，下次刷新再试
    console.error(`[Reconcile] Query provider failed for task ${task.id}:`, e);
  }

  return getTask(task.id)!;
}
