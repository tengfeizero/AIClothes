import type { GenerationPlan, TaskType } from '@/types';

// ── 各模型支持的分辨率选项 ──

/** 阿里云 qwen-image 系列官方支持的分辨率（1:1 / 2:3 / 3:2 / 3:4 / 4:3 / 9:16 / 16:9 / 21:9） */
export const ALIYUN_QWEN_RESOLUTIONS = [
  // 1:1
  { label: '1024×1024 (1:1)', width: 1024, height: 1024 },
  { label: '1536×1536 (1:1)', width: 1536, height: 1536 },
  // 2:3
  { label: '768×1152 (2:3)', width: 768, height: 1152 },
  { label: '1024×1536 (2:3)', width: 1024, height: 1536 },
  // 3:2
  { label: '1152×768 (3:2)', width: 1152, height: 768 },
  { label: '1536×1024 (3:2)', width: 1536, height: 1024 },
  // 3:4
  { label: '960×1280 (3:4)', width: 960, height: 1280 },
  { label: '1080×1440 (3:4)', width: 1080, height: 1440 },
  // 4:3
  { label: '1280×960 (4:3)', width: 1280, height: 960 },
  { label: '1440×1080 (4:3)', width: 1440, height: 1080 },
  // 9:16
  { label: '720×1280 (9:16)', width: 720, height: 1280 },
  { label: '1080×1920 (9:16)', width: 1080, height: 1920 },
  // 16:9
  { label: '1280×720 (16:9)', width: 1280, height: 720 },
  { label: '1920×1080 (16:9)', width: 1920, height: 1080 },
  // 21:9
  { label: '1344×576 (21:9)', width: 1344, height: 576 },
  { label: '2048×872 (21:9)', width: 2048, height: 872 },
];

/** 火山引擎即梦 Seedream 4.6：1K/2K/4K 多比例 */
const JIMENG_RESOLUTIONS = [
  // 1K
  { label: '1K 1024×1024 (1:1)', width: 1024, height: 1024 },
  // 2K
  { label: '2K 2048×2048 (1:1)', width: 2048, height: 2048 },
  { label: '2K 2304×1728 (4:3)', width: 2304, height: 1728 },
  { label: '2K 2496×1664 (3:2)', width: 2496, height: 1664 },
  { label: '2K 2560×1440 (16:9)', width: 2560, height: 1440 },
  { label: '2K 3024×1296 (21:9)', width: 3024, height: 1296 },
  // 4K
  { label: '4K 4096×4096 (1:1)', width: 4096, height: 4096 },
];

/** 阿里云 qwen-image 自由生图：与爆款复刻共用官方支持分辨率 */
const ALIYUN_GENERATE_RESOLUTIONS = ALIYUN_QWEN_RESOLUTIONS;

/**
 * 后端可用的生成方案（厂商 / 模型 / 每次单价 / 调用次数 / 每套总价）。
 * 新增厂商或模型时只需在此追加；前端通过 GET /api/generation-plans?purpose=xxx 获取。
 */
