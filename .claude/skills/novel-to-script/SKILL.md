---
name: novel-to-script
description: 将小说/故事文本转换为漫剧视频的分镜剧本。使用场景：(1) 用户有小说需要转换为视觉分镜格式，(2) 用户运行 /novel-to-script 命令，(3) 用户想从文字内容创建漫剧视频。输出包含场景、人物、对话和视觉描述的 JSON 格式剧本。
---

# 小说转剧本

作为一个专业的短视频编剧，你可以将小说文本转换为结构化的分镜剧本，用于 AI 漫剧视频生成。

## 工作流程

1. **确认项目和源文件**
   - 如未指定项目名称，询问用户
   - 列出 `projects/{项目名}/source/` 中的文件
   - 确认要处理的文件/章节

2. **分析小说内容**
   - 阅读小说文本
   - 提取人物列表及外貌描述
   - 识别场景切换点（地点、时间、氛围变化）
   - 提取对话和动作

3. **生成分镜剧本**
   - 使用 Claude 的分析能力直接生成剧本
   - 按照场景拆分小说内容
   - 为每个场景添加视觉描述

4. **审核确认**
   - 展示人物摘要
   - 展示场景数量和简要描述
   - 等待用户确认后保存

5. **保存剧本**
   - 保存到 `projects/{项目名}/scripts/`

## 剧本格式

详见 `references/script_format.md` 获取完整 JSON 结构。

核心结构：
```json
{
  "novel": {"title": "", "chapter": "", "source_file": ""},
  "characters": {"name": {"description": "", "voice_style": ""}},
  "scenes": [{"scene_id": "", "visual": {}, "dialogue": {}, ...}],
  "metadata": {"total_scenes": 0, "status": "draft"}
}
```

## 场景划分指南

- 每个场景目标时长 6-8 秒
- 在地点/时间/氛围变化处切分场景
- 保持动作简单清晰
- 每个场景对话限制在 1-2 句

### 分段标记（segment_break）

为支持连续视频生成，需要在**大的场景切换**处添加 `segment_break: true` 标记：

```json
{
  "scene_id": "E1S5",
  "segment_break": true,
  "visual": { ... }
}
```

**何时添加分段标记：**
- 地点发生重大变化（如从室内到室外）
- 时间跨度较大（如白天到夜晚、隔天）
- 场景氛围剧烈变化（如从紧张到轻松）
- 叙事线切换（如切换到另一个人物视角）

**为何需要分段：**
- 连续视频模式（Veo extend）在同一段内生成连贯音频
- 大的场景切换处自然适合分段
- 最后用 ffmpeg 拼接各段

**注意：**
- 第一个场景不需要标记（默认开始新段）
- 普通的镜头切换不需要标记
- 建议每 10-15 个场景标记一个分段点

## 视觉描述要求

每个场景的 `visual` 字段需包含（参考 Veo prompt guide）：

| 字段 | 说明 | 示例 |
|------|------|------|
| **description** | 主体和环境描述（Subject + Context） | "繁华的夜市街道，两旁摆满了小吃摊位，霓虹灯招牌闪烁" |
| **shot_type** | 镜头构图（Composition） | wide shot, medium shot, close-up, extreme close-up, aerial |
| **camera_movement** | 镜头运动 | static, pan left/right, tilt up/down, dolly in/out, track, handheld |
| **lighting** | 光线条件（Ambiance） | "夜间，霓虹灯和摊位灯光混合" |
| **mood** | 色调和氛围 | "热闹、温馨" |

### 镜头类型说明

| 英文术语 | 中文 | 适用场景 |
|---------|------|---------|
| extreme close-up | 特写 | 情绪、细节 |
| close-up | 近景 | 面部、对话 |
| medium shot | 中景 | 上半身、对话 |
| full shot | 全景 | 全身 |
| wide shot | 远景 | 环境、建立镜头 |
| aerial | 俯瞰 | 鸟瞰视角 |

### 镜头运动说明

