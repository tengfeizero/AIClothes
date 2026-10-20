# AI Clothes — AI穿搭网站应用

基于AI的智能穿搭平台，支持服装平铺图生成模特穿搭、定制数字人模特、爆款场景复刻、3D服装展示和完整穿搭方案生成。

## 核心功能

| 功能 | 描述 |
|------|------|
| **AI换装** | 用户上传服装平铺图，生成模特穿搭场景图 |
| **定制模特** | 用户上传个人照片，创建专属数字人形象 |
| **3D平铺图** | 服装平铺图转多角度3D展示效果 |
| **爆款复刻** | 上传参考图，替换模特和服装复刻场景与动作 |
| **穿搭方案** | 生成四图排版（正面/侧面/背面/单品清单）的完整穿搭方案 |

## 技术栈

| 层级 | 选型 | 说明 |
|------|------|------|
| 框架 | Next.js 14+ (App Router) | 全栈一体，API Routes + Server Components |
| 语言 | TypeScript | 类型安全 |
| 数据库 | SQLite + better-sqlite3 | 同步API、零配置、单文件部署 |
| 样式 | Tailwind CSS + shadcn/ui | 快速搭建美观UI |
| 图片存储 | 腾讯云 COS 对象存储 | 上传图与结果图统一存 COS，支持自定义访问域名 |
| 任务队列 | In-process + SQLite持久化 | 进程内轮询调度，不引入Redis |
| 3D展示 | CSS 3D Transform (MVP) / Three.js | 多角度旋转查看 |

## AI API选型

核心原则：**保证质量前提下最便宜，同价优先国内**。

### 主力API：腾讯云 MPS「AI换装」(WAND-tryon)

一个接口覆盖4个核心功能，原生支持多参考图同传：

| 参数 | 对应功能 | 作用 |
|------|---------|------|
| `garment`（服装图） | AI换装 | 指定要穿的衣服 |
| `identity`（身份图） | 定制模特 | 保持用户人脸/体型一致 |
| `pose`（姿势图） | 爆款复刻 | 复刻参考图姿态/动作 |
| `background`（背景图） | 爆款复刻 | 复刻参考图场景 |
| `accessories/shoes` | 穿搭方案 | 搭配配饰鞋包 |

- **模型档位**：lite（最快）、flash（均衡，主力）、pro（最精细）
- **输出分辨率**：1K / 2K / 4K
- **价格**：1000张资源包400元（约0.4元/张），万张3500元（0.35元/张）
- **异步支持**：✅ 创建任务+轮询查询
- **文档**：https://cloud.tencent.cn/document/practice/862/132594

### 辅助API：火山引擎「即梦」(Jimeng Seedream 4.6)

基于Seedream4.0基础模型训练的图生图能力，聚焦人像写真、平面设计和图片风格化，适合AI换装场景的高质量穿搭图生成。

| 参数 | 对应功能 | 作用 |
|------|---------|------|
| `image_urls`（服装图+模特图） | AI换装 | 输入服装平铺图与模特参考图，生成穿搭效果 |
| `prompt`（提示词） | AI换装 | 描述穿搭场景、风格、光线等 |
| `scale`（文本影响度） | AI换装 | 控制prompt对结果的影响程度，越大越遵循prompt |

- **接口地址**：`https://visual.volcengineapi.com`
- **认证**：火山引擎AK/SK签名（Region: `cn-north-1`, Service: `cv`）
- **异步模式**：提交任务（`CVSync2AsyncSubmitTask`）→ 轮询查询（`CVSync2AsyncGetResult`）
- **输入限制**：最多14张图，建议≤6张；最大15MB/张；支持JPEG/PNG
- **输出**：支持1K-4K分辨率，可强制单图（`force_single`）
- **文档**：https://www.volcengine.com/docs/6444/1340578

### 辅助API：阿里云百炼「qwen-image」

用于场景背景生成、创意图等不需要精确服装还原的场景，约0.2元/张。

### 3D方案（MVP）