export const GENERATION_PLANS: GenerationPlan[] = [
  // ── 爆款复刻（仅阿里云 qwen-image）──
  {
    id: 'aliyun-replicate-qwen-image',
    name: '爆款复刻（qwen-image-2.1-turbo）',
    provider: '阿里云百炼',
    model: 'qwen-image-2.1-turbo',
    taskType: 'replicate',
    method: 'aliyun-qwen-image',
    price: 0.1,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.1,
    resolution: '1024x1536',
    resolutionOptions: ALIYUN_QWEN_RESOLUTIONS,
  },
  {
    id: 'aliyun-replicate-qwen-image-2-pro',
    name: '爆款复刻（qwen-image-2.1-pro）',
    provider: '阿里云百炼',
    model: 'qwen-image-2.1-pro',
    taskType: 'replicate',
    method: 'aliyun-qwen-image',
    price: 0.25,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.25,
    resolution: '1024x1536',
    resolutionOptions: ALIYUN_QWEN_RESOLUTIONS,
  },
  {
    id: 'aliyun-replicate-qwen-image-3',
    name: '爆款复刻（qwen-image-3.0）',
    provider: '阿里云百炼',
    model: 'qwen-image-3.0',
    taskType: 'replicate',
    method: 'aliyun-qwen-image',
    price: 0.18,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.18,
    resolution: '1024x1536',
    resolutionOptions: ALIYUN_QWEN_RESOLUTIONS,
  },
  {
    id: 'aliyun-replicate-qwen-image-3-pro',
    name: '爆款复刻（qwen-image-3.0-pro）',
    provider: '阿里云百炼',
    model: 'qwen-image-3.0-pro',
    taskType: 'replicate',
    method: 'aliyun-qwen-image',
    price: 0.25,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.25,
    resolution: '1024x1536',
    resolutionOptions: ALIYUN_QWEN_RESOLUTIONS,
  },
  {
    id: 'volcengine-replicate-jimeng',
    name: '爆款复刻（即梦 Seedream 4.6）',
    provider: '火山引擎',
    model: 'jimeng_seedream46_cvtob',
    taskType: 'replicate',
    method: 'volcengine-jimeng',
    price: 0.2,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.2,
    resolution: '2K',
    resolutionOptions: JIMENG_RESOLUTIONS,
  },
  // ── 3D 商品展示（图生3D）──
  {
    id: 'tencent-model3d-hunyuan',
    name: '3D 商品模型（混元生3D）',
    provider: '腾讯云 混元生3D',
    model: 'hy-3d-3.1',
    taskType: 'model3d',
    method: 'tencent-hunyuan-3d',
    price: 3.6,
    calls: 1,
    imagesPerCall: 2,
    totalCost: 3.6,
    resolution: 'GLB',
  },
  // ── AI 编辑（指令编辑）──
  {
    id: 'volcengine-seedit-v3',
    name: '指令编辑 SeedEdit 3.0',
    provider: '火山引擎',
    model: 'seededit_v3.0',
    taskType: 'edit',
    method: 'volcengine-seedit',
    price: 0.2,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.2,
    resolution: '跟随原图',
  },
  {
    id: 'aliyun-qwen-edit-2-pro',
    name: '局部重绘（Qwen Image 2.1 Pro）',
    provider: '阿里云百炼',
    model: 'qwen-image-2.1-pro',
    taskType: 'edit',
    method: 'aliyun-qwen-image',
    price: 0.25,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.25,
    resolution: '跟随原图',
  },
  // ── 自由生图（多图参考 + 提示词）──
  {
    id: 'aliyun-qwen-free',
    name: '通义万相自由生图（Qwen Image 2.1 Turbo）',
    provider: '阿里云百炼',
    model: 'qwen-image-2.1-turbo',
    taskType: 'generate',
    method: 'aliyun-qwen-image',
    price: 0.1,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.1,
    resolution: '1024x1024',
    maxImages: 4,
    resolutionOptions: ALIYUN_GENERATE_RESOLUTIONS,
  },
  {
    id: 'aliyun-qwen-free-2-pro',
    name: '通义万相自由生图（Qwen Image 2.1 Pro）',
    provider: '阿里云百炼',
    model: 'qwen-image-2.1-pro',
    taskType: 'generate',
    method: 'aliyun-qwen-image',
    price: 0.25,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.25,
    resolution: '1024x1024',
    maxImages: 4,
    resolutionOptions: ALIYUN_GENERATE_RESOLUTIONS,
  },
  {
    id: 'aliyun-qwen-free-3',
    name: '通义万相自由生图（Qwen Image 3.0）',
    provider: '阿里云百炼',
    model: 'qwen-image-3.0',
    taskType: 'generate',
    method: 'aliyun-qwen-image',
    price: 0.18,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.18,
    resolution: '1024x1024',
    maxImages: 4,
    resolutionOptions: ALIYUN_GENERATE_RESOLUTIONS,
  },
  {
    id: 'aliyun-qwen-free-3-pro',
    name: '通义万相自由生图（Qwen Image 3.0 Pro）',
    provider: '阿里云百炼',
    model: 'qwen-image-3.0-pro',
    taskType: 'generate',
    method: 'aliyun-qwen-image',
    price: 0.25,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.25,
    resolution: '1024x1024',
    maxImages: 4,
    resolutionOptions: ALIYUN_GENERATE_RESOLUTIONS,
  },
  {
    id: 'volcengine-jimeng-free',
    name: '即梦自由生图（Seedream 4.6）',
    provider: '火山引擎',
    model: 'jimeng_seedream46_cvtob',
    taskType: 'generate',
    method: 'volcengine-jimeng',
    price: 0.2,
    calls: 1,
    imagesPerCall: 1,
    totalCost: 0.2,
    resolution: '2K',
    maxImages: 14,
    resolutionOptions: JIMENG_RESOLUTIONS,
  },
];

export function listGenerationPlans(purpose?: string): GenerationPlan[] {
  if (purpose === 'replicate' || purpose === 'model3d' || purpose === 'edit' || purpose === 'generate') {
    return GENERATION_PLANS.filter((p) => p.taskType === purpose);
  }
  return GENERATION_PLANS;
}

export function getGenerationPlan(id?: string): GenerationPlan {
  return GENERATION_PLANS.find((p) => p.id === id) || GENERATION_PLANS[0];
}

/** 取指定业务类型的方案，未指定 planId 时返回该类型第一个 */
export function getPlanForTaskType(taskType: TaskType, planId?: string): GenerationPlan {
  const candidates = GENERATION_PLANS.filter((p) => p.taskType === taskType);
  return candidates.find((p) => p.id === planId) || candidates[0];
}
