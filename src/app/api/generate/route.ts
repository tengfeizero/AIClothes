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

export async function POST(request: NextRequest) {
  try {
    ensureWorkerStarted();

    const body = (await request.json()) as {
      imagePaths: string[];
      prompt: string;
      planId?: string;
      outputResolution?: string;
    };

    if (!body.prompt?.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const plan = getPlanForTaskType('generate', body.planId);

    // 根据模型限制图片数量
    const maxImages = plan.maxImages || 4;
    const images = (body.imagePaths || []).slice(0, maxImages);

    // 解析分辨率：即梦用像素总数 size，阿里云用 "W*H" 字符串
    let jimengSize: number | undefined;
    let aliyunSize: string | undefined;
    let resolutionLabel = plan.resolution;
    if (body.outputResolution && body.outputResolution !== 'original') {
      const [w, h] = body.outputResolution.split('x').map(Number);
      if (w > 0 && h > 0) {
        if (plan.method === 'volcengine-jimeng') {
          jimengSize = w * h;
          if (jimengSize <= 1048576) resolutionLabel = '1K';
          else if (jimengSize <= 4194304) resolutionLabel = '2K';
          else resolutionLabel = '4K';
        } else if (plan.method === 'aliyun-qwen-image') {
          aliyunSize = `${w}*${h}`;
          resolutionLabel = aliyunSize;
        }
      }
    } else if (body.outputResolution === 'original') {
      resolutionLabel = '原图';
    }

    // 厂商标识：火山引擎=volcengine，阿里云百炼=aliyun，腾讯（MPS/混元）=tencent
    const providerMap: Record<string, string> = {
      '火山引擎': 'volcengine',
      '阿里云百炼': 'aliyun',
      '腾讯云 MPS': 'tencent',
      '腾讯混元生图': 'tencent',
    };

    const task = createTask({
      type: 'generate',
      provider: providerMap[plan.provider] || 'aliyun',
      params: {
        imagePaths: images,
        prompt: body.prompt.trim(),
        method: plan.method || 'volcengine-jimeng',
        fullPrompt: body.prompt.trim(),
        jimengSize,
        aliyunSize,
        resolution: resolutionLabel,
        planId: plan.id,
        providerName: plan.provider,
        model: plan.model,
        price: plan.price,
        calls: plan.calls,
      },
    });

    return NextResponse.json({ taskId: task.id });
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create generate task' },
      { status: 500 }
    );
  }
}