不使用真3D模型API（成本0.7-3.5元/个且国内无对标），改用：
- 调用腾讯WAND-tryon生成多角度（正面/侧面/背面）穿着图
- 前端用CSS 3D Transform做可旋转伪3D展示
- 三视图与穿搭方案复用，不额外花费

### 单品清单图

零API成本，使用前端Canvas/Fabric.js排版合成（用户上传的单品平铺图 + AI生成的模特图）。

## 成本估算

| 功能 | API调用次数 | 单次成本 |
|------|-----------|---------|
| AI换装（单张正面图） | 1次WAND flash | **0.35元** |
| AI换装（即梦模式，单图） | 1次即梦Seedream 4.6 | **按火山引擎计费** |
| 定制模特（换装+identity） | 1次WAND flash | **0.35元** |
| 爆款复刻（pose+garment+background+identity） | 1次WAND flash | **0.35元** |
| 3D多视角展示 | 3次WAND（复用三视图） | **1.05元** |
| 穿搭方案四图 | 3次WAND + 前端合成 | **1.05元/套** |
| 场景背景辅助 | 1次通义万相 | 0.2元（可选） |

**启动成本**：约400-500元（腾讯云1000张资源包 + 服务器）。

## 项目结构

```
AIClothes/
├── public/
│   └── uploads/                     # 用户上传图片存储
│       ├── garments/                # 服装平铺图
│       ├── models/                  # 模特/用户照片
│       ├── poses/                   # 姿势参考图
│       ├── backgrounds/             # 背景参考图
│       └── results/                 # AI生成结果图
├── src/
│   ├── app/
│   │   ├── layout.tsx               # 根布局
│   │   ├── page.tsx                 # 首页/功能入口
│   │   ├── globals.css
│   │   ├── tryon/                   # AI换装
│   │   │   └── page.tsx
│   │   ├── my-model/                # 定制模特
│   │   │   └── page.tsx
│   │   ├── 3d-viewer/               # 3D平铺图
│   │   │   └── page.tsx
│   │   ├── replicate/               # 爆款复刻
│   │   │   └── page.tsx
│   │   ├── outfit/                  # 穿搭方案
│   │   │   ├── page.tsx
│   │   │   ├── create/page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── tasks/                   # 任务中心
│   │   │   └── page.tsx
│   │   └── api/
│   │       ├── upload/route.ts
│   │       ├── tryon/route.ts
│   │       ├── model/route.ts
│   │       ├── replicate/route.ts
│   │       ├── outfit/route.ts
│   │       ├── outfit/[id]/route.ts
│   │       ├── tasks/route.ts
│   │       ├── tasks/[id]/route.ts
│   │       └── views/route.ts
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts             # 数据库连接（单例+惰性初始化）
│   │   │   └── schema.ts            # 建表DDL
│   │   ├── ai/
│   │   │   ├── tencent.ts           # 腾讯云MPS API封装
│   │   │   ├── volcengine.ts        # 火山引擎即梦API封装
│   │   │   ├── aliyun.ts            # 阿里云百炼API封装
│   │   │   └── types.ts
│   │   ├── queue/
│   │   │   ├── index.ts             # 任务调度器
│   │   │   └── workers/
│   │   │       ├── tryon.ts
│   │   │       ├── replicate.ts
│   │   │       └── views.ts
│   │   ├── storage/
│   │   │   └── local.ts             # 本地文件存储封装
│   │   └── utils/
│   ├── components/
│   │   ├── ui/                      # shadcn/ui基础组件
│   │   ├── upload/                  # 图片上传组件
│   │   ├── task-status/             # 任务状态展示
│   │   ├── result-viewer/           # 结果展示
│   │   └── outfit-editor/           # 穿搭方案编辑器
│   └── types/
│       └── index.ts
├── data/                            # SQLite数据库文件目录
│   └── aiclothes.db
├── .env.local
├── .env.example
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 数据库设计

```sql
-- 用户自定义模特（数字人）
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_path TEXT,
  identity_image_path TEXT,
  gender TEXT DEFAULT 'female',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 服装单品
