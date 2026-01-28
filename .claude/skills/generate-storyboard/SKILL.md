---
name: generate-storyboard
description: 使用 Gemini 图像 API 生成分镜图。说书模式直接生成分镜图，剧集动画模式使用两步流程。使用场景：(1) 用户运行 /generate-storyboard 命令，(2) 剧本中有场景没有分镜图，(3) 用户想在视频生成前预览场景。
---

# 生成分镜图

使用 Gemini 3 Pro Image API 创建分镜图。

## 内容模式支持

系统支持两种内容模式，生成流程和画面比例根据模式自动调整：

| 模式 | 流程 | 画面比例 |
|------|------|----------|
| 说书+画面（默认） | **直接生成**（无多宫格） | **9:16 竖屏** |
| 剧集动画 | 两步流程（多宫格→单独场景图） | 16:9 横屏 |

> 画面比例通过 API 参数设置，不包含在 prompt 中。

## 说书模式流程（narration）

### 直接生成分镜图
- 无需多宫格预览图步骤
- 直接生成单独场景图（**9:16 竖屏**）
- 使用 character_sheet 和 clue_sheet 作为参考图保持人物一致性
- 保存为 `storyboards/scene_{segment_id}.png`
- 更新剧本中的 `storyboard_image` 字段
- 用于视频生成的起始帧

### 数据结构

```json
{
  "generated_assets": {
    "storyboard_image": "storyboards/scene_E1S01.png",
    "video_clip": null,
    "status": "storyboard_ready"
  }
}
```

> 注意：narration 模式不使用 `storyboard_grid` 字段

## 剧集动画模式流程（drama）

### 第一步：生成多宫格分镜图
- 按批次处理场景（每批 4-6 个场景）
- 生成多宫格预览图，确保人物一致性
- 自适应宫格布局：
  - 1-4 个场景 → 2x2 四宫格
  - 5-6 个场景 → 2x3 六宫格
- 保存为 `storyboards/grid_{batch_id:03d}.png`
- 更新剧本中的 `storyboard_grid` 字段

### 第二步：生成单独场景图
- 以多宫格图和人物设计图作为参考
- 为每个场景生成独立的高质量分镜图
- Prompt 中明确指出参考多宫格中的哪个格子
- 使用 16:9 横屏
- 保存为 `storyboards/scene_{scene_id}.png`
- 更新剧本中的 `storyboard_image` 字段

### 数据结构

```json
{
  "generated_assets": {
    "storyboard_grid": "storyboards/grid_001.png",
    "storyboard_image": "storyboards/scene_E1S01.png",
    "video_clip": null,
    "status": "storyboard_ready"
  }
}
```

## 命令行用法

### 说书模式（推荐）

```bash
# 直接生成所有缺失的分镜图
python .claude/skills/generate-storyboard/scripts/generate_storyboard.py \
    my_project script.json

# 为指定片段重新生成
python .claude/skills/generate-storyboard/scripts/generate_storyboard.py \
    my_project script.json --segment-ids E1S01 E1S02
```

### 剧集动画模式

```bash
# 步骤 1：生成多宫格预览图
python .claude/skills/generate-storyboard/scripts/generate_storyboard.py \
    my_project script.json --grids --all

# 步骤 2：生成单独场景图
python .claude/skills/generate-storyboard/scripts/generate_storyboard.py \
    my_project script.json --scenes
```

> **注意**：脚本会自动检测 content_mode，narration 模式下 `--grids`/`--scenes` 参数会被忽略。

## 限流说明

为了应对 API 限制，脚本内置了滑动窗口限流器：
- 支持通过环境变量配置速率限制（见 CLAUDE.md）
- 超出限制时会自动等待
- 内置指数退避重试机制（最大重试 5 次）

## 工作流程

1. **加载项目和剧本**
   - 如未指定项目名称，询问用户
   - 从 `projects/{项目名}/scripts/` 加载剧本
   - 确认所有人物都有 `character_sheet` 图像

2. **生成分镜图**
   - 运行 `.claude/skills/generate-storyboard/scripts/generate_storyboard.py`
   - 脚本自动检测 content_mode 并选择对应流程

3. **审核检查点**（drama 模式）
   - 展示每张多宫格分镜图
   - 询问用户是否批准或重新生成

4. **更新剧本**
   - 更新 `storyboard_image` 路径
   - drama 模式额外更新 `storyboard_grid` 路径
   - 更新场景状态

