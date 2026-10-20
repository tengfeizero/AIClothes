// @ts-ignore - tencentcloud-sdk-nodejs is CommonJS
import tencentcloud = require('tencentcloud-sdk-nodejs');
import type { TencentTryOnRequest, TencentTryOnTaskResponse, TencentTaskDetailResponse, TencentPosterSuiteRequest } from './tencent-types';
import { getCosConfig } from '@/lib/storage/cos';

const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const REGION = process.env.TENCENT_MPS_REGION || 'ap-guangzhou';

const MpsClient = tencentcloud.mps.v20190612.Client;

let client: InstanceType<typeof MpsClient> | null = null;

function getClient(): InstanceType<typeof MpsClient> {
  if (!client) {
    if (!SECRET_ID || !SECRET_KEY) {
      throw new Error('Tencent Cloud credentials not configured. Please set TENCENT_SECRET_ID and TENCENT_SECRET_KEY in .env.local');
    }
    client = new MpsClient({
      credential: {
        secretId: SECRET_ID,
        secretKey: SECRET_KEY,
      },
      region: REGION,
      profile: {
        httpProfile: {
          endpoint: 'mps.tencentcloudapi.com',
        },
      },
    });
  }
  return client;
}

export function buildProcessImageParams(req: TencentTryOnRequest) {
  const imageSet: Array<{ Type: string; Image: { Type: string; UrlInputInfo: { Url: string } } }> = [
    {
      Type: 'garment',
      Image: {
        Type: 'URL',
        UrlInputInfo: { Url: req.garmentUrl },
      },
    },
  ];

  if (req.backgroundUrl) {
    imageSet.push({
      Type: 'background',
      Image: { Type: 'URL', UrlInputInfo: { Url: req.backgroundUrl } },
    });
  }
  if (req.identityUrl) {
    imageSet.push({
      Type: 'identity',
      Image: { Type: 'URL', UrlInputInfo: { Url: req.identityUrl } },
    });
  }
  if (req.poseUrl) {
    imageSet.push({
      Type: 'pose',
      Image: { Type: 'URL', UrlInputInfo: { Url: req.poseUrl } },
    });
  }
  if (req.accessoriesUrl) {
    imageSet.push({
      Type: 'accessories',
      Image: { Type: 'URL', UrlInputInfo: { Url: req.accessoriesUrl } },
    });
  }
  if (req.shoesUrl) {
    imageSet.push({
      Type: 'shoes',
      Image: { Type: 'URL', UrlInputInfo: { Url: req.shoesUrl } },
    });
  }

  const cosConfig = getCosConfig();

  return {
    InputInfo: {
      Type: 'URL',
      UrlInputInfo: { Url: req.modelUrl },
    },
    OutputStorage: {
      Type: 'COS',
      CosOutputStorage: {
        Bucket: cosConfig.bucket,
        Region: cosConfig.region,
      },
    },
    OutputDir: cosConfig.outputDir,
    ImageTask: {
      AiTryOnConfig: {
        Model: req.model || 'WAND-tryon-1.0-flash',
        Resolution: req.resolution || '1K',
        Prompt: req.prompt || '',
      },
    },
    AddOnParameter: {
      ImageSet: imageSet,
    },
  };
}

export async function createTryOnTask(req: TencentTryOnRequest): Promise<string> {
  const client = getClient();
  const params = buildProcessImageParams(req);
  const response = await client.ProcessImage(params);
  const result = response as unknown as TencentTryOnTaskResponse;
  return result.TaskId;
}

/**
 * 构建 AI 商品套图请求参数。
 * - 主商品图（可为整套平铺图）放在 InputInfo.Url
 * - AddOnParameter.ImageSet 附加最多 3 张商品视角图
 */
export function buildPosterSuiteImageParams(req: TencentPosterSuiteRequest) {
  const cosConfig = getCosConfig();

  const params: Record<string, unknown> = {
    InputInfo: {
      Type: 'URL',
      UrlInputInfo: { Url: req.inputUrl },
    },
    OutputStorage: {
      Type: 'COS',
      CosOutputStorage: {
        Bucket: cosConfig.bucket,
        Region: cosConfig.region,
      },
    },
    OutputDir: cosConfig.outputDir,
    ImageTask: {
      AiPosterSuiteConfig: {
        Mode: 'auto',
        Definition: req.definition ?? 50,
        Recipe: [
          { Theme: 'hero', Num: 1 },
          { Theme: 'detail', Num: 1 },
          { Theme: 'selling', Num: 1 },
          { Theme: 'atmosphere', Num: 1 },
        ],
        Language: 'zh-CN',
        PanelRatio: req.panelRatio || '3:4',
        PanelResolution: req.panelResolution || '2K',
        Model: 'WAND-suite-1.0-flash',
      },
    },
  };

  // 附加商品视角图（最多 3 张），帮助 AI 更准确还原商品细节
  const extraUrls = (req.extraImageUrls || []).slice(0, 3);
  if (extraUrls.length > 0) {
    params.AddOnParameter = {
      ImageSet: extraUrls.map((url) => ({
        Image: { Type: 'URL', UrlInputInfo: { Url: url } },
      })),
    };
  }

  return params;
}

export async function createPosterSuiteTask(req: TencentPosterSuiteRequest): Promise<string> {
  const client = getClient();
  const params = buildPosterSuiteImageParams(req);
  const response = await client.ProcessImage(params);
  const result = response as unknown as TencentTryOnTaskResponse;
  return result.TaskId;
}

export async function queryTaskResult(taskId: string): Promise<TencentTaskDetailResponse> {
  const client = getClient();
  const response = await client.DescribeImageTaskDetail({ TaskId: taskId });
  return response as unknown as TencentTaskDetailResponse;
}
