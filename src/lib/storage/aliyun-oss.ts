import OSS from 'ali-oss';

const ACCESS_KEY_ID = process.env.ALIYUN_OSS_ACCESS_KEY_ID || '';
const ACCESS_KEY_SECRET = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || '';
const BUCKET = process.env.ALIYUN_OSS_BUCKET || '';
const REGION = process.env.ALIYUN_OSS_REGION || 'oss-cn-hangzhou';
const PUBLIC_URL = process.env.ALIYUN_OSS_PUBLIC_URL || '';

let client: OSS | null = null;

function getClient(): OSS {
  if (!client) {
    if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET || !BUCKET) {
      throw new Error(
        'Aliyun OSS not configured. Please set ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET in .env.local'
      );
    }
    client = new OSS({
      region: REGION,
      accessKeyId: ACCESS_KEY_ID,
      accessKeySecret: ACCESS_KEY_SECRET,
      bucket: BUCKET,
      secure: true,
    });
  }
  return client;
}

/**
 * 上传文件到阿里云 OSS，返回公网访问 URL。
 * 注意：OSS 的读权限由 Bucket 的 ACL 决定，需在控制台将 Bucket 设为"公共读"，
 * 否则 AI 厂商无法通过该 URL 拉取图片。
 */
export async function putObjectToAliyunOss(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const oss = getClient();
  await oss.put(key, buffer, {
    headers: {
      'Content-Type': contentType,
    },
    mime: contentType,
  });

  return getAliyunOssPublicUrl(key);
}

/** 根据对象键生成 OSS 公网访问地址 */
export function getAliyunOssPublicUrl(key: string): string {
  if (PUBLIC_URL) {
    return `${PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
  return `https://${BUCKET}.${REGION}.aliyuncs.com/${key}`;
}

export function isAliyunOssConfigured(): boolean {
  return Boolean(ACCESS_KEY_ID && ACCESS_KEY_SECRET && BUCKET);
}

/** 列出指定前缀下的对象 key 列表 */
export async function listAliyunOssObjects(prefix: string): Promise<string[]> {
  const oss = getClient();
  const result = (await oss.list({ prefix, 'max-keys': 1000 }, {})) as {
    objects?: Array<{ name: string }>;
  };
  return (result.objects || []).map((o) => o.name);
}

/** 删除指定 key 的对象（key 不存在时视为成功） */
export async function deleteAliyunOssObject(key: string): Promise<void> {
  await getClient().delete(key);
}
