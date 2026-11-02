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
 * 依据实际提供的选填图（模特/姿势/服装）动态生成输入指令。
 * 输入图顺序固定：图1 = 参考图，其后依次为已选填的模特图、姿势图、服装图。
 */
function buildReplicatePrompt(opts: {
  hasModel: boolean;
  hasPose: boolean;
  hasGarment: boolean;
  scenePrompt?: string;
}) {
  let index = 2;
  const modelIndex = opts.hasModel ? index++ : 0;
  const poseIndex = opts.hasPose ? index++ : 0;
  const garmentIndex = opts.hasGarment ? index++ : 0;

  const parts: string[] = ['以图1为爆款参考，保持整体风格与画面构图'];

  parts.push(
    modelIndex
      ? `将人物替换为图${modelIndex}中的模特，保持其五官、脸型、发型和身材`
      : '保持图1人物的五官、脸型、发型和身材'
  );
  parts.push(
    poseIndex ? `人物动作姿势参考图${poseIndex}` : '保持图1人物的动作姿势'
  );
  parts.push(
    garmentIndex
      ? `人物穿着图${garmentIndex}中的服装，服装版型、颜色、图案与图${garmentIndex}完全一致`
      : '保持图1人物身上原有的服装'
  );
  parts.push('背景场景保持图1不变，高清写实，全身照');

  const prompt = parts.join('，');
  return opts.scenePrompt ? `${prompt}。${opts.scenePrompt}` : prompt;
}

export async function POST(request: NextRequest) {
  try {
    ensureWorkerStarted();

    const body = await request.json();
    const outputResolution = body.outputResolution as string | undefined;
    const modelImagePath = body.modelImagePath as string | undefined;
    const poseImagePath = body.poseImagePath as string | undefined;
    const garmentImagePath = body.garmentImagePath as string | undefined;

    if (!body.referenceImagePath) {
      return NextResponse.json(
        { error: 'referenceImagePath is required' },
        { status: 400 }
      );
    }

    // 爆款复刻可选方案：阿里云 qwen-image / 火山引擎即梦
    const plan = getPlanForTaskType('replicate', body.planId);
    const method = plan.method || 'aliyun-qwen-image';

    // 解析分辨率：qwen-image 用 "W*H"，即梦用像素总数
    let aliyunSize: string | undefined;
    let jimengSize: number | undefined;
    let resolutionLabel = plan.resolution || '1024x1536';
    if (outputResolution && outputResolution !== 'original') {
      const [w, h] = outputResolution.split('x').map(Number);
      if (w > 0 && h > 0) {
        if (method === 'volcengine-jimeng') {
          jimengSize = w * h;
          if (jimengSize <= 1048576) resolutionLabel = '1K';
          else if (jimengSize <= 4194304) resolutionLabel = '2K';
          else resolutionLabel = '4K';
        } else {
          aliyunSize = `${w}*${h}`;
          resolutionLabel = aliyunSize;
        }
      }
    } else if (outputResolution === 'original') {
      resolutionLabel = '原图';
    } else if (plan.resolution && method !== 'volcengine-jimeng') {
      aliyunSize = plan.resolution.replace('x', '*');
    }

    // 依据选填图动态构建完整输入指令（同时用于任务展示）
    const fullPrompt = buildReplicatePrompt({
      hasModel: !!modelImagePath,
      hasPose: !!poseImagePath,
      hasGarment: !!garmentImagePath,
      scenePrompt: body.scenePrompt || undefined,
    });

    const task = createTask({
      type: 'replicate',
      provider: method === 'volcengine-jimeng' ? 'volcengine' : 'aliyun',
      params: {
        // 参考图（爆款图）作为第一张输入图
        referenceImagePath: body.referenceImagePath,
        // 选填图：按 模特 → 姿势 → 服装 的顺序追加为图2、图3、图4
        modelImagePath,
        poseImagePath,
        garmentImagePath,
        resolution: resolutionLabel,
        // qwen-image 输出尺寸（W*H）
        aliyunSize,
        // 即梦输出像素总数
        jimengSize,
        // 底层调用能力
        method,
        // 完整提示词（worker 直接使用，不再重复拼接）
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
