# AI 视频生成器

基于 Claude Code Skills 的 AI 视频生成工具，将小说内容自动转换为可发布的短视频。

## ✨ 功能特点

- 🔄 **完整工作流**：小说 → 分镜剧本 → 人物设计 → 分镜图片 → 视频片段 → 最终视频
- 🎨 **人物一致性**：使用人物设计图作为参考，确保角色在所有场景中外观一致
- 🎬 **AI 视频生成**：集成 Veo 3.1 API，支持对话音频和音效
- ✅ **审核检查点**：每个阶段都可人工审核，确保质量可控
- 📱 **竖屏优化**：默认 9:16 比例，适合抖音/小红书/快手等平台

## 📦 安装

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd ai-anime
```

### 2. 创建虚拟环境并安装依赖

```bash
# 创建虚拟环境
python3 -m venv .venv

# 激活虚拟环境
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

# 安装依赖
pip install -r requirements.txt
```

> **注意**：所有 skill 脚本都会自动使用项目的 `.venv` 虚拟环境。

### 3. 安装 ffmpeg（视频合成需要）

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# 下载安装包: https://ffmpeg.org/download.html
```

### 4. 配置 API 密钥

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 Gemini API 密钥
# 获取密钥: https://aistudio.google.com/apikey
```

## 🚀 快速开始

### 使用完整工作流

```bash
# 启动 Claude Code
claude

# 运行完整工作流
/manga-workflow
```

按提示操作即可完成从小说到视频的全流程。

### 单独使用各功能

| 命令 | 功能 |
|------|------|
| `/manga-workflow` | 完整工作流程（推荐新手使用） |
| `/generate-characters` | 生成人物设计图 |
| `/generate-storyboard` | 生成分镜图片 |
| `/generate-video` | 生成视频片段 |
| `/compose-video` | 合成最终视频 |

## 📁 项目结构

```
ai-anime/
├── .claude/
│   ├── agents/                # Claude Agents
│   │   ├── novel-to-narration-script.md   # 小说→说书剧本 Agent（默认）
│   │   └── novel-to-storyboard-script.md  # 小说→分镜剧本 Agent
│   └── skills/                # Claude Code Skills
│   ├── generate-characters/  # 生成人物设计图
│   ├── generate-storyboard/  # 生成分镜图片
│   ├── generate-video/       # 生成视频分镜
│   ├── compose-video/        # 合成最终视频
│   └── manga-workflow/       # 主流程编排
├── lib/                      # Python 共享库
│   ├── gemini_client.py      # Gemini API 封装
│   └── project_manager.py    # 项目文件管理
├── projects/                 # 工作空间（你的视频项目）
├── .env.example              # 环境变量模板
├── CLAUDE.md                 # Claude 系统提示词
└── requirements.txt          # Python 依赖
```

### 视频项目目录结构

每个视频项目存放在 `projects/{项目名}/` 下：

```
projects/我的小说/
├── source/       # 原始小说内容（.txt 文件）
├── scripts/      # 分镜剧本（JSON 格式）
├── characters/   # 人物设计图（PNG）
├── storyboards/  # 分镜图片（PNG）
├── videos/       # 视频片段（MP4）
└── output/       # 最终输出视频（MP4）
```

## 📝 工作流程详解

### 第一步：准备小说

1. 在 `projects/` 下创建项目文件夹
2. 将小说文本放入 `source/` 目录

```bash
mkdir -p projects/我的小说/source
cp 你的小说.txt projects/我的小说/source/
```

### 第二步：生成分镜剧本

当您将小说文本放入 `projects/{项目名}/source/` 后，系统会自动调用 `novel-to-storyboard-script` agent 进行处理。

Agent 会执行四步流程：
1. **规范化剧本**：将小说结构化为标准剧本格式
2. **镜头预算**：分析场景复杂度，制定镜头分布方案
3. **角色表/线索表**：生成人物和重要道具/场景的详细描述
4. **分镜表**：输出最终的 JSON 格式分镜剧本

每一步都有审核点，确认后再继续下一步。

### 第三步：生成人物设计图

```
/generate-characters
```

为每个人物生成三视图设计稿，用于后续保持人物一致性。

**审核点**：确认人物形象是否符合预期，不满意可重新生成

### 第四步：生成分镜图片

```
/generate-storyboard
```

根据剧本生成每个场景的静态图片，会自动使用人物设计图作为参考。

**审核点**：检查场景构图、人物一致性、氛围是否正确

### 第五步：生成视频片段

```
/generate-video
```

使用 Veo 3.1 将分镜图片转换为动态视频，支持：
- 角色动作和表情
- 对话音频
- 背景音效

**审核点**：预览每个视频片段，不满意可重新生成

### 第六步：合成最终视频

```
/compose-video
```

使用 ffmpeg 将所有片段拼接，支持：
- 转场效果（淡入淡出、溶解、划变）
- 背景音乐（可选）
- 保留单独片段供手动剪辑

## ⚙️ 配置说明

### API 后端选择

项目支持两种 Gemini API 后端：

#### 方式一：AI Studio（默认，推荐个人使用）

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
GEMINI_BACKEND=aistudio
GEMINI_API_KEY=your-api-key
```

