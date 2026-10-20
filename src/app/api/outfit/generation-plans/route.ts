import { NextRequest, NextResponse } from 'next/server';
import { listGenerationPlans } from '@/lib/ai/generation-plans';

export const dynamic = 'force-dynamic';

/**
 * 返回可用的生成方案列表（厂商 / 模型 / 价格），供生成时选择。
 * ?purpose=outfit|tryon|replicate 可按业务类型过滤
 */
export async function GET(request: NextRequest) {
  const purpose = request.nextUrl.searchParams.get('purpose') || undefined;
  return NextResponse.json({ plans: listGenerationPlans(purpose) });
}
