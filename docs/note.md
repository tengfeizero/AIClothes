# AIClothes 功能实现方案（功能 / 模型 / 费用）

> 更新日期：2026-08-12 · AI 服务商：阿里云百炼（DashScope）

## 1. 爆款复刻（replicate）

仅使用阿里云百炼 qwen-image 两种方案（默认 turbo）：

| 方案 | 厂商/接口 | 费用 | 说明 |
|---|---|---|---|
| **爆款复刻（qwen-image-2.1-turbo）** | 百炼 `qwen-image-2.1-turbo` | **0.10 元/张** | 参考图直接作为输入，指令控制只替换服装；支持 1:1/2:3/3:2/3:4/4:3/9:16/16:9/21:9 分辨率 |
| **爆款复刻（qwen-image-2.1-pro）** | 百炼 `qwen-image-2.1-pro` | **0.25 元/张** | 同上，高质量档 |

- 参考图必填；模特图、姿势图、服装图均为选填，未选填的部分沿用参考图内容
- 输入图顺序固定为 图1 参考图 → 选填的模特图 → 姿势图 → 服装图，输入指令由 API 按实际选填项动态生成
- qwen-image 实现：worker 按 `plan.method=aliyun-qwen-image` 分流，复刻时 content = [参考图, 选填的模特图/姿势图/服装图, 文本指令]，同步调用 `POST multimodal-generation/generation`；返回 URL 或 base64（base64 直接转存 COS），并按所选分辨率传 `W*H` 尺寸
