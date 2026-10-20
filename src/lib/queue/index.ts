import { getPendingTasks, getStaleProcessingTasks, updateTask, getTask } from './task-store';
import { processTryonTask } from './workers/tryon';
import { processOutfitBatchTask } from './workers/outfit-batch';
import { processOutfitSuiteTask } from './workers/outfit-suite';
import { processModel3DTask } from './workers/model3d';
import type { TaskRecord } from '@/types';

let workerStarted = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;
const CONCURRENCY = 3;
const POLL_INTERVAL_MS = 2000;
const activeTasks = new Set<string>();

async function executeTask(task: TaskRecord): Promise<void> {
  if (activeTasks.has(task.id)) return;
  activeTasks.add(task.id);

  try {
    switch (task.type) {
      case 'tryon':
      case 'replicate':
        await processTryonTask(task);
        break;
      case 'outfit_batch':
        await processOutfitBatchTask(task);
        break;
      case 'outfit_suite':
        await processOutfitSuiteTask(task);
        break;
      case 'multi_view':
        await processOutfitBatchTask(task);
        break;
      case 'model3d':
        await processModel3DTask(task);
        break;
      case 'edit':
      case 'generate':
        await processTryonTask(task);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Queue] Task ${task.id} failed:`, errorMessage);

    // 单图任务（AI 换装/爆款复刻/AI编辑）失败也保留生成记录（含厂商/模型/费用），便于追溯
    if (task.type === 'tryon' || task.type === 'replicate' || task.type === 'edit') {
      const p = (task.params || {}) as Record<string, unknown>;
      try {
        const { recordImageGenerationForTask } = await import('@/lib/db/image-generation-store');
        await recordImageGenerationForTask(task.id, {
          taskType: task.type === 'replicate' ? 'replicate' : 'tryon',
          provider: (p.providerName as string) || '腾讯云 MPS',
          model: (p.model as string) || 'WAND-tryon-1.0-flash',
          price: (p.price as number) ?? 2.12,
          calls: (p.calls as number) ?? 1,
          images: [],
          status: 'failed',
          taskId: task.id,
        });
      } catch (e) {
        console.error(`[Queue] Failed to record failed generation for task ${task.id}:`, e);
      }
    }

    updateTask(task.id, {
      status: 'failed',
      error: errorMessage,
      progress: 0,
    });
  } finally {
    activeTasks.delete(task.id);
  }
}

async function checkAndRecoverStaleTasks(): Promise<void> {
  const staleTasks = getStaleProcessingTasks();
  for (const task of staleTasks) {
    if (task.type === 'outfit_batch' || task.type === 'multi_view' || task.type === 'outfit_suite' || task.type === 'model3d') {
      // Multi-step / 长耗时任务：重置为 pending，worker 凭已有 provider_task_id 续轮询（不重复提交计费）
      // (outfit_batch：已完成的视角路径在 outfit 里，worker 会直接复用；未完成的视角带已有 provider_task_id 继续轮询)
      // (outfit_suite：worker 凭 params.suiteTaskId 继续轮询，不重复提交)
      updateTask(task.id, { status: 'pending', progress: 0, error: null });
      continue;
    }

    if (task.provider_task_id && task.provider === 'tencent') {
      try {
        const { queryTaskResult } = await import('@/lib/ai/tencent');
        const result = await queryTaskResult(task.provider_task_id);
        if (result.Status === 'FINISH') {
          // 检查任务是否实际失败（返回 FINISH 但带错误信息）
          if (result.ErrMsg || result.Message) {
            updateTask(task.id, {
              status: 'failed',
              error: result.Message || result.ErrMsg,
            });
            continue;
          }
          const output = result.ImageProcessTaskResultSet?.[0]?.Output;
          const signedUrl = output?.SignedUrl;
          const cosBase = process.env.TENCENT_COS_PUBLIC_URL || '';
          const cosUrl = output?.Path && cosBase ? `${cosBase}/${output.Path.replace(/^\//, '')}` : undefined;
          const resultUrl = signedUrl || cosUrl;
          if (resultUrl) {
            const { downloadImageAsBuffer, saveResultFile } = await import('@/lib/storage/cos');
            const buffer = await downloadImageAsBuffer(resultUrl);
            const saved = await saveResultFile(buffer, '.jpg');
            updateTask(task.id, {
              status: 'completed',
              progress: 100,
              result: { images: [saved.url] },
            });
          }
        } else if (result.Status === 'FAILED') {
          updateTask(task.id, {
            status: 'failed',
            error: result.ErrMsg || 'Task failed',
          });
        }
        // If still WAITING/PROCESSING, leave it
      } catch {
        // If recovery fails, mark as pending for retry
        updateTask(task.id, { status: 'pending', progress: 0 });
      }
    } else {
      updateTask(task.id, { status: 'pending', progress: 0 });
    }
  }
}

async function poll(): Promise<void> {
  if (activeTasks.size >= CONCURRENCY) return;

  const availableSlots = CONCURRENCY - activeTasks.size;
  const pendingTasks = getPendingTasks(availableSlots);

  for (const task of pendingTasks) {
    updateTask(task.id, { status: 'processing' });
    // Execute without awaiting to allow concurrent processing
    executeTask(task);
  }
}

export function startWorker(): void {
  if (workerStarted) return;
  workerStarted = true;

  console.log('[Queue] Starting task worker...');

  // Initial recovery check
  checkAndRecoverStaleTasks().catch(console.error);

  // Start polling
  pollInterval = setInterval(() => {
    poll().catch(console.error);
  }, POLL_INTERVAL_MS);

  // Periodic stale task recovery (every 30 seconds)
  setInterval(() => {
    checkAndRecoverStaleTasks().catch(console.error);
  }, 30000);
}

export function stopWorker(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  workerStarted = false;
  console.log('[Queue] Task worker stopped');
}

export function getActiveTaskCount(): number {
  return activeTasks.size;
}
