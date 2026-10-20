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
      garmentImagePath: string;
      prompt: string;
      scale?: number;
      seed?: number;
      planId?: string;
    };

    if (!body.garmentImagePath) {
      return NextResponse.json({ error: 'garmentImagePath is required' }, { status: 400 });
    }

    if (!body.prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const plan = getPlanForTaskType('edit', body.planId);

    const task = createTask({
      type: 'edit',
      provider: 'volcengine',
      params: {
        garmentImagePath: body.garmentImagePath,
        backgroundPrompt: body.prompt,
        method: plan.method || 'volcengine-seedit',
        fullPrompt: body.prompt,
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
