// Task types
export type TaskType = 'tryon' | 'replicate' | 'multi_view' | 'outfit_batch' | 'outfit_suite' | 'model3d' | 'edit' | 'generate';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TaskRecord {
  id: string;
  type: TaskType;
  status: TaskStatus;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  progress: number;
  provider_task_id: string | null;
  provider: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

// Garment types
export type GarmentCategory = 'top' | 'bottom' | 'dress' | 'accessories' | 'shoes';

export interface Garment {
  id: string;
  name: string;
  category: GarmentCategory;
  image_path: string;
  color: string | null;
  tags: string[];
  created_at: number;
}

// Model types
export interface Model {
  id: string;
  name: string;
  avatar_path: string | null;
  identity_image_path: string;
  gender: string;
  is_default: boolean;
  created_at: number;
  updated_at: number;
}

// Outfit types
export type OutfitStatus = 'draft' | 'generating' | 'completed' | 'failed';

export interface Outfit {
  id: string;
  name: string;
  description: string | null;
  model_id: string | null;
  scene_prompt: string | null;
  front_image_path: string | null;
  side_image_path: string | null;
  back_image_path: string | null;
  item_list_image_path: string | null;
  /** AI 商品套图结果 URL 数组 */
  suite_image_paths: string[];
  status: OutfitStatus;
  created_at: number;
  updated_at: number;
}

export interface OutfitWithGarments extends Outfit {
  garments: Garment[];
}

// 穿搭方案生成记录（每次生成永久保留，含厂商/模型/费用）
export type GenerationType = 'tryon' | 'suite';

export interface GenerationRecord {
  id: string;
  outfit_id: string;
  type: GenerationType;
  /** 模型厂商，如 腾讯云 MPS */
  provider: string;
  /** 模型版本号，如 WAND-tryon-1.0-flash */
  model: string;
  /** 每次调用单价（元） */
  price: number;
  /** 每套调用次数 */
  calls: number;
  /** 总费用 = price * calls */
  total_cost: number;
  /** tryon：按 [正面, 侧面, 背面] 顺序；suite：海报图数组 */
  images: string[];
  status: 'completed' | 'failed';
  task_id: string | null;
  created_at: number;
}

// 生成方案使用的底层 AI 能力（决定 worker 调用哪个厂商接口）
export type GenerationMethod =
  | 'mps-tryon' // 腾讯云 MPS AI 换装（WAND-tryon，支持姿势/背景等参考图）
  | 'hunyuan-change-clothes' // 腾讯混元生图 模特换装（ChangeClothes，仅换装，无姿势/背景控制）
  | 'hunyuan-img2img' // 腾讯混元生图 图生图（ImageToImage，图像风格化/复刻）
  | 'aliyun-qwen-image' // 阿里云百炼 qwen-image-2.0（多模态图生图，支持指令控制视角）
  | 'tencent-hunyuan-3d' // 腾讯混元生3D（专业版，图生3D/多视角生3D，异步任务输出 GLB）
  | 'volcengine-jimeng' // 火山引擎即梦 Seedream 4.6（图生图，人像写真/穿搭生成，异步任务）
  | 'volcengine-seedit'; // 火山引擎 SeedEdit 3.0（指令编辑，文本驱动图像编辑，异步任务）

// 生成方案（厂商 / 模型 / 价格），后端提供列表供前端选择
export interface ResolutionOption {
  label: string;
  width: number;
  height: number;
}

export interface GenerationPlan {
  id: string;
  name: string;
  provider: string;
  model: string;
  /** 生成的业务类型：outfit_batch（三视角试衣）/ outfit_suite（套图）/ tryon（单图换装）/ replicate（爆款复刻） */
  taskType: TaskType;
  /** 底层调用能力，缺省视为 mps-tryon */
  method?: GenerationMethod;
  price: number;
  calls: number;
  imagesPerCall: number;
  totalCost: number;
  resolution?: string;
  /** 该模型支持的输出分辨率选项 */
  resolutionOptions?: ResolutionOption[];
  /** 该模型支持的最大参考图数量（自由生图用） */
  maxImages?: number;
}

// AI 换装 / 爆款复刻 / 商品套图 / 3D 模型生成 的记录（单图任务历史，永久保留）
export interface ImageGenerationRecord {
  id: string;
  task_type: 'tryon' | 'replicate' | 'suite' | 'model3d' | 'generate';
  provider: string;
  model: string;
  price: number;
  calls: number;
  total_cost: number;
  images: string[];
  status: 'completed' | 'failed';
  task_id: string | null;
  created_at: number;
}

// Outfit batch generate params
export interface OutfitBatchParams {
  outfitId: string;
  garmentImagePaths: string[];
  modelId?: string;
  modelImagePath?: string;
  scenePrompt?: string;
  views: ('front' | 'side' | 'back')[];
  quality?: 'lite' | 'flash' | 'pro';
  resolution?: '1K' | '2K' | '4K';
}

// AI 商品套图任务参数
export interface OutfitSuiteParams {
  outfitId: string;
  /** 商品套图输入：单品图 URL 列表（多件时由 worker 拼图后上传 COS） */
  garmentImagePaths: string[];
  scenePrompt?: string;
  panelRatio?: string;
  panelResolution?: string;
}

// Tryon API types
export interface TryonParams {
  garmentImagePath: string;
  modelImagePath?: string;
  modelId?: string;
  backgroundPrompt?: string;
  poseImagePath?: string;
  view?: 'front' | 'side' | 'back';
  /** 混元生图 模特换装 需要的服装类型（Upper-body / Lower-body / Dress） */
  clothesType?: 'Upper-body' | 'Lower-body' | 'Dress';
}

export interface ReplicateParams {
  referenceImagePath: string;
  garmentImagePath: string;
  modelId?: string;
  modelImagePath?: string;
  scenePrompt?: string;
}

// 腾讯混元生3D 任务参数（图生3D / 多视角生3D）
export interface Model3DParams {
  /** 输入图片 URL 列表（多视角：front/left/right/back 等 2~7 张；单张则只传一张） */
  imageUrls: string[];
  /** 混元生3D 模型版本 3.0 / 3.1 */
  model?: string;
  /** 输出格式，默认 GLB */
  resultFormat?: string;
  enablePbr?: boolean;
}

// AI Provider types
export interface TryonRequest {
  garmentUrl: string;
  modelUrl?: string;
  identityUrl?: string;
  poseUrl?: string;
  backgroundUrl?: string;
  prompt?: string;
  quality?: 'lite' | 'flash' | 'pro';
  resolution?: '1k' | '2k' | '4k';
}

export interface TryonResponse {
  taskId: string;
  provider: string;
}

export interface TryonResult {
  images: string[];
  status: 'processing' | 'success' | 'failed';
  error?: string;
}

// Upload types
export type UploadType = 'garment' | 'model' | 'pose' | 'background';

export interface UploadResult {
  id: string;
  path: string;
  url: string;
  filename: string;
}
