import { NextRequest } from 'next/server';
import { listTasks, listTasksPaginated } from '@/lib/queue/task-store';
import { startWorker } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    startWorker();

    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');
    const typeParam = searchParams.get('type');

    // 有分页参数时走分页逻辑，否则走原有 listTasks（兼容轮询等场景）
    if (pageParam) {
      const page = Math.max(1, parseInt(pageParam, 10) || 1);
      const pageSize = [5, 10, 20, 40, 80].includes(parseInt(pageSizeParam || '10', 10))
        ? parseInt(pageSizeParam || '10', 10)
        : 10;

      const paginated = listTasksPaginated(page, pageSize, typeParam || undefined);

      // 标准化 result.images
      paginated.tasks = paginated.tasks.map((task) => {
        const result = task.result as Record<string, unknown> | null;
        if (result && result.images && !Array.isArray(result.images) && typeof result.images === 'object') {
          result.images = Object.values(result.images as Record<string, string>).filter((v): v is string => !!v);
        }
        return task;
      });

      return Response.json(paginated);
    }

    // 无分页参数：返回全部（兼容旧逻辑）
    let tasks = listTasks(100);

    tasks = tasks.map((task) => {
      const result = task.result as Record<string, unknown> | null;
      if (result && result.images && !Array.isArray(result.images) && typeof result.images === 'object') {
        result.images = Object.values(result.images as Record<string, string>).filter((v): v is string => !!v);
      }
      return task;
    });

    return Response.json({ tasks });
  } catch (error) {
    console.error('List tasks error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to list tasks' },
      { status: 500 }
    );
  }
}