CREATE TABLE IF NOT EXISTS garments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,        -- top/bottom/dress/accessories/shoes
  image_path TEXT NOT NULL,
  color TEXT,
  tags TEXT,                     -- JSON数组
  created_at INTEGER NOT NULL
);

-- 穿搭方案
CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  model_id TEXT,
  scene_prompt TEXT,
  front_image_path TEXT,
  side_image_path TEXT,
  back_image_path TEXT,
  item_list_image_path TEXT,
  status TEXT DEFAULT 'draft',   -- draft/generating/completed/failed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id)
);

-- 穿搭方案-服装关联
CREATE TABLE IF NOT EXISTS outfit_garments (
  id TEXT PRIMARY KEY,
  outfit_id TEXT NOT NULL,
  garment_id TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (outfit_id) REFERENCES outfits(id) ON DELETE CASCADE,
  FOREIGN KEY (garment_id) REFERENCES garments(id)
);

-- AI生成任务（统一异步任务表）
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,            -- tryon/replicate/multi_view/outfit_batch
  status TEXT NOT NULL,          -- pending/processing/completed/failed
  params TEXT NOT NULL,          -- JSON
  result TEXT,                   -- JSON
  error TEXT,
  progress INTEGER DEFAULT 0,
  provider_task_id TEXT,
  provider TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

-- 默认模特库（预置）
CREATE TABLE IF NOT EXISTS default_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  image_path TEXT NOT NULL,
  tags TEXT
);
```

## 异步任务架构

```
前端提交请求
    ↓
API Route → 上传图片保存本地 → 创建tasks记录(status=pending) → 返回taskId
    ↓
前端轮询 GET /api/tasks/:id（每2秒）
    ↓
后台Worker轮询pending任务 → 取任务置processing → 调用AI API → 轮询第三方
    ↓
下载结果图到本地 → 更新tasks为completed/failed
    ↓
前端轮询到completed → 展示结果
```

- 并发控制：每次轮询最多取3个pending任务
- 故障恢复：定时检查processing超过5分钟的任务，重新查询第三方状态
- Worker启动：懒初始化标记，避免Next.js热重载重复启动

## API接口

### 图片上传
- `POST /api/upload` — multipart/form-data上传图片，返回`{ id, path, url }`

### AI换装
- `POST /api/tryon`
```json
{
  "garmentImagePath": "/uploads/garments/xxx.jpg",
  "modelImagePath": "/uploads/models/yyy.jpg",
  "modelId": "model_xxx",
  "backgroundPrompt": "在咖啡馆内，自然光线",
  "poseImagePath": "/uploads/poses/zzz.jpg",
  "view": "front",
  "provider": "volcengine"
}
```
返回：`{ taskId }`

**provider 说明**：
- `tencent`（默认）：使用腾讯云MPS WAND-tryon，支持garment/identity/pose/background多参数
- `volcengine`：使用火山引擎即梦Seedream 4.6，以图生图方式生成穿搭，适合高质量人像写真场景

**火山引擎即梦请求参数映射**：
| 前端参数 | 即梦API参数 | 说明 |
|---------|------------|------|
| `garmentImagePath` + `modelImagePath` | `image_urls` | 服装图与模特图作为参考输入 |
| `backgroundPrompt` | `prompt` | 穿搭场景描述词 |
| — | `scale` | 默认50，prompt影响度 |
| — | `force_single` | 默认true，强制单图输出 |
| — | `size` | 默认4194304（2K），可通过width/height指定 |

### 定制模特
- `POST /api/model` — 创建数字人（保存identity图片）
- `GET /api/model` — 我的数字人列表
- `DELETE /api/model/[id]` — 删除数字人

### 爆款复刻
- `POST /api/replicate`
```json
{
  "referenceImagePath": "/uploads/poses/xxx.jpg",
  "garmentImagePath": "/uploads/garments/yyy.jpg",
  "modelId": "model_zzz",
  "scenePrompt": "保持原图场景"
}
```
返回：`{ taskId }`

### 穿搭方案
- `POST /api/outfit` — 创建穿搭方案
- `GET /api/outfit` — 列表
- `GET /api/outfit/[id]` — 详情
- `PUT /api/outfit/[id]` — 更新
- `POST /api/outfit/[id]/generate` — 一键生成四图（批量任务）

### 任务查询
- `GET /api/tasks/[id]`
```json
{
  "id": "task_xxx",
  "type": "tryon",
  "status": "completed",
  "progress": 100,
  "result": { "images": ["/uploads/results/aaa.jpg"] },
  "error": null,
  "createdAt": 1723000000000,
  "completedAt": 1723000020000
}
```

## 页面设计

- **首页 `/`**：5个功能入口卡片 + 最近生成结果展示
- **AI换装 `/tryon`**：上传服装→选模特→设场景（火山引擎即梦/腾讯云MPS可选）→生成→结果展示
- **定制模特 `/my-model`**：数字人列表 + 上传新数字人
- **3D展示 `/3d-viewer`**：上传服装→生成多角度→拖拽旋转查看
- **爆款复刻 `/replicate`**：上传参考图→选服装→选模特→生成对比
- **穿搭方案 `/outfit/create`**：单品管理+模特选择+四格预览→一键生成
- **任务中心 `/tasks`**：所有异步任务状态查看

## 环境变量

```env
# 腾讯云（MPS AI换装 / 混元生图 / 3D 共用同一组密钥）
TENCENT_SECRET_ID=your_secret_id
TENCENT_SECRET_KEY=your_secret_key
TENCENT_MPS_REGION=ap-guangzhou

