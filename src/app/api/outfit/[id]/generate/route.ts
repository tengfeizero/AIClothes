import { NextRequest, NextResponse } from 'next/server';
import { getOutfit, updateOutfit } from '@/lib/db/outfit-store';
import { createTask } from '@/lib/queue/task-store';
import { startWorker } from '@/lib/queue';
import { getGenerationPlan, getQualityFromModel } from '@/lib/ai/generation-plans';

export const dynamic = 'force-dynamic';

let workerInitialized = false;

function ensureWorkerStarted() {
  if (!workerInitialized) {
    startWorker();
    workerInitialized = true;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    ensureWorkerStarted();

    const outfit = getOutfit(params.id);
    if (!outfit) {
      return NextResponse.json({ error: 'Outfit not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));

    // 生成方案（厂商/模型/价格），未指定时默认第一个（AI 换装 flash 三视角）
    const plan = getGenerationPlan(body.planId);

    const primaryGarment = outfit.garments[0];
    if (!primaryGarment) {
      return NextResponse.json(
        { error: 'Outfit has no garments' },
        { status: 400 }
      );
    }

    // 生成记录元数据：厂商 / 模型 / 费用（worker 完成时写入 outfit_generations）
    const planMeta = {
      planId: plan.id,
      method: plan.method,
      provider: plan.provider,
      model: plan.model,
      price: plan.price,
      calls: plan.calls,
    };

    // 商品套图：不需要模特
    if (plan.taskType === 'outfit_suite') {
      const task = createTask({
        type: 'outfit_suite',
        provider: 'tencent',
        params: {
          ...planMeta,
          outfitId: params.id,
          garmentImagePaths: outfit.garments.map((g) => g.image_path),
          scenePrompt: outfit.scene_prompt,
          panelRatio: body.panelRatio || '3:4',
          panelResolution: body.panelResolution || '2K',
        },
      });

      updateOutfit(params.id, { status: 'generating' });
      return NextResponse.json({ taskId: task.id, plan });
    }

    // 模特试衣三视角：需要模特
    let modelId = body.modelId || outfit.model_id;
    let modelImagePath = body.modelImagePath;

    if (!modelId && !modelImagePath) {
      const { getDefaultModel } = await import('@/lib/db/model-store');
      const defaultModel = getDefaultModel();
      if (defaultModel) {
        modelId = defaultModel.id;
      } else {
        return NextResponse.json(
          { error: 'No model specified and no default model available' },
          { status: 400 }
        );
      }
    }

    const quality = getQualityFromModel(plan.model);

    // 构建完整提示词记录
    const fullPrompt = outfit.scene_prompt || '模特穿着该服装，高清写实，全身照';

    const task = createTask({
      type: 'outfit_batch',
      provider: 'tencent',
      params: {
        ...planMeta,
        outfitId: params.id,
        garmentImagePath: primaryGarment.image_path,
        modelId: modelId,
        modelImagePath: modelImagePath,
        scenePrompt: outfit.scene_prompt,
        quality,
        resolution: body.resolution || '1K',
        // 完整提示词（用于记录和展示）
        fullPrompt,
      },
    });

    updateOutfit(params.id, { status: 'generating' });

    return NextResponse.json({ taskId: task.id, plan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start generation' },
      { status: 500 }
    );
  }
}
