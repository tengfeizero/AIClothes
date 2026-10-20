export interface TencentTryOnRequest {
  modelUrl: string;
  garmentUrl: string;
  backgroundUrl?: string;
  identityUrl?: string;
  poseUrl?: string;
  accessoriesUrl?: string;
  shoesUrl?: string;
  prompt?: string;
  model?: 'WAND-tryon-1.0-lite' | 'WAND-tryon-1.0-flash' | 'WAND-tryon-1.0-pro';
  resolution?: '1K' | '2K' | '4K';
}

export interface TencentTryOnTaskResponse {
  TaskId: string;
  RequestId: string;
}

/**
 * AI 商品套图（AiPosterSuiteConfig）请求参数。
 * 文档：https://cloud.tencent.com/document/product/862/106003
 */
export interface TencentPosterSuiteRequest {
  /** 商品主图 URL（必填，公网可访问） */
  inputUrl: string;
  /** 附加商品视角图 URL（最多 3 张） */
  extraImageUrls?: string[];
  /** 面板比例：'1:1' | '3:4' | '4:3' | '9:16' | '16:9' */
  panelRatio?: string;
  /** 面板分辨率：'2K' | '4K' */
  panelResolution?: string;
  /** 定义程度 1-100，50 为淘宝风格 */
  definition?: number;
}

export interface TencentTaskDetailResponse {
  Status: 'WAITING' | 'PROCESSING' | 'FINISH' | 'FAILED';
  ErrMsg?: string;
  Message?: string;
  ImageProcessTaskResultSet?: Array<{
    Status: string;
    ErrMsg?: string;
    Output?: {
      Path?: string;
      SignedUrl?: string;
      OutputStorage?: {
        Type: string;
        CosOutputStorage?: {
          Region: string;
          Bucket: string;
        };
      };
    };
  }>;
  RequestId: string;
}
