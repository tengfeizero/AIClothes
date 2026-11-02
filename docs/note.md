# AIClothes 功能实现方案（功能 / 模型 / 费用）

> 更新日期：2026-11-02
> 所有可选方案统一定义在 `src/lib/ai/generation-plans.ts`，前端通过 `GET /api/generation-plans?purpose=` 拉取。
> 单价为项目内成本核算口径，实际以各厂商控制台账单为准。

## 1. 爆款复刻（replicate，5 个方案）

| 方案 ID | 厂商 / 接口 | 费用 | 说明 |
|---|---|---|---|
| `aliyun-replicate-qwen-image` | 百炼 `qwen-image-2.1-turbo` | **0.10 元/张** | 默认方案，成本优先 |
| `aliyun-replicate-qwen-image-2-pro` | 百炼 `qwen-image-2.1-pro` | **0.25 元/张** | 高质量档 |
| `aliyun-replicate-qwen-image-3` | 百炼 `qwen-image-3.0` | **0.18 元/张** | 3.0 基础档 |
| `aliyun-replicate-qwen-image-3-pro` | 百炼 `qwen-image-3.0-pro` | **0.25 元/张** | 3.0 高质量档 |
| `volcengine-replicate-jimeng` | 火山引擎即梦 `jimeng_seedream46_cvtob` | **0.20 元/张** | Seedream 4.6，1K/2K/4K |

- 参考图必填；模特图、姿势图、服装图均为选填，未选填的部分沿用参考图内容。
- 输入图顺序固定为 图1 参考图 → 选填的模特图 → 姿势图 → 服装图；`/api/replicate` 按实际选填项动态生成指令。
- worker 按 `plan.method` 分流：
  - `aliyun-qwen-image`：同步调用 `POST multimodal-generation/generation`，分辨率以 `W*H` 字符串透传。
  - `volcengine-jimeng`：异步提交即梦图生图，按 `w*h` 像素总数归类 1K/2K/4K。
- 结果下载后直接落本地 `public/uploads/results`，只保存一份，不再转存对象存储。

## 2. AI 编辑（edit，2 个方案）

| 方案 ID | 厂商 / 接口 | 费用 | 说明 |
|---|---|---|---|
| `volcengine-seedit-v3` | 火山引擎 `seededit_v3.0` | **0.20 元/张** | 默认方案，指令编辑 |
| `aliyun-qwen-edit-2-pro` | 百炼 `qwen-image-2.1-pro` | **0.25 元/张** | 局部重绘 |

- 前端 `MaskPainter` 在预览画布上涂抹，导出与原图同尺寸的黑白 PNG 掩膜（白色为修改区域）和归一化外接框。
- `/api/edit` 校验 `region` 与 `maskDataUrl`（PNG、≤6MB、sharp 可解析），掩膜转存后任务只保留 URL。
- worker 处理流程：
  1. 按 `region` 裁出原图选区；
  2. 选区交给厂商编辑（qwen-image 会按选区比例选择最接近的官方输出尺寸）；
  3. 掩膜羽化后作为 alpha，把编辑结果贴回原图，未涂抹区域保持原样。
- 不传 `region` / `maskDataUrl` 时按整图编辑。

## 3. 自由生图（generate，5 个方案）

| 方案 ID | 厂商 / 接口 | 费用 | 最大参考图 |
|---|---|---|---|
| `aliyun-qwen-free` | 百炼 `qwen-image-2.1-turbo` | **0.10 元/张** | 4 |
| `aliyun-qwen-free-2-pro` | 百炼 `qwen-image-2.1-pro` | **0.25 元/张** | 4 |
| `aliyun-qwen-free-3` | 百炼 `qwen-image-3.0` | **0.18 元/张** | 4 |
| `aliyun-qwen-free-3-pro` | 百炼 `qwen-image-3.0-pro` | **0.25 元/张** | 4 |
| `volcengine-jimeng-free` | 火山引擎即梦 `jimeng_seedream46_cvtob` | **0.20 元/张** | 14 |

- 提示词用「图1/图2…」指代上传顺序，`/api/generate` 按 `plan.maxImages` 截断图片。
- 分辨率：阿里云传 `W*H`，即梦传像素总数并归类 1K/2K/4K；`original` 表示不限制。

## 4. 3D 商品（model3d，1 个方案）

| 方案 ID | 厂商 / 接口 | 费用 | 输出 |
|---|---|---|---|
| `tencent-model3d-hunyuan` | 腾讯云混元生3D `hy-3d-3.1` | **3.60 元/次** | GLB（可开 PBR） |

- 上传 2–8 张同物品多视角图片，异步提交后轮询厂商任务。
- 结果（GLB 与预览图）落本地 `public/uploads/model3d`，由 `<model-viewer>` 加载。

## 5. 存储与任务收尾

- 用户上传素材：先落本地 `public/uploads/<type>`，再同步到对象存储（`STORAGE_PROVIDER=tencent` 走 COS，`aliyun` 走 OSS），为厂商提供公网 URL。
- AI 生成产物：`results` / `model3d` 类型只落本地，不回传对象存储。
- `finalizeTask` 统一接收 Buffer，写入生成记录后完成任务，避免「先落盘再下载重存」产生重复文件。
