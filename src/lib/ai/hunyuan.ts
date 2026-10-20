// 腾讯混元生图（aiart）同步接口客户端。
// 文档：https://cloud.tencent.com/document/product/1668/88046
// - 模特换装：ChangeClothes（同步，返回 ResultImage）
// - 图像风格化（图生图）：ImageToImage（同步，返回 ResultImage）
// @ts-ignore - tencentcloud-sdk-nodejs is CommonJS
import tencentcloud = require('tencentcloud-sdk-nodejs');

const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const REGION = process.env.TENCENT_MPS_REGION || 'ap-guangzhou';

const AiartClient = tencentcloud.aiart.v20221229.Client;

let client: InstanceType<typeof AiartClient> | null = null;

function getClient(): InstanceType<typeof AiartClient> {
  if (!client) {
    if (!SECRET_ID || !SECRET_KEY) {
      throw new Error('Tencent Cloud credentials not configured. Please set TENCENT_SECRET_ID and TENCENT_SECRET_KEY in .env.local');
    }
    client = new AiartClient({
      credential: {
        secretId: SECRET_ID,
        secretKey: SECRET_KEY,
      },
      region: REGION,
      profile: {
        httpProfile: {
          endpoint: 'aiart.tencentcloudapi.com',
        },
      },
    });
  }
  return client;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const e = error as Error & { code?: string };
    return e.code ? `${e.code}: ${e.message}` : e.message;
  }
  return String(error);
}

export interface HunyuanChangeClothesRequest {
  /** 模特图 URL（建议正面全身/半身照，3:4 更佳） */
  modelUrl: string;
  /** 服装平铺图 URL（仅含 1 个服装主体） */
  clothesUrl: string;
  /** 服装类型：上衣 / 下装 / 连衣裙 */
  clothesType: 'Upper-body' | 'Lower-body' | 'Dress';
  /** 是否添加 AI 生成标识，默认 0（不加） */
  logoAdd?: number;
}

/** 模特换装（同步），返回结果图 URL（1 小时有效） */
export async function changeClothes(req: HunyuanChangeClothesRequest): Promise<string> {
  try {
    const response = await getClient().ChangeClothes({
      ModelUrl: req.modelUrl,
      ClothesUrl: req.clothesUrl,
      ClothesType: req.clothesType,
      LogoAdd: req.logoAdd ?? 0,
      RspImgType: 'url',
    });
    const result = response as unknown as { ResultImage?: string };
    if (!result.ResultImage) {
      throw new Error('混元模特换装返回为空');
    }
    return result.ResultImage;
  } catch (error) {
    throw new Error(`混元模特换装失败: ${toErrorMessage(error)}`);
  }
}

export interface HunyuanImageToImageRequest {
  /** 输入图 URL（图片 + prompt 引导生成） */
  inputUrl: string;
  prompt: string;
  negativePrompt?: string;
  /** 生成自由度 0-1，越小越贴近原图，推荐 0.6-0.8 */
  strength?: number;
  /** 是否添加 AI 生成标识，默认 0（不加） */
  logoAdd?: number;
}

/** 图像风格化（图生图，同步），返回结果图 URL（1 小时有效） */
export async function imageToImage(req: HunyuanImageToImageRequest): Promise<string> {
  try {
    const params: Record<string, unknown> = {
      InputUrl: req.inputUrl,
      Prompt: req.prompt,
      LogoAdd: req.logoAdd ?? 0,
      RspImgType: 'url',
    };
    if (req.negativePrompt) params.NegativePrompt = req.negativePrompt;
    if (req.strength !== undefined) params.Strength = req.strength;

    const response = await getClient().ImageToImage(params);
    const result = response as unknown as { ResultImage?: string };
    if (!result.ResultImage) {
      throw new Error('混元图生图返回为空');
    }
    return result.ResultImage;
  } catch (error) {
    throw new Error(`混元图生图失败: ${toErrorMessage(error)}`);
  }
}
