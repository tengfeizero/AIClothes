// 阿里云百炼（DashScope）图像生成客户端。
// 文档：https://help.aliyun.com/zh/model-studio/outfitanyone-api
// - 创建任务：POST /api/v1/services/aigc/image2image/image-synthesis（X-DashScope-Async: enable）
// - 查询任务：GET /api/v1/tasks/{task_id}（15~30 秒完成，结果 URL 24 小时有效）
// - 仅支持中国内地（北京）地域的 API Key；新账号有 400 张免费额度（90 天）

const API_KEY = process.env.ALIYUN_BAILIAN_API_KEY || '';
// 支持专属 API Host（百炼工作空间 sk-ws- 密钥必须走专属 host，如
// https://llm-xxx.cn-beijing.maas.aliyuncs.com），未配置时回退标准 DashScope 地址
const BASE_URL = process.env.ALIYUN_BAILIAN_BASE_URL || 'https://dashscope.aliyuncs.com';

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  if (!API_KEY) {
    throw new Error('Aliyun DashScope API key not configured. Please set ALIYUN_BAILIAN_API_KEY in .env.local');
  }
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * qwen-image 多模态图生图（同步）。
 * 输入多张图片（模特图/服装图/姿势图）+ 文本指令，模型理解语义后输出换装结果。
 * 返回图片引用：可能为公网 URL（http/https）或 base64（data:image/...），调用方需兼容。
 */
export async function generateQwenImage(req: {
  /** 输入图片 URL 列表（如 [模特图, 服装图, 姿势图?]），顺序即图1、图2… */
  images: string[];
  /** 换衣/编辑指令（文本） */
  prompt: string;
  /** 输出尺寸，如 '1024*1536'（竖版人像） */
  size?: string;
  /** 百炼图像生成模型名（qwen-image-2.0 / qwen-image-3.0 等），默认 qwen-image-2.0 */
  model?: string;
}): Promise<string> {
  const content: Array<{ image?: string; text?: string }> = [
    ...req.images.map((url) => ({ image: url })),
    { text: req.prompt },
  ];

  try {
    const res = await fetch(`${BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        model: req.model || 'qwen-image-2.0',
        input: {
          messages: [{ role: 'user', content }],
        },
        parameters: { n: 1, size: req.size || '1024*1536' },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = (data as { code?: string }).code || res.status;
      const message = (data as { message?: string }).message || '';
      throw new Error(`qwen-image 生成失败: ${code} ${message}`.trim());
    }
    const contentList =
      (data as { output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> } })
        ?.output?.choices?.[0]?.message?.content || [];
    const image = contentList.find((c) => c.image)?.image;
    if (!image) {
      throw new Error('qwen-image 未返回图片');
    }
    return image;
  } catch (error) {
    throw new Error(`qwen-image 生成失败: ${toErrorMessage(error)}`);
  }
}
