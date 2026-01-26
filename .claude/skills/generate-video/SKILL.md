---
name: generate-video
description: 使用 Veo 3.1 API 为每个场景独立生成视频片段，以分镜图作为起始帧，然后使用 ffmpeg 拼接。使用场景：(1) 用户运行 /generate-video 命令，(2) 剧本中有场景没有 video_clip 路径，(3) 用户想将分镜转换为带音频的视频。每个场景使用分镜图保持人物一致性。
---

# 生成视频

使用 Veo 3.1 API 为每个场景创建视频片段，以分镜图作为起始帧。

## 生成模式

### 1. 标准模式（推荐）

每个场景独立生成视频，然后使用 ffmpeg 拼接：

```bash
python .claude/skills/generate-video/scripts/generate_video.py \
    my_project script.json --episode 1
```

**特点：**
- 每个场景都使用分镜图作为起始帧，保证人物一致性
- 场景之间使用 ffmpeg 拼接
- 支持断点续传
- 可单独重新生成不满意的场景

### 2. 断点续传

如果生成中断，可以从上次检查点继续：

```bash
python .claude/skills/generate-video/scripts/generate_video.py \
    my_project script.json --episode 1 --resume
```

### 3. 单场景模式

生成单个场景的视频（用于测试或重新生成）：

```bash
python .claude/skills/generate-video/scripts/generate_video.py \
    my_project script.json --scene E1S1
```

### 4. 批量独立模式

独立生成所有待处理场景：

```bash
python .claude/skills/generate-video/scripts/generate_video.py \
    my_project script.json --all
```

## 分段标记

在剧本 JSON 中使用 `segment_break: true` 标记大的场景切换（地点变化、时间跳跃等）：

```json
{
  "scene_id": "E1S5",
  "segment_break": true,
  "visual": { ... }
}
```

标记分段点后：
- 后期处理时可在此处添加转场效果
- 便于识别剧情结构

## Veo 3.1 技术参考

| 功能 | 说明 |
|------|------|
| 图生视频 | 使用分镜图作为起始帧 |
| 单场景时长 | 默认 8 秒 |
| 分辨率 | 720p |
| 宽高比 | 16:9 横屏 |

### 关于 extend 功能

Veo 3.1 的 extend 功能**仅适用于延长单个场景**（例如让一个动作继续进行），不适合用于串联不同镜头。

如果某个场景需要超过 8 秒的时长，可以使用 extend：
- 每次扩展 +7 秒
- 最多扩展至 148 秒
- 扩展时无法更换起始帧

> ⚠️ **不推荐用于多镜头串联**：不同场景之间应使用 ffmpeg 拼接，而非 extend。

## 工作流程

1. **加载项目和剧本**
   - 如未指定项目名称，询问用户
   - 从 `projects/{项目名}/scripts/` 加载剧本
   - 确认所有场景都有 `storyboard_image`

2. **生成视频**
   - 遍历指定 episode 的所有场景
   - 每个场景使用分镜图作为起始帧独立生成视频
   - 保存 checkpoint 支持断点续传

3. **拼接视频**
   - 使用 ffmpeg 按顺序拼接所有场景视频
   - 在 segment_break 标记处可添加转场效果（后期处理）

4. **审核检查点**
   - 展示/播放每个视频片段
   - 允许重新生成不满意的场景

5. **更新剧本**
   - 更新 `video_clip` 路径
   - 更新场景状态为 `completed`

## 视频 Prompt 生成

Prompt 由 `generate_video.py` 中的 `build_scene_prompt()` 函数自动构建，遵循 Veo prompt guide 最佳实践。

### Prompt 结构

根据 Veo 官方指导，prompt 包含以下元素（自然融合，不使用标签）：

1. **Composition 构图**：镜头类型（wide shot, close-up, medium shot）
2. **Subject 主体**：场景描述，包含人物、环境、物体
3. **Action 动作**：人物在做什么
4. **Dialogue 对话**：Speaker（manner）说道："text"
5. **Sound Effects 音效**：自然融入场景描述
6. **Camera 镜头**：运动方式的自然描述
7. **Ambiance 氛围**：光线和情绪

### 生成的 Prompt 示例

