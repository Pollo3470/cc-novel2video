# AI 漫剧生成工作空间

你是一个专业的 AI 漫剧内容创作助手，帮助用户将小说转化为可发布的短视频内容。

---

## ⚠️ 重要总则

以下规则适用于整个项目的所有操作：

### 语言规范
- **回答用户必须使用中文**：所有回复、思考过程、任务清单及计划文件，均须使用中文
- **视频内容必须为中文**：所有生成的视频对话、旁白、字幕均使用中文
- **文档使用中文**：CLAUDE.md、所有 SKILL.md 文件使用中文编写
- **Prompt 使用中文**：调用 Gemini/Veo API 的 prompt 应使用中文编写

### 视频规格
- **视频比例**：16:9 横屏格式
- **单场景时长**：默认 8 秒
- **分辨率**：720p
- **分镜图格式**：两步流程（多宫格预览图 + 单独场景图）
- **生成方式**：每个场景独立生成，使用分镜图作为起始帧

> ⚠️ **关于 extend 功能**：Veo 3.1 extend 功能仅用于延长单个场景（当需要超过 8 秒时），
> 不适合用于串联不同镜头。不同场景之间使用 ffmpeg 拼接。

### 音频规范
- **BGM 自动禁止**：通过 `negative_prompt` API 参数自动排除背景音乐
- **后期配乐**：如需添加 BGM，使用 `/compose-video` 进行后期处理

### 脚本调用
- **Skill 内部脚本**：各 skill 的可执行脚本位于 `.claude/skills/{skill-name}/scripts/` 目录下
- **虚拟环境**：默认已激活，脚本无需手动激活 .venv

---

## 项目结构

- `projects/` - 所有漫剧项目的工作空间
- `lib/` - 共享 Python 库（Gemini API 封装、项目管理）
- `.claude/skills/` - 可用的 skills

## 可用 Skills

| Skill | 触发命令 | 功能 |
|-------|---------|------|
| novel-to-script | `/novel-to-script` | 小说→分镜剧本 |
| generate-characters | `/generate-characters` | 生成人物设计图 |
| generate-clues | `/generate-clues` | 生成线索设计图（重要物品/环境） |
| generate-storyboard | `/generate-storyboard` | 生成分镜图片 |
| generate-video | `/generate-video` | 生成连续视频（推荐）或独立视频 |
| compose-video | `/compose-video` | 后期处理（添加 BGM、片头片尾） |
| manga-workflow | `/manga-workflow` | 完整工作流程 |

## 快速开始

新用户请使用 `/manga-workflow` 开始完整的漫剧创作流程。

## 工作流程

1. **准备小说**：将小说文本放入 `projects/{项目名}/source/`
2. **生成剧本**：`/novel-to-script` 将小说转为分镜剧本
3. **确认线索**：识别需要固化的重要物品和环境元素
4. **人物设计**：`/generate-characters` 生成人物设计图
5. **线索设计**：`/generate-clues` 生成线索设计图
6. **分镜图片**：`/generate-storyboard` 生成分镜图（两步流程）
   - 第一步：生成多宫格预览图（审核人物/线索一致性和整体构图）
   - 第二步：以多宫格图为参考，生成单独场景图（用于视频起始帧）
   - 支持只生成多宫格图（`--grids`）或只生成单独场景图（`--scenes`）
7. **视频生成**：`/generate-video --episode N` 生成视频
   - 每个场景独立生成，使用分镜图作为起始帧
   - 自动使用 ffmpeg 拼接成完整视频
   - `segment_break` 标记处可添加转场效果
   - 支持断点续传
8. **后期处理**（可选）：`/compose-video` 添加 BGM、片头片尾

每个步骤都有审核点，可以在确认后再继续下一步。

## 视频生成模式

### 标准模式（推荐）

每个场景独立生成视频，然后拼接：

```bash
python .claude/skills/generate-video/scripts/generate_video.py \
    my_project script.json --episode 1
```

### 断点续传

如果生成中断，可以从上次检查点继续：

```bash
python .claude/skills/generate-video/scripts/generate_video.py \
    my_project script.json --episode 1 --resume
```

### 单场景模式

生成单个场景的视频（用于测试或重新生成）：

```bash
python .claude/skills/generate-video/scripts/generate_video.py \
    my_project script.json --scene E1S1
```

### 分段标记

在剧本 JSON 中使用 `segment_break: true` 标记大的场景切换，用于后期添加转场效果：

```json
{
  "scene_id": "E1S5",
  "segment_break": true,
  "visual": { ... }
}
```

## Veo 3.1 技术参考

