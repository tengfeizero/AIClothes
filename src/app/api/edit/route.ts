import { NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/queue/task-store';
import { startWorker } from '@/lib/queue';
import { getPlanForTaskType } from '@/lib/ai/generation-plans';
import { saveUploadedFile } from '@/lib/storage/cos';
import sharp from 'sharp';

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

    const body = (await request.json()) as {
      garmentImagePath: string;
      prompt: string;
      scale?: number;
      seed?: number;
      planId?: string;
      /** 涂抹区域：相对原图的归一化比例（0~1），不传则整图编辑 */
      region?: { x: number; y: number; width: number; height: number };
      /** 涂抹掩膜：与原图同尺寸的黑白 PNG data URL，白色代表要修改的区域 */
      maskDataUrl?: string;
    };

    if (!body.garmentImagePath) {
      return NextResponse.json({ error: 'garmentImagePath is required' }, { status: 400 });
    }

    if (!body.prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    if (body.region) {
      const { x, y, width, height } = body.region;
      const valid =
        [x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) &&
        width > 0.01 &&
        height > 0.01;
      if (!valid) {
        return NextResponse.json({ error: 'region is invalid' }, { status: 400 });
      }
    }

    if (body.maskDataUrl && !body.region) {
      return NextResponse.json({ error: 'maskDataUrl requires region' }, { status: 400 });
    }

    // 涂抹掩膜：解码校验后转存为可访问的图片，任务参数只保留 URL
    let maskUrl: string | undefined;
    if (body.maskDataUrl) {
      if (!body.maskDataUrl.startsWith('data:image/png;base64,')) {
        return NextResponse.json({ error: 'maskDataUrl must be a PNG data URL' }, { status: 400 });
      }
      const buffer = Buffer.from(body.maskDataUrl.split(',')[1] || '', 'base64');
      if (buffer.length === 0 || buffer.length > 6 * 1024 * 1024) {
        return NextResponse.json({ error: 'maskDataUrl is invalid' }, { status: 400 });
      }
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) {
        return NextResponse.json({ error: 'maskDataUrl is invalid' }, { status: 400 });
      }
      const saved = await saveUploadedFile({
        type: 'pose',
        filename: 'edit-mask.png',
        buffer,
        contentType: 'image/png',
      });
      maskUrl = saved.url;
    }

    const plan = getPlanForTaskType('edit', body.planId);
    const method = plan.method || 'volcengine-seedit';

    const task = createTask({
      type: 'edit',
      provider: method === 'aliyun-qwen-image' ? 'aliyun' : 'volcengine',
      params: {
        garmentImagePath: body.garmentImagePath,
        backgroundPrompt: body.prompt,
        method,
        fullPrompt: body.prompt,
        region: body.region,
        maskUrl,
        planId: plan.id,
        providerName: plan.provider,
        model: plan.model,
        price: plan.price,
        calls: plan.calls,
      },
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error) {
    console.error('Edit error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create edit task' },
      { status: 500 }
    );
  }
}
