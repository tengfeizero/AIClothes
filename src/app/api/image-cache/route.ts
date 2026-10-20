import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(process.cwd(), 'public', 'uploads', 'cache');

function getExtFromUrl(url: string): string {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith('.png')) return '.png';
  if (pathname.endsWith('.webp')) return '.webp';
  if (pathname.endsWith('.gif')) return '.gif';
  if (pathname.endsWith('.bmp')) return '.bmp';
  return '.jpg';
}

function getMime(ext: string): string {
  switch (ext) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    case '.bmp': return 'image/bmp';
    default: return 'image/jpeg';
  }
}

function hashUrl(url: string): string {
  return createHash('md5').update(url).digest('hex');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return new Response('url is required', { status: 400 });
    }

    // 非 http/https 直接 302
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return Response.redirect(url, 302);
    }

    // 确保缓存目录存在
    if (!existsSync(CACHE_DIR)) {
      await mkdir(CACHE_DIR, { recursive: true });
    }

    const ext = getExtFromUrl(url);
    const filename = `${hashUrl(url)}${ext}`;
    const filePath = path.join(CACHE_DIR, filename);

    // 本地缓存已存在，直接返回文件
    if (existsSync(filePath)) {
      const buffer = await readFile(filePath);
      return new Response(buffer, {
        headers: {
          'Content-Type': getMime(ext),
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // 下载并缓存
    const res = await fetch(url, {
      headers: { 'User-Agent': 'AIClothes-ImageCache/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return new Response(`Failed to fetch: ${res.status}`, { status: 502 });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    await writeFile(filePath, buffer);

    return new Response(buffer, {
      headers: {
        'Content-Type': getMime(ext),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Image cache error:', error);
    return new Response(
      error instanceof Error ? error.message : 'Cache failed',
      { status: 500 }
    );
  }
}
