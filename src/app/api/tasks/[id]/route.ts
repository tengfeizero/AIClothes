import { NextRequest, NextResponse } from 'next/server';
import { getTask, deleteTask, updateTask } from '@/lib/queue/task-store';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const task = getTask(params.id);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      createdAt: task.created_at,
      completedAt: task.completed_at,
    });
  } catch (error) {
    console.error('Get task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get task' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleted = deleteTask(params.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Delete task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete task' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const task = getTask(params.id);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (task.status !== 'failed') {
      return NextResponse.json({ error: 'Only failed tasks can be retried' }, { status: 400 });
    }
    updateTask(params.id, {
      status: 'pending',
      progress: 0,
      error: null,
      provider_task_id: null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Retry task error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retry task' },
      { status: 500 }
    );
  }
}