```
projects/{项目名}/storyboards/
├── grid_001.png           # 多宫格图（场景 E1S01-E1S06）
├── grid_002.png           # 多宫格图（场景 E1S07-E1S12）
├── scene_E1S01.png        # 单独场景图
├── scene_E1S02.png
└── ...
```

## 多宫格分镜 Prompt 模板

```
一张 16:9 横屏的多宫格分镜图，包含 [N] 个连续场景。
采用 [2x2/2x3] 宫格布局，每个格子展示一个场景的关键画面。

宫格1（场景 [scene_id]）：
- 画面描述：[visual.description]
- 镜头构图：[visual.shot_type]
- 人物：[characters_in_scene]
- 动作：[action]

宫格2（场景 [scene_id]）：
...

风格要求：
- 电影分镜图风格，{项目 style}
- 每个宫格有清晰的画面焦点
- 宫格之间用细线分隔

人物必须与提供的参考图完全一致。
```

## 单独场景图 Prompt 模板

```
根据提供的多宫格分镜参考图，生成其中 第 X 行第 Y 列（宫格 N）的单独高清场景图。

参考图是一张 [2x2/2x3] 布局的多宫格分镜图，请将该格子的内容单独生成为一张完整的图片。

场景 [scene_id] 的详细要求：
- 画面描述：[visual.description]
- 镜头构图：[visual.shot_type]（wide shot / medium shot / close-up / extreme close-up）
- 镜头运动起点：[visual.camera_movement]
- 光线条件：[visual.lighting]
- 画面氛围：[visual.mood]
- 人物：[characters_in_scene]
- 动作：[action]

风格要求：
- 电影分镜图风格，根据项目 style 设定
- 画面构图完整，焦点清晰
- 保持与多宫格参考图中对应格子的风格和构图一致

人物必须与提供的人物参考图完全一致。
```

> 画面比例（9:16 或 16:9）通过 API 参数设置，不写入 prompt。

### 字段说明

| 字段 | 来源 | 说明 |
|------|------|------|
| description | visual.description | 主体和环境描述 |
| shot_type | visual.shot_type | 镜头构图类型 |
| camera_movement | visual.camera_movement | 镜头运动方式（图片表现起始状态） |
| lighting | visual.lighting | 光线条件 |
| mood | visual.mood | 画面氛围和色调 |
| action | scene.action | 人物动作描述 |

## 人物一致性

**关键**：始终传入人物参考图以保持一致性。画面比例根据内容模式自动选择。

```python
from lib.gemini_client import GeminiClient

client = GeminiClient()

# 多宫格分镜图（始终 16:9）
image = client.generate_image(
    prompt=grid_prompt,
    reference_images=[
        f"projects/{项目名}/characters/{人物名}.png"
        for 人物名 in batch_characters
    ],
    aspect_ratio="16:9",
    output_path=f"projects/{项目名}/storyboards/grid_{batch_id}.png"
)

# 单独场景图（根据内容模式选择画面比例）
# 说书模式: 9:16, 剧集动画模式: 16:9
storyboard_aspect_ratio = get_aspect_ratio(project_data, 'storyboard')

image = client.generate_image(
    prompt=scene_prompt,
    reference_images=[
        f"projects/{项目名}/storyboards/grid_{batch_id}.png",  # 多宫格参考
        f"projects/{项目名}/characters/{人物名}.png"           # 人物参考
    ],
    aspect_ratio=storyboard_aspect_ratio,
    output_path=f"projects/{项目名}/storyboards/scene_{scene_id}.png"
)
```

## 生成前检查

生成分镜前确认：
- [ ] 所有人物都有已批准的 character_sheet 图像
- [ ] 场景视觉描述完整
- [ ] 人物动作已指定

## 质量检查清单

### 多宫格分镜图审核
- [ ] 各宫格中人物与参考图一致
- [ ] 宫格布局清晰，场景连贯
- [ ] 整体风格统一

### 单独场景图审核
- [ ] 与多宫格中对应格子的构图一致
- [ ] 画面质量适合作为视频起始帧
- [ ] 光线和氛围正确
- [ ] 场景准确传达预期动作

## 错误处理

1. **单场景失败不影响批次**：记录失败场景，继续处理下一个
2. **失败汇总报告**：生成结束后列出所有失败的场景和原因
3. **增量生成**：检测已存在的场景图，跳过重复生成
4. **支持重试**：使用 `--scenes --scene-ids E1S01` 重新生成失败场景
