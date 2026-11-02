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
