import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/queue/task-store';
import { startWorker } from '@/lib/queue';
import { getPlanForTaskType, getQualityFromModel } from '@/lib/ai/generation-plans';

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

    const body = await request.json();

    if (!body.referenceImagePath || !body.garmentImagePath) {
      return NextResponse.json(
        { error: 'referenceImagePath and garmentImagePath are required' },
        { status: 400 }
      );
    }

    if (!body.modelId && !body.modelImagePath) {
      // Try default model
      const { getDefaultModel } = await import('@/lib/db/model-store');
      const defaultModel = getDefaultModel();
      if (defaultModel) {
        body.modelId = defaultModel.id;
      } else {
        return NextResponse.json(
          { error: 'No model specified and no default model available' },
          { status: 400 }
        );
      }
    }

    // 生成方案（厂商/模型/价格），默认爆款复刻 flash
    const plan = getPlanForTaskType('replicate', body.planId);
    const quality = getQualityFromModel(plan.model);

    // 构建完整提示词记录
    const fullPrompt = body.scenePrompt || '保持原图场景，复刻参考图的动作、姿势和背景';

    const task = createTask({
      type: 'replicate',
      provider: 'tencent',
      params: {
        garmentImagePath: body.garmentImagePath,
        modelId: body.modelId,
        modelImagePath: body.modelImagePath,
        // 参考图（爆款图）：MPS 方案作为 pose+background，混元图生图方案作为输入图
        referenceImagePath: body.referenceImagePath,
        // Use reference image as both pose and background to replicate the scene & pose
        poseImagePath: body.referenceImagePath,
        backgroundImagePath: body.referenceImagePath,
        backgroundPrompt: body.scenePrompt || '保持原图场景，复刻参考图的动作、姿势和背景',
        view: 'front',
        quality,
        resolution: '1K',
        // 底层调用能力（MPS 换装 / 混元图生图）
        method: plan.method || 'mps-tryon',
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
    console.error('Replicate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create replicate task' },
      { status: 500 }
    );
  }
}