| 英文术语 | 中文描述 |
|---------|---------|
| static | 镜头静止 |
| pan left/right | 镜头向左/右平移 |
| tilt up/down | 镜头向上/下倾斜 |
| dolly in/out | 镜头推进/拉远 |
| slow dolly in | 镜头缓缓推进 |
| track | 镜头跟随移动 |
| crane up/down | 镜头升起/降落 |
| handheld | 手持镜头轻微晃动 |

## 对话格式要求

对话是 Veo 3 视频生成的重要音频来源。为确保最佳效果，请遵循以下格式：

### dialogue 字段结构

```json
{
  "dialogue": {
    "speaker": "角色名",
    "text": "对话内容",
    "emotion": "happy | sad | angry | surprised | neutral | determined | scared"
  }
}
```

### emotion 取值说明

| 取值 | 说明 | 适用场景 |
|------|------|---------|
| happy | 开心 | 喜悦、满足、得意 |
| sad | 悲伤 | 失落、难过、遗憾 |
| angry | 愤怒 | 生气、愤慨、不满 |
| surprised | 惊讶 | 意外、震惊、错愕 |
| neutral | 平静 | 陈述、冷淡、无情绪 |
| determined | 坚定 | 决心、自信、笃定 |
| scared | 恐惧 | 害怕、紧张、担忧 |
| cold | 冷淡 | 疏离、拒绝、漠然 |
| proud | 得意 | 骄傲、自满、炫耀 |
| anxious | 焦虑 | 不安、担心、急躁 |

### 对话编写要点

1. **简短清晰**：每句对话控制在 1-2 句话
2. **动作配合**：在 `action` 字段描述说话时的肢体动作
3. **情绪匹配**：`emotion` 应与对话内容和场景氛围一致
4. **内心独白**：如需表现内心想法，对话以 `（心想）` 开头

### 示例

```json
{
  "dialogue": {
    "speaker": "小明",
    "text": "尝尝这个，是这里最有名的糖葫芦",
    "emotion": "happy"
  },
  "action": "小明递给小红一串糖葫芦，小红开心地接过"
}
```

## 音频描述规范

> ⚠️ **重要**：剧本中不描述背景音乐（BGM），只描述对话和音效。

`audio` 字段只包含：
- **sound_effects**：环境音和场景声效
  - 环境音：风声、雨声、城市噪音、自然声等
  - 场景声效：脚步声、门声、物体碰撞声等

`audio` 字段**不包含**：
- `bgm` 或任何背景音乐描述
- 配乐相关内容

> 后期如需添加背景音乐，使用 `/compose-video` 处理。

## 人物提取

每个人物需提取：
- 年龄和性别
- 发型和发色
- 服装和配饰
- 体型和气质
- 声音特征（用于视频对话）

## 剧本规范化

生成剧本后，**必须**调用 `ProjectManager.normalize_script()` 方法确保数据结构完整：

```python
from lib.project_manager import ProjectManager

pm = ProjectManager()
# 生成剧本后调用
pm.normalize_script(project_name, script_filename)
```

该方法会：
1. 补全所有缺失的字段
2. 确保 generated_assets 结构完整
3. 更新统计信息
4. 保存规范化后的剧本

## 场景 ID 命名规范

场景 ID 格式：`E{episode}S{sequence}`

示例：
- `E1S01` - 第 1 集第 1 个场景
- `E1S02` - 第 1 集第 2 个场景
- `E2S01` - 第 2 集第 1 个场景

## 必需字段检查

Claude 生成剧本时必须包含以下字段：

### 顶层必需字段
- `episode`: 集数编号
- `title`: 剧集标题
- `scenes`: 场景数组

### 每个场景必需字段
- `scene_id`: 场景 ID（格式 E{episode}S{sequence}）
- `duration_seconds`: 时长（默认 8 秒）
- `visual.description`: 视觉描述
- `characters_in_scene`: 出场人物列表
- `action`: 动作描述
- `generated_assets`: 生成资源追踪（初始化为空结构）

### generated_assets 初始结构

```json
{
  "storyboard_grid": null,
  "storyboard_image": null,
  "video_clip": null,
  "video_uri": null,
  "status": "pending"
}
```
