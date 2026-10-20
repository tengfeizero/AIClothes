// @ts-ignore - tencentcloud-sdk-nodejs is CommonJS
import tencentcloud = require('tencentcloud-sdk-nodejs');

const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const REGION = process.env.TENCENT_MPS_REGION || 'ap-guangzhou';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Ai3dClient = (tencentcloud as any).ai3d.v20250513.Client;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClient(): any {
  if (!client) {
    if (!SECRET_ID || !SECRET_KEY) {
      throw new Error('Tencent Cloud credentials not configured. Please set TENCENT_SECRET_ID and TENCENT_SECRET_KEY in .env.local');
    }
    client = new Ai3dClient({
      credential: {
        secretId: SECRET_ID,
        secretKey: SECRET_KEY,
      },
      region: REGION,
      profile: {
        httpProfile: {
          endpoint: 'ai3d.tencentcloudapi.com',
        },
      },
    });
  }
  return client;
}

export type Hunyuan3DViewType = 'left' | 'right' | 'back' | 'top' | 'bottom' | 'left_front' | 'right_front';

export interface HunyuanTo3DSubmitParams {
  /** 多视角图片（2~7 张，对应 front/left/right/back 等视角），优先于单图 */
  multiViewImages?: Array<{ viewType: Hunyuan3DViewType | 'front'; imageUrl: string }>;
  /** 单图生3D（当只有一张图时使用） */
  imageUrl?: string;
  /** 混元生3D 模型版本：3.0 / 3.1（3.1 支持八视图输入） */
  model?: '3.0' | '3.1';
  /** 输出格式，默认 GLB（浏览器可直接用 model-viewer 加载） */
  resultFormat?: 'GLB' | 'OBJ' | 'STL' | 'USDZ' | 'FBX';
  /** 是否开启 PBR 材质（物理渲染，默认 false） */
  enablePbr?: boolean;
  /** 生成任务类型：Normal（默认）/ LowPoly / Geometry（白模） */
  generateType?: 'Normal' | 'LowPoly' | 'Geometry';
}

export interface HunyuanTo3DFile {
  type: string;
  url: string;
  previewImageUrl?: string;
}

export interface HunyuanTo3DQueryResult {
  status: 'WAIT' | 'RUN' | 'FAIL' | 'DONE';
  errorCode?: string;
  errorMessage?: string;
  files: HunyuanTo3DFile[];
}

/** 提交混元生3D（专业版）任务，返回 JobId（24 小时有效） */
export async function submitHunyuanTo3DProJob(params: HunyuanTo3DSubmitParams): Promise<string> {
  const req: Record<string, unknown> = {
    Model: params.model || '3.1',
    ResultFormat: params.resultFormat || 'GLB',
    EnablePBR: params.enablePbr ?? false,
    GenerateType: params.generateType || 'Normal',
  };

  if (params.multiViewImages && params.multiViewImages.length > 0) {
    // 多视角输入：front 默认映射为 left 视角（混元按 left/right/back/top/bottom/left_front/right_front 计）
    req.MultiViewImages = params.multiViewImages.map((v) => ({
      ViewType: v.viewType === 'front' ? 'left' : v.viewType,
      ViewImageUrl: v.imageUrl,
    }));
  } else if (params.imageUrl) {
    req.ImageUrl = params.imageUrl;
  } else {
    throw new Error('Hunyuan 3D requires imageUrl or multiViewImages');
  }

  const res = await getClient().SubmitHunyuanTo3DProJob(req);
  if (!res.JobId) {
    throw new Error('Hunyuan 3D submit failed: no JobId returned');
  }
  return res.JobId;
}

/** 查询混元生3D（专业版）任务结果 */
export async function queryHunyuanTo3DProJob(jobId: string): Promise<HunyuanTo3DQueryResult> {
  const res = await getClient().QueryHunyuanTo3DProJob({ JobId: jobId });
  return {
    status: res.Status as HunyuanTo3DQueryResult['status'],
    errorCode: res.ErrorCode,
    errorMessage: res.ErrorMessage,
    files: (res.ResultFile3Ds || []).map((f: { Type?: string; Url?: string; PreviewImageUrl?: string }) => ({
      type: f.Type || '',
      url: f.Url || '',
      previewImageUrl: f.PreviewImageUrl,
    })),
  };
}
