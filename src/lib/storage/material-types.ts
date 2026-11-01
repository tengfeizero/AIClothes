/** 素材类型与共享类型定义（客户端可安全引用，不含 Node 依赖） */

export const MATERIAL_TYPES = [
  'general',
  'garment',
  'model',
  'pose',
  'background',
  'accessories',
  'shoes',
  'results',
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  general: '通用',
  garment: '服装',
  model: '模特',
  pose: '姿势',
  background: '背景',
  accessories: '配饰',
  shoes: '鞋子',
  results: '生成结果',
};

/** 仅存本地、无需同步到对象存储的类型（AI 生成产物） */
export const LOCAL_ONLY_TYPES = new Set<MaterialType>(['results']);

export interface MaterialItem {
  type: MaterialType;
  filename: string;
  /** 本地访问地址，展示一律使用本地文件 */
  localPath: string;
  size: number;
  createdAt: number;
  /** 对象存储中是否已有副本 */
  synced: boolean;
  /** 被穿搭方案引用的次数 */
  referenceCount: number;
  referenceReason: string;
}

export function isMaterialType(value: string | null | undefined): value is MaterialType {
  return Boolean(value) && MATERIAL_TYPES.includes(value as MaterialType);
}