从 https://aistudio.google.com/apikey 获取 API 密钥。

#### 方式二：Vertex AI（推荐企业/高配额场景）

**步骤 1：创建 GCP 项目和服务账号**

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 **Vertex AI API**
4. 创建服务账号并下载 JSON 密钥文件

**步骤 2：配置凭证**

```bash
# 创建凭证目录
mkdir -p vertex_keys

# 将服务账号 JSON 文件放入目录
cp your-service-account.json vertex_keys/
```

**步骤 3：创建 GCS Bucket（视频延长功能需要）**

```bash
# 使用 gcloud CLI 创建 bucket
gcloud storage buckets create gs://your-bucket-name --location=us-central1

# 授予服务账号写入权限
gcloud storage buckets add-iam-policy-binding gs://your-bucket-name \
    --member="serviceAccount:your-sa@your-project.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"
```

**步骤 4：配置环境变量**

```bash
# 编辑 .env 文件
GEMINI_BACKEND=vertex
VERTEX_GCS_BUCKET=your-bucket-name
```

> **注意**：
> - 服务账号需要 `Vertex AI User` 和 `Storage Object Admin` 权限
> - GCS Bucket 用于视频延长功能的临时存储
> - Vertex AI 目前使用 `global` 区域

### 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `GEMINI_BACKEND` | API 后端：`aistudio`（默认）或 `vertex` | ❌ |
| `GEMINI_API_KEY` | Gemini API 密钥（AI Studio 模式） | AI Studio ✅ |
| `VERTEX_GCS_BUCKET` | GCS Bucket 名称（Vertex AI 视频延长需要） | Vertex AI ✅ |
| `GEMINI_IMAGE_RPM` | 图片生成每分钟请求数限制（默认 15） | ❌ |
| `GEMINI_VIDEO_RPM` | 视频生成每分钟请求数限制（默认 10） | ❌ |
| `GEMINI_REQUEST_GAP` | 请求间隔秒数（默认 3.1） | ❌ |

### 支持的 API 模型

- **图片生成**：`gemini-3-pro-image-preview`
- **视频生成**：`veo-3.1-generate-preview`

## 🔧 常见问题

### Q: API 调用失败？

1. 检查 `.env` 文件中的 API 密钥是否正确
2. 确认网络可以访问 Google API
3. 检查 API 配额是否充足

### Q: Vertex AI 延长视频失败？

确保：
1. 已设置 `VERTEX_GCS_BUCKET` 环境变量
2. GCS Bucket 存在且服务账号有写入权限
3. 服务账号 JSON 文件放在 `vertex_keys/` 目录下

### Q: 视频生成很慢？

Veo 视频生成通常需要 1-6 分钟，高峰期可能更长。请耐心等待。

### Q: 人物不一致？

1. 确保先运行 `/generate-characters` 并审核通过
2. 检查剧本中人物描述是否详细
3. 分镜生成时会自动使用人物设计图作为参考

### Q: ffmpeg 未找到？

确保 ffmpeg 已正确安装并添加到系统 PATH：

```bash
ffmpeg -version  # 应该显示版本信息
```

## 🎯 最佳实践

1. **小说长度**：建议每次处理 500-2000 字，生成 5-15 个场景
2. **人物数量**：建议每个项目 2-5 个主要人物
3. **场景时长**：每个场景 6-8 秒为宜
4. **对话长度**：每场景 1-2 句对话效果最佳
5. **审核流程**：每个阶段仔细审核，避免后期返工

## 📜 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
