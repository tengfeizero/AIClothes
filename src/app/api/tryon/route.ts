import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/queue/task-store';
import { startWorker } from '@/lib/queue';
import { getPlanForTaskType, getQualityFromModel } from '@/lib/ai/generation-plans';
import type { TryonParams } from '@/types';

export const dynamic = 'force-dynamic';

let workerInitialized = false;

function ensureWorkerStarted() {
  if (!workerInitialized) {
    startWorker();
    workerInitialized = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureWorkerStarted();

    const body = (await request.json()) as TryonParams & { planId?: string; outputResolution?: string };

    if (!body.garmentImagePath) {
      return NextResponse.json({ error: 'garmentImagePath is required' }, { status: 400 });
    }

    if (!body.modelImagePath && !body.modelId) {
      return NextResponse.json(
        { error: 'Either modelImagePath or modelId is required' },
        { status: 400 }
      );
    }

    // 生成方案（厂商/模型/价格），默认 AI 换装 flash
    const plan = getPlanForTaskType('tryon', body.planId);
    const quality = getQualityFromModel(plan.model);

    // 解析分辨率：widthxheight 格式 → 即梦 size = width * height
    let jimengSize = 4194304; // 默认 2K
    let resolutionLabel = '2K';
    if (body.outputResolution && body.outputResolution !== 'original') {
      const [w, h] = body.outputResolution.split('x').map(Number);
      if (w > 0 && h > 0) {
        jimengSize = w * h;
        if (jimengSize <= 1048576) resolutionLabel = '1K';
        else if (jimengSize <= 4194304) resolutionLabel = '2K';
        else resolutionLabel = '4K';
      }
    } else if (body.outputResolution === 'original') {
      resolutionLabel = '原图';
    }

    // 构建完整提示词记录
    const fullPrompt = body.backgroundPrompt || '模特穿着该服装，高清写实，全身照';

    const task = createTask({
      type: 'tryon',
      provider: 'tencent',
      params: {
        garmentImagePath: body.garmentImagePath,
        modelImagePath: body.modelImagePath,
        modelId: body.modelId,
        backgroundPrompt: body.backgroundPrompt,
        poseImagePath: body.poseImagePath,
        view: body.view || 'front',
        quality,
        resolution: resolutionLabel,
        // 底层调用能力（混元换装 / MPS 换装）
        method: plan.method || 'mps-tryon',
        clothesType: body.clothesType,
        // 即梦专用参数
        jimengSize,
        // 完整提示词（用于记录和展示）
        fullPrompt,
        // 生成记录元数据（worker 完成时写入 image_generations）
        planId: plan.id,
        providerName: plan.provider,
        model: plan.model,
        price: plan.price,
        calls: plan.calls,
      },
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error) {
    console.error('Tryon error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create try-on task' },
      { status: 500 }
    );
  }
}
