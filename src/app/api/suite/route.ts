import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/queue/task-store';
import { startWorker } from '@/lib/queue';
import { getPlanForTaskType } from '@/lib/ai/generation-plans';

export const dynamic = 'force-dynamic';

let workerInitialized = false;

function ensureWorkerStarted() {
  if (!workerInitialized) {
    startWorker();
    workerInitialized = true;
  }
}

/**
 * 独立「商品套图」入口：上传单件商品图，调用腾讯云 WAND-suite 一次生成 4 张商品海报
 * （hero/detail/selling/atmosphere）。
 * body: { garmentImagePath, scenePrompt?, panelRatio?, panelResolution?, planId? }
 */
export async function POST(request: NextRequest) {
  try {
    ensureWorkerStarted();

    const body = await request.json();

    if (!body.garmentImagePath) {
      return NextResponse.json({ error: 'garmentImagePath is required' }, { status: 400 });
    }

    // 生成方案（厂商/模型/价格），默认商品套图 flash
    const plan = getPlanForTaskType('outfit_suite', body.planId);

    const task = createTask({
      type: 'outfit_suite',
      provider: 'tencent',
      params: {
        garmentImagePath: body.garmentImagePath,
        scenePrompt: body.scenePrompt,
        panelRatio: body.panelRatio || '3:4',
        panelResolution: body.panelResolution || '2K',
        // 生成记录元数据（worker 完成时写入 image_generations）
        planId: plan.id,
        provider: plan.provider,
        model: plan.model,
        price: plan.price,
        calls: plan.calls,
      },
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error) {
    console.error('Suite error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create suite task' },
      { status: 500 }
    );
  }
}
