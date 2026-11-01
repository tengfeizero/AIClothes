/**
 * 将服装图库 / 姿势图库的 catalog.json 全量导入素材中心。
 *
 * - 服装：uploads/garment/<id>.webp（优先用本地已抓取文件，缺失时下载 url_img）
 * - 姿势：uploads/pose/<id>.png（优先用本地已抓取文件，缺失时下载 url_full）
 * - 元数据写入 asset_metadata（标题 / 分类 / 关键词 / 来源 / 原图外链）
 *
 * 用法：node scripts/import-gallery.cjs [--only=costume|pose] [--concurrency=6]
 * 支持断点续传：已存在的文件会跳过下载，元数据按主键覆盖写入。
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const ROOT = process.cwd();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'public', 'uploads');
const DB_PATH = path.join(ROOT, 'data', 'aiclothes.db');

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const concArg = args.find((a) => a.startsWith('--concurrency='));
const poseQualityArg = args.find((a) => a.startsWith('--pose-quality='));
const ONLY = onlyArg ? onlyArg.split('=')[1] : 'all';
const CONCURRENCY = concArg ? Math.max(1, parseInt(concArg.split('=')[1], 10) || 6) : 6;
/** 姿势图库入库清晰度：thumb=缩略图（约 12KB/张，默认），full=原图（约 500KB/张） */
const POSE_QUALITY = poseQualityArg ? poseQualityArg.split('=')[1] : 'thumb';
const POSE_EXT = POSE_QUALITY === 'full' ? '.png' : '.jpg';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isValidImage(buf, ext) {
  if (ext === '.jpg' || ext === '.jpeg') {
    return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (ext === '.png') {
    return buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (ext === '.webp') {
    return (
      buf.length > 12 &&
      buf.toString('ascii', 0, 4) === 'RIFF' &&
      buf.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return buf.length > 0;
}

async function download(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchWithRetry(url, ext, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const buf = await download(url);
      if (!isValidImage(buf, ext)) throw new Error('返回内容不是有效图片（可能被 SPA fallback 拦截）');
      return buf;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 定义两套图库的字段映射 */
function buildCostumeJobs() {
  const catalog = readJson(path.join(ROOT, 'clone-ai-costume-gallery', 'data', 'catalog.json'));
  const dataDir = path.join(ROOT, 'clone-ai-costume-gallery', 'data');
  return (catalog.items || []).map((item) => {
    const rel = item['画像'] || `img/${item.id}.webp`;
    const ext = path.extname(rel) || '.webp';
    return {
      type: 'garment',
      filename: `${item.id}${ext}`,
      localFile: path.join(dataDir, rel),
      remoteUrlForFile: item.url_img,
      meta: {
        title: item['キーワード'] || item.id,
        category: item['カテゴリ'] || null,
        tags: (item['キーワード'] || '').split(/\s+/).filter(Boolean),
        source: '服装图库',
        remote_url: item.url_png || item.url_img || null,
      },
    };
  });
}

function buildPoseJobs() {
  const catalog = readJson(path.join(ROOT, 'clone-ai-pose-gallery', 'data', 'catalog.json'));
  const dataDir = path.join(ROOT, 'clone-ai-pose-gallery', 'data');
  return (catalog.items || []).map((item) => {
    const rel =
      POSE_QUALITY === 'full'
        ? item['原寸'] || `img/${item.id}.png`
        : item['サムネ'] || `thumbs/${item.id}.jpg`;
    const ext = path.extname(rel) || POSE_EXT;
    return {
      type: 'pose',
      filename: `${item.id}${ext}`,
      // 已按另一档清晰度导入过的同 id 文件，跳过避免重复入库
      skipIfFile: path.join(UPLOAD_DIR, 'pose', `${item.id}${POSE_QUALITY === 'full' ? '.jpg' : '.png'}`),
      localFile: path.join(dataDir, rel),
      remoteUrlForFile: POSE_QUALITY === 'full' ? item.url_full : item.url_thumbs,
      meta: {
        title: `${item['ポーズ名'] || item.id}（${item['アングル'] || ''}）`,
        category: item['分類'] || null,
        tags: [item['系統'], item['分類'], item['アングル']].filter(Boolean),
        source: '姿势图库',
        remote_url: item.url_full || null,
      },
    };
  });
}

async function runJob(job, stats) {
  const targetDir = path.join(UPLOAD_DIR, job.type);
  const targetFile = path.join(targetDir, job.filename);
  const ext = path.extname(job.filename).toLowerCase();

  if (job.skipIfFile && fs.existsSync(job.skipIfFile) && !fs.existsSync(targetFile)) {
    stats.existing += 1;
    stats.imported += 1;
    return;
  }

  const exists = fs.existsSync(targetFile) && fs.statSync(targetFile).size > 0;
  if (!exists) {
    let buf = null;
    // 1) 优先使用本地已抓取的原文件
    if (fs.existsSync(job.localFile)) {
      const localBuf = fs.readFileSync(job.localFile);
      if (isValidImage(localBuf, ext)) buf = localBuf;
    }
    // 2) 本地缺失则从图库下载
    if (!buf && job.remoteUrlForFile) {
      buf = await fetchWithRetry(job.remoteUrlForFile, ext);
    }
    if (!buf) throw new Error('本地与外链均无可用图片');
    ensureDir(targetDir);
    fs.writeFileSync(targetFile, buf);
    stats.downloaded += 1;
  } else {
    stats.existing += 1;
  }

  const stat = fs.statSync(targetFile);
  stats.metaUpsert.run(
    job.type,
    job.filename,
    job.meta.title,
    job.meta.category,
    JSON.stringify(job.meta.tags),
    job.meta.source,
    job.meta.remote_url,
    Math.round(stat.mtimeMs)
  );
  stats.imported += 1;
}

async function main() {
  ensureDir(UPLOAD_DIR);
  ensureDir(path.join(ROOT, 'data'));

  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS asset_metadata (
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      title TEXT,
      category TEXT,
      tags TEXT DEFAULT '[]',
      source TEXT,
      remote_url TEXT,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (type, filename)
    );
  `);

  const jobs = [];
  if (ONLY === 'all' || ONLY === 'costume') jobs.push(...buildCostumeJobs());
  if (ONLY === 'all' || ONLY === 'pose') jobs.push(...buildPoseJobs());

  const stats = {
    imported: 0,
    downloaded: 0,
    existing: 0,
    failed: 0,
    failures: [],
    metaUpsert: db.prepare(`
      INSERT INTO asset_metadata (type, filename, title, category, tags, source, remote_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(type, filename) DO UPDATE SET
        title = excluded.title,
        category = excluded.category,
        tags = excluded.tags,
        source = excluded.source,
        remote_url = excluded.remote_url
    `),
  };

  console.log(
    `[import] 共 ${jobs.length} 条，并发 ${CONCURRENCY}，UPLOAD_DIR=${UPLOAD_DIR}，姿势清晰度=${POSE_QUALITY}`
  );

  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < jobs.length) {
      const current = jobs[index++];
      try {
        await runJob(current, stats);
      } catch (error) {
        stats.failed += 1;
        stats.failures.push(`${current.type}/${current.filename}: ${error.message}`);
        if (stats.failures.length <= 20) {
          console.warn(`[import] 失败 ${current.type}/${current.filename}: ${error.message}`);
        }
      }
      if ((stats.imported + stats.failed) % 100 === 0) {
        console.log(
          `[import] 进度 ${stats.imported + stats.failed}/${jobs.length}，新下载 ${stats.downloaded}，已有 ${stats.existing}，失败 ${stats.failed}`
        );
      }
    }
  });

  await Promise.all(workers);

  console.log(
    `[import] 完成：导入 ${stats.imported}，新下载 ${stats.downloaded}，已存在 ${stats.existing}，失败 ${stats.failed}`
  );
  if (stats.failures.length) {
    console.log('[import] 失败列表（前 20）：');
    stats.failures.forEach((line) => console.log('  -', line));
  }
  db.close();
}

main().catch((error) => {
  console.error('[import] 异常退出:', error);
  process.exitCode = 1;
});
