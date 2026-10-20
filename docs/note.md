# AIClothes 功能实现方案（功能 / 模型 / 费用）

> 更新日期：2026-08-12 · AI 服务商：腾讯云 MPS（媒体处理）+ 腾讯混元生图（aiart）+ 阿里云百炼（DashScope）

## 1. AI 换装（tryon）

前端可选生成方案（默认 flash）：

| 方案 | 厂商/接口 | 费用 | 说明 |
|---|---|---|---|
| AI 换装（flash） | MPS `WAND-tryon-1.0-flash` | **2.12 元/次** | 支持姿势/背景参考图 |
| AI 换装（pro） | MPS `WAND-tryon-1.0-pro` | **2.3 元/次** | 高质量档 |
| AI 换装（lite 轻量档） | MPS `WAND-tryon-1.0-lite` | 占位 **1.5 元/次** | ⚠️ lite 档单价官方计费页未公开，上线前以控制台实际价格为准 |
| 混元生图 模特换装 | 混元 `ChangeClothes` | **0.25 元/张起** | 仅换装（上/下/连衣裙），无姿势/背景控制，需选服装类型，同步接口 |
| AI 试衣（阿里云百炼） | 百炼 `aitryon` | **0.20 元/张** | 仅换装（上/下/连衣裙/套装），需选服装类型，异步接口；⚠️ **2026-10-10 下线**，官方推荐迁移至 qwen-image-2.0 |
| qwen-image-2.0 换衣 | 百炼 `qwen-image-2.0` | **0.20 元/张** | 多模态图生图（模特图+服装图+文本指令），aitryon 官方推荐替代，同步接口，无需选服装类型 |

- MPS 实现：`POST /api/tryon` → 任务队列 → worker 提交 `ProcessImage(AiTryOnConfig)` → 轮询 `DescribeImageTaskDetail` → 结果存 COS
- 混元实现：worker 按 `plan.method=hunyuan-change-clothes` 分流，同步调用 `ChangeClothes(ModelUrl/ClothesUrl/ClothesType)`，结果图 URL 1 小时有效，下载后转存 COS
- 阿里云 aitryon 实现：worker 按 `plan.method=aliyun-aitryon` 分流，异步调用 `POST image-synthesis`（X-DashScope-Async: enable）→ 轮询 `GET /api/v1/tasks/{id}`（15~30 秒）→ 结果图 URL 24 小时有效，下载后转存 COS；上装/连衣裙传 `top_garment_url`，下装传 `bottom_garment_url`；需在百炼控制台开通服务并将 `ALIYUN_BAILIAN_API_KEY`（北京地域）填入 .env.local
- qwen-image-2.0 实现：worker 按 `plan.method=aliyun-qwen-image` 分流，同步调用 `POST multimodal-generation/generation`（content = [模特图, 服装图, 文本指令]），返回 URL 或 base64（base64 直接转存 COS）；prompt 约束"保持人物不变、服装版型颜色图案一致"

## 2. 爆款复刻（replicate）

前端可选生成方案（默认 flash）：

| 方案 | 厂商/接口 | 费用 | 说明 |
|---|---|---|---|
| 爆款复刻（flash） | MPS `WAND-tryon-1.0-flash` | **2.12 元/次** | 参考图作 pose+background，姿势背景还原好 |
| 爆款复刻（pro） | MPS `WAND-tryon-1.0-pro` | **2.3 元/次** | 高质量档 |
| 爆款复刻（lite 轻量档） | MPS `WAND-tryon-1.0-lite` | 占位 **1.5 元/次** | ⚠️ lite 档单价官方计费页未公开，上线前以控制台实际价格为准 |
| 爆款复刻（混元图生图） | 混元 `ImageToImage` | **0.06 元/张起** | 参考图+服装图拼图后图生图复刻，最便宜；不指定模特，姿势/背景最贴近原图 |

- MPS 实现：与 AI 换装共用同一 worker，参考图同时作为 pose + background 输入，`prompt` 为"复刻参考图的动作、姿势和背景"
- 混元图生图实现：worker 按 `plan.method=hunyuan-img2img` 分流，sharp 将参考图与服装平铺图横向拼图（高 1024）后同步调用 `ImageToImage(InputUrl/Prompt/Strength=0.65)`

## 3. 穿搭方案（outfit）

模特试衣三视角（商品套图已独立为顶部菜单「商品套图」，见第 4 节）：

| 方式 | 模型 | 费用 |
|---|---|---|
| 模特试衣三视角（outfit_batch） | `WAND-tryon-1.0-flash` | 2.12 × 3 = **6.36 元/套**（正/侧/背各 1 次） |
| 模特试衣三视角（pro） | `WAND-tryon-1.0-pro` | 2.3 × 3 = **6.9 元/套** |
| AI 试衣多姿势（outfit_batch，阿里） | 百炼 `aitryon` | 0.2 × 3 = **0.6 元/套**（⚠️ 无视角/姿势控制，三张仅服装相同、姿势随机，按正/侧/背布局展示，效果打折；2026-10-10 下线） |
| **qwen-image-2.0 三视角**（outfit_batch，阿里） | 百炼 `qwen-image-2.0` | 0.2 × 3 = **0.6 元/套**（✅ 文本指令控制正/侧/背视角，真三视角，aitryon 官方推荐替代） |
| **qwen-image-3.0 三视角**（outfit_batch，阿里） | 百炼 `qwen-image-3.0` | 0.18 × 3 = **0.54 元/套**（1K/2K 同价，标准版，RPM 20） |
| **qwen-image-3.0-pro 三视角**（outfit_batch，阿里） | 百炼 `qwen-image-3.0-pro` | 0.25 × 3 = **0.75 元/套**（1K；2K 0.5 元/张，RPM 1） |
| **wan2.7-image 三视角**（outfit_batch，阿里） | 百炼 `wan2.7-image` | 0.2 × 3 = **0.6 元/套**（多图参考/组图生成，RPM 300） |
| **wan2.7-image-pro 三视角**（outfit_batch，阿里） | 百炼 `wan2.7-image-pro` | 0.5 × 3 = **1.5 元/套**（旗舰版，4K 文生图，RPM 300） |

- 多件单品服务端 sharp 拼图成"整套平铺图"作输入，三视角各 1 次调用，结果存 `front/side/back_image_path`
- 走任务队列异步执行，支持超时后增量恢复（不重复提交计费）
- 阿里 aitryon 方案：worker 按 `plan.method=aliyun-aitryon` 分流，每视角异步调用 aitryon 并轮询；服装类型由穿搭类目推断（单件 dress→Dress、单件 bottom→Lower-body、其余→Upper-body）
- qwen-image-2.0 方案：worker 按 `plan.method=aliyun-qwen-image` 分流，每视角同步调用多模态图生图（模特图+服装图+视角指令）

## 4. 商品套图（suite，独立页面）

顶部菜单「商品套图」→ `POST /api/suite`（单件商品图）→ 任务队列 → worker 调 `WAND-suite-1.0-flash` 一次生成 4 张海报（主图/细节/卖点/氛围），结果存 COS 并写入 `image_generations`（task_type=suite）。

| 方案 | 厂商/接口 | 费用 |
|---|---|---|
| AI 商品套图 | MPS `WAND-suite-1.0-flash` | **0.79 元/次** |

- **重要：必须一次上传一件商品**。多件商品拼图/传多张商品视角图会误导 AI 主商品识别（曾出现"4 张全是鞋子"），因此独立页只接收单件商品图、不传附加视角图
- 商品套图由 AI 自动搭配场景与模特，与「定制模特」无关
