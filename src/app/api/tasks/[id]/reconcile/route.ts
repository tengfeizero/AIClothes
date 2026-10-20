import { NextResponse } from 'next/server';
import { getTask } from '@/lib/queue/task-store';
import { reconcileProviderTask } from '@/lib/queue/reconcile';

export const dynamic = 'force-dynamic';

/**
 * 手动触发任务恢复：向厂商（腾讯云/阿里云）查询失败任务的真实状态并恢复。
 * 仅当任务失败且可恢复时才查询厂商；其余情况直接返回当前状态。
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const task = getTask(params.id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updated = await reconcileProviderTask(task);

    return NextResponse.json({ task: updated });
  } catch (error) {
    console.error('Reconcile task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to reconcile task' },
      { status: 500 }
    );
  }
}