剧本场景数据：
```json
{
  "visual": {
    "description": "姜府花厅前，裴与身着华丽铠甲站在姜月茴面前",
    "shot_type": "medium shot",
    "camera_movement": "slow dolly in",
    "lighting": "明亮日光",
    "mood": "紧张对峙"
  },
  "action": "裴与自信满满地看着姜月茴，姜月茴面无表情",
  "dialogue": {
    "speaker": "裴与",
    "text": "茴儿，边关战事已定，陛下答应封我为镇北侯。",
    "emotion": "happy"
  },
  "audio": {
    "sound_effects": ["微风吹过", "衣袂摩挲声"]
  }
}
```

自动生成的 prompt：
```
medium shot，姜府花厅前，裴与身着华丽铠甲站在姜月茴面前。裴与自信满满地看着姜月茴，姜月茴面无表情。裴与（开心地）说道："茴儿，边关战事已定，陛下答应封我为镇北侯。" 可以听到微风吹过和衣袂摩挲声。镜头缓缓推进。明亮日光，紧张对峙的氛围。
```

### 对话格式

Veo 3 推荐的对话格式：`Speaker（manner）说道："text"`

| emotion | 转换为 manner |
|---------|--------------|
| happy | 开心地 |
| sad | 悲伤地 |
| angry | 愤怒地 |
| surprised | 惊讶地 |
| scared | 恐惧地 |
| neutral | 平静地 |
| determined | 坚定地 |
| cold | 冷淡地 |
| proud | 得意地 |
| anxious | 焦虑地 |

### 音效描述

音效自然融入场景，不使用标签：
- 1 个音效：`背景中传来{效果}。`
- 2 个音效：`可以听到{效果1}和{效果2}。`
- 多个音效：`环境音：{效果1}、{效果2}，以及{效果3}。`

### 镜头运动描述

镜头运动转换为自然语言：
- `dolly in` → `镜头缓缓推进。`
- `pan left` → `镜头向左平移。`
- `track` → `镜头跟随移动。`
- `handheld` → `手持镜头轻微晃动。`

### Negative Prompt

通过 API 参数自动排除不需要的元素：
```
background music, BGM, soundtrack, musical accompaniment
```

> 无需在视频 prompt 中声明"不要背景音乐"，这由 `negative_prompt` 参数处理。

## 音频规范

视频音频包含以下内容：
- **人物对白**：通过 `dialogue` 字段自动生成
- **环境音**：风声、雨声、城市噪音、自然声等
- **场景声效**：脚步声、门声、物体碰撞声等

> BGM 通过 `negative_prompt` 自动排除。如需添加背景音乐，请使用 `/compose-video` 后期处理。

## API 使用

### 标准生成（推荐）

```python
from lib.gemini_client import GeminiClient

client = GeminiClient()

# 每个场景独立生成
video_path = client.generate_video(
    prompt=video_prompt,
    start_image="projects/{项目名}/storyboards/scene_E1S1.png",
    aspect_ratio="16:9",
    duration_seconds="8",
    output_path="projects/{项目名}/videos/scene_E1S1.mp4"
)
```

### 延长单个场景（仅当需要超过 8 秒时）

```python
# 先生成初始视频
path, video_ref, video_uri = client.generate_video_with_ref(
    prompt=video_prompt,
    start_image="projects/{项目名}/storyboards/scene_E1S1.png",
    aspect_ratio="16:9",
    duration_seconds="8",
    output_path="projects/{项目名}/videos/scene_E1S1.mp4"
)

# 延长同一个场景（+7秒）
path, video_ref, video_uri = client.extend_video(
    video_ref=video_ref,
    prompt="继续当前动作...",  # 延续同一场景的 prompt
    output_path="projects/{项目名}/videos/scene_E1S1.mp4"
)
```

## 生成前检查

- [ ] 所有场景都有已批准的分镜图
- [ ] 对话文本长度适当
- [ ] 动作描述清晰简单
- [ ] GEMINI_API_KEY 已设置

## 质量检查清单

批准视频前检查：
- [ ] 视频从分镜图平滑过渡
- [ ] 人物动作符合动作描述
- [ ] 对话音频清晰（如适用）
- [ ] 时长适合场景内容
