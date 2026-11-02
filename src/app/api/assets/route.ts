import { NextRequest, NextResponse } from 'next/server';
import {
  deleteMaterial,
  isMaterialType,
  listMaterials,
  syncMaterial,
  upsertAssetMetadata,
} from '@/lib/storage/assets';

export const runtime = 'nodejs';

/** 素材列表（默认为本地文件，可按类型筛选） */
export async function GET(request: NextRequest) {
  try {
    const typeParam = request.nextUrl.searchParams.get('type');
    const materials = await listMaterials(isMaterialType(typeParam) ? typeParam : undefined);
    return NextResponse.json({ materials });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '读取素材失败' },
      { status: 500 }
    );
  }
}

/** 删除素材（本地 + 对象存储） */
export async function DELETE(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type');
    const filename = request.nextUrl.searchParams.get('filename');
    if (!isMaterialType(type) || !filename) {
      return NextResponse.json({ error: '缺少参数 type 或 filename' }, { status: 400 });
    }

    await deleteMaterial(type, filename);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败';
    const status = message.includes('无法删除') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** 同步素材到对象存储 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const type = body.type as string | undefined;
    const filename = body.filename as string | undefined;
    if (!isMaterialType(type) || !filename) {
      return NextResponse.json({ error: '缺少参数 type 或 filename' }, { status: 400 });
    }

    // 素材中心上传单品后写入元数据（名称 / 子类 / 来源）
    if (body.action === 'metadata') {
      upsertAssetMetadata({
        type,
        filename,
        title: typeof body.title === 'string' ? body.title : undefined,
        category: typeof body.category === 'string' ? body.category : undefined,
        source: typeof body.source === 'string' ? body.source : undefined,
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
      });
      return NextResponse.json({ success: true });
    }

    const url = await syncMaterial(type, filename);
    return NextResponse.json({ success: true, url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '同步失败' },
      { status: 500 }
    );
  }
}
