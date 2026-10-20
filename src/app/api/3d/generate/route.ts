import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/queue/task-store';
import { startWorker } from '@/lib/queue';
import { getPlanForTaskType } from '@/lib/ai/generation-plans';
import type { Model3DParams } from '@/types';

export const dynamic = 'force-dynamic';

let workerInitialized = false;

function ensureWorkerStarted() {
  if (!workerInitialized) {
    startWorker();
    workerInitialized = true;
  }
}

/**
 * 3D 商品模型生成（腾讯混元生3D）。
 * 接收手机拍摄的同物品多视角图片 URL，异步生成 GLB 模型。
 */
export async function POST(request: NextRequest) {
  try {
    ensureWorkerStarted();

    const body = (await request.json()) as Model3DParams & { planId?: string };
    const imageUrls = body.imageUrls || [];

    if (imageUrls.length === 0) {
      return NextResponse.json({ error: 'imageUrls is required' }, { status: 400 });
    }
    if (imageUrls.length > 8) {
      return NextResponse.json({ error: '最多支持 8 张多视角图片' }, { status: 400 });
    }

    // 生成方案（厂商/模型/价格），默认混元生3D
    const plan = getPlanForTaskType('model3d', body.planId);

    const task = createTask({
      type: 'model3d',
      provider: 'tencent',
      params: {
        imageUrls,
        resultFormat: body.resultFormat || 'GLB',
        enablePbr: body.enablePbr,
        planId: plan.id,
        providerName: plan.provider,
        model: plan.model,
        // 混元 API 真实模型版本号（区别于展示名 model）
        model3dVersion: '3.1',
        price: plan.price,
        calls: plan.calls,
      },
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error) {
    console.error('Model3D generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create 3D model task' },
      { status: 500 }
    );
  }
}
