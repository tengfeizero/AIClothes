/** 素材类型与共享类型定义（客户端可安全引用，不含 Node 依赖） */

export const MATERIAL_TYPES = [
  'general',
  'garment',
  'item',
  'model',
  'pose',
  'background',
  'results',
] as const;

export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_LABELS: Record<MaterialType, string> = {
  general: '通用',
  garment: '套装',
  item: '单品',
  model: '模特',
  pose: '姿势',
  background: '背景',
  results: '生成结果',
};

/** 仅存本地、无需同步到对象存储的类型（AI 生成产物） */
export const LOCAL_ONLY_TYPES = new Set<MaterialType>(['results']);

/** 单品子类：上装 / 下装 / 连衣裙 / 配饰 / 鞋履（与穿搭方案 GarmentCategory 一致） */
export const ITEM_CATEGORIES = ['top', 'bottom', 'dress', 'accessories', 'shoes'] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  accessories: '配饰',
  shoes: '鞋履',
};

export function isItemCategory(value: string | null | undefined): value is ItemCategory {
  return Boolean(value) && ITEM_CATEGORIES.includes(value as ItemCategory);
}

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
  /** 标题（导入的图库素材：服装关键词 / 姿势名） */
  title?: string;
  /** 分类（服装季节 / 姿势分类） */
  category?: string;
  /** 单品子类（仅 item 类型，已知时才有） */
  itemCategory?: ItemCategory;
  /** 关键词标签 */
  tags: string[];
  /** 来源图库 */
  source?: string;
  /** 原图外链（图库素材才有，用于按需查看原图） */
  remoteUrl?: string;
  /** 对应定制模特的 ID（仅 model 类型且有模特记录时） */
  modelId?: string;
  /** 是否为默认模特 */
  isDefault?: boolean;
}

export function isMaterialType(value: string | null | undefined): value is MaterialType {
  return Boolean(value) && MATERIAL_TYPES.includes(value as MaterialType);
}

/** 素材唯一标识（类型 + 文件名） */
export function materialKey(item: Pick<MaterialItem, 'type' | 'filename'>): string {
  return `${item.type}/${item.filename}`;
}

/**
 * 素材用于生成接口的地址：已同步到对象存储用本地路径（后端按存储提供方拼公网地址），
 * 未同步的图库素材优先用原图外链。
 */
export function getMaterialSourceUrl(item: MaterialItem): string {
  return item.synced || !item.remoteUrl ? item.localPath : item.remoteUrl;
}