# 腾讯云 COS 对象存储（必填，上传与结果图均存于此）
TENCENT_COS_BUCKET=your_bucket_name
TENCENT_COS_REGION=ap-guangzhou
# 可选：自定义访问域名，留空则使用 https://{bucket}.cos.{region}.myqcloud.com
TENCENT_COS_PUBLIC_URL=

# 火山引擎（即梦AI换装）
VOLCENGINE_ACCESS_KEY=your_access_key
VOLCENGINE_SECRET_KEY=your_secret_key
VOLCENGINE_REGION=cn-north-1

# 阿里云百炼（qwen-image 系列）
ALIYUN_BAILIAN_API_KEY=your_api_key
ALIYUN_BAILIAN_REGION=cn-beijing
# 可选：百炼专属 API Host（sk-ws- 工作空间密钥必须填写）
ALIYUN_BAILIAN_BASE_URL=

# 文件存储
UPLOAD_DIR=public/uploads
MAX_FILE_SIZE=10485760

# 应用
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 关键技术决策与避坑

1. **数据库初始化**：惰性初始化（首次查询时建表），不在模块顶层执行DDL
2. **better-sqlite3**：Windows下如遇原生绑定问题执行`npm rebuild better-sqlite3`
3. **数据库路径**：`path.join(process.cwd(), 'data', 'aiclothes.db')`，启动时确保目录存在
4. **Server Components**：数据获取直接import db查询，不fetch相对URL
5. **JSON字段**：SQLite不支持数组，用TEXT存JSON，数据访问层封装parse/stringify
6. **Worker启动**：用`let workerStarted = false`标记，防止热重载重复启动
7. **图片公网访问**：开发阶段用localtunnel/ngrok暴露服务；生产环境上传到腾讯云COS

## 开发计划（MVP迭代）

| 阶段 | 功能 | 交付物 |
|------|------|-------|
| P0 | 项目脚手架 + 数据库 + 图片上传 + AI换装（单图正面）+ 异步任务 + 结果展示 | 上传衣服→选模特→生成正面穿搭图 |
| P1 | 默认模特库 + 定制模特管理 + 任务中心 | 保存个人数字人并复用 |
| P2 | 穿搭方案CRUD + 批量生成三视图 + 单品清单前端排版 | 完整四图穿搭方案 |
| P3 | 爆款复刻（多参考图同传） | 复刻场景动作 |
| P4 | 3D多视角展示（CSS 3D旋转） | 多角度旋转查看 |
| P5 | 穿搭方案编辑器（拖拽排版）+ 下载导出 + 历史记录 | 完善体验 |