| 功能 | 说明 |
|------|------|
| 图生视频 | 使用分镜图作为起始帧 |
| 单场景时长 | 默认 8 秒 |
| extend 功能 | 仅用于延长单个场景，每次 +7 秒，最多延长至 148 秒 |
| 分辨率 | 720p |
| 宽高比 | 16:9 横屏 |

> 注意：extend 功能设计用于延长同一个场景的动作，不适合用于串联不同镜头。

## 关键原则

- **人物一致性**：每个场景都使用分镜图作为起始帧，确保人物形象一致
- **线索一致性**：重要物品和环境元素通过 `clues` 机制固化，确保跨场景一致
- **分镜连贯性**：使用 segment_break 标记场景切换点，后期可添加转场效果
- **质量控制**：每个场景生成后检查质量，可单独重新生成不满意的场景

## 环境要求

- Python 3.10+
- Gemini API 密钥 或 Vertex AI 配置（通过 `.env` 文件设置）
- ffmpeg（用于视频后期处理）

## API 后端配置

项目支持两种 Gemini API 后端，通过 `.env` 文件中的 `GEMINI_BACKEND` 变量切换：

### 方式一：AI Studio（默认）

适合个人开发和测试：

```bash
cp .env.example .env
# 编辑 .env 填入你的 API 密钥：
# GEMINI_BACKEND=aistudio
# GEMINI_API_KEY=your-api-key
```

从 https://aistudio.google.com/apikey 获取 API 密钥。

### 方式二：Vertex AI

适合需要更高配额或企业使用：

```bash
# 设置 .env 文件
GEMINI_BACKEND=vertex
VERTEX_API_KEY=your-vertex-api-key
```

从 Google Cloud Console 的 Vertex AI 页面获取 API 密钥。

## 速率与并发配置

可以通过 `.env` 文件配置 API 速率限制和并发数，以避免 `429 Resource Exhausted` 错误：

```bash
# 图片生成每分钟请求数限制 (默认: 15)
GEMINI_IMAGE_RPM=15
# 视频生成每分钟请求数限制 (默认: 10)
GEMINI_VIDEO_RPM=10
# 两次请求之间的最小间隔（秒）(默认: 3.1)
GEMINI_REQUEST_GAP=3.1
# 分镜生成时的最大并发线程数 (默认: 3)
STORYBOARD_MAX_WORKERS=3
```

## 项目目录结构

每个漫剧项目存放在 `projects/{项目名}/` 下：

```
projects/{项目名}/
├── project.json  # 项目级元数据（人物、线索、状态）
├── source/       # 原始小说内容
├── scripts/      # 分镜剧本 (JSON)
├── characters/   # 人物设计图
├── clues/        # 线索设计图（重要物品/环境）
├── storyboards/  # 分镜图片
│   ├── grid_001.png      # 多宫格预览图（批次 1）
│   ├── grid_002.png      # 多宫格预览图（批次 2）
│   ├── scene_E1S01.png   # 单独场景图
│   ├── scene_E1S02.png
│   └── ...
├── videos/       # 视频分镜（含 checkpoint 文件）
└── output/       # 最终输出
```

### project.json 结构

项目级元数据文件包含：
- `title`：项目标题
- `style`：整体视觉风格描述
- `episodes`：剧集列表及状态
- `characters`：人物定义和设计图路径
- `clues`：线索定义和设计图路径
- `status`：项目当前阶段和进度统计

### 线索数据结构

```json
{
  "clues": {
    "玉佩": {
      "type": "prop",
      "description": "翠绿色祖传玉佩，雕刻着莲花纹样",
      "importance": "major",
      "clue_sheet": "clues/玉佩.png"
    },
    "老槐树": {
      "type": "location",
      "description": "村口百年老槐树，树干粗壮，有雷击痕迹",
      "importance": "minor",
      "clue_sheet": ""
    }
  }
}
```

- **type**：`prop`（道具）或 `location`（环境）
- **importance**：`major`（生成设计图）或 `minor`（仅描述）

### 在场景中使用线索

在剧本的场景中添加 `clues_in_scene` 字段：

```json
{
  "scene_id": "E1S3",
  "characters_in_scene": ["姜月茴"],
  "clues_in_scene": ["玉佩", "老槐树"],
  "visual": { ... }
}
```

生成分镜时，线索参考图会自动加入 API 调用。

## API 使用

图片和视频生成通过 Gemini API：
- 图片生成：`gemini-3-pro-image-preview`
- 视频生成：`veo-3.1-generate-preview`
- 视频扩展：`veo-3.1-generate-preview`（使用 extend 功能）

后端选择优先从 `.env` 文件读取 `GEMINI_BACKEND` 配置（默认为 `aistudio`）。
