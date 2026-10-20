import { NextRequest, NextResponse } from 'next/server';
import { listImageGenerations } from '@/lib/db/image-generation-store';

export const dynamic = 'force-dynamic';

/** 生成历史记录列表（AI 换装 / 爆款复刻 / 商品套图），?type=tryon|replicate|suite 过滤 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type') as 'tryon' | 'replicate' | 'suite' | null;
  const records = listImageGenerations(type || undefined);
  return NextResponse.json({ records });
}
