# Storyboard Script JSON Format

Complete schema for storyboard scripts used in manga video generation.

## Full Schema

```json
{
  "episode": 1,
  "title": "剧集标题",
  "duration_seconds": 60,
  "summary": "剧集简介",
  "novel": {
    "title": "小说名称",
    "chapter": "第一章",
    "source_file": "source/chapter_01.txt"
  },
  "characters": {
    "角色名": {
      "description": "详细外貌描述：年龄、性别、发型、服装等",
      "character_sheet": "characters/角色名.png",
      "voice_style": "声音特点描述"
    }
  },
  "scenes": [
    {
      "scene_id": "E1S01",
      "episode": 1,
      "title": "场景标题",
      "scene_type": "剧情 | 空镜",
      "duration_seconds": 8,
      "segment_break": false,
      "characters_in_scene": ["角色名"],
      "clues_in_scene": ["线索名"],
      "visual": {
        "description": "场景的详细视觉描述",
        "shot_type": "wide shot | medium shot | close-up | extreme close-up | aerial",
        "camera_movement": "static | pan left | pan right | tilt up | tilt down | dolly in | dolly out | track",
        "mood": "情绪氛围描述",
        "lighting": "光线描述"
      },
      "action": "角色动作描述",
      "dialogue": {
        "speaker": "角色名",
        "text": "对话内容",
        "emotion": "happy | sad | angry | surprised | neutral | determined | scared"
      },
      "audio": {
        "dialogue": [
          {
            "character": "角色名",
            "line": "对话内容",
            "emotion": "情绪",
            "is_voiceover": false
          }
        ],
        "narration": "旁白内容",
        "sound_effects": ["音效1", "音效2"]
      },
      "transition_to_next": "cut | fade | dissolve | wipe",
      "generated_assets": {
        "storyboard_grid": "storyboards/grid_001.png",
        "storyboard_image": "storyboards/scene_E1S01.png",
        "video_clip": "videos/scene_E1S01.mp4",
        "video_uri": null,
        "status": "pending | in_progress | storyboard_ready | completed"
      }
    }
  ],
  "metadata": {
    "created_at": "ISO8601 timestamp",
    "updated_at": "ISO8601 timestamp",
    "total_scenes": 0,
    "estimated_duration_seconds": 0,
    "status": "draft | reviewed | in_production | completed"
  }
}
```

## Field Descriptions

### 顶层字段（Episode Level）
- `episode`: 集数编号（整数）
- `title`: 剧集标题
- `duration_seconds`: 剧集总时长（秒）
- `summary`: 剧集简介

### novel
- `title`: 小说/故事标题
- `chapter`: 当前章节名称
- `source_file`: 源文件相对路径

### characters
以角色名为 key 的对象：
- `description`: 用于图片生成的详细外貌描述
- `character_sheet`: 人物设计图路径（生成后填入）
- `voice_style`: Veo 视频生成时的声音风格提示

### scenes[].场景字段
- `scene_id`: 场景唯一标识（格式：E{episode}S{sequence}，如 E1S01）
- `episode`: 所属集数
- `title`: 场景标题
- `scene_type`: 场景类型（"剧情" 或 "空镜"）
- `duration_seconds`: 场景时长（秒，默认 8）
- `segment_break`: 是否为分段点（用于视频拼接时的转场）
- `characters_in_scene`: 出场人物列表
- `clues_in_scene`: 场景中的重要线索列表

### scenes[].visual
- `description`: 场景环境的叙述性描述
- `shot_type`: 镜头类型
- `camera_movement`: 镜头运动方式
- `mood`: 色调和情绪氛围
- `lighting`: 光线条件

### scenes[].dialogue
简单对话格式（单个说话者）：
- `speaker`: 说话者（必须在 characters 中定义）
- `text`: 对话文本（用于 Veo 音频生成）
- `emotion`: 情绪标签

### scenes[].audio
复杂音频格式：
- `dialogue`: 对话数组（支持多人对话和画外音）
  - `character`: 说话者
  - `line`: 对话内容
  - `emotion`: 情绪
  - `is_voiceover`: 是否为画外音
- `narration`: 旁白内容
- `sound_effects`: 音效列表

### scenes[].generated_assets
追踪生成进度：
- `storyboard_grid`: 多宫格分镜图路径
- `storyboard_image`: 单独场景分镜图路径
- `video_clip`: 视频片段路径
- `video_uri`: Veo 视频 URI（用于 extend 功能）
- `status`: 当前状态

### Status 状态值

| 状态值 | 说明 |
|-------|------|
| `pending` | 未开始 |
| `in_progress` | 处理中（有 storyboard_grid 但无 storyboard_image） |
| `storyboard_ready` | 分镜图完成（有 storyboard_image 但无 video_clip） |
| `completed` | 视频完成 |

## Example Scene

```json
{
  "scene_id": "E1S03",
  "episode": 1,
  "title": "接过襁褓",
  "scene_type": "剧情",
  "duration_seconds": 8,
  "segment_break": false,
  "characters_in_scene": ["姜月茴"],
  "clues_in_scene": ["锦缎襁褓"],
  "visual": {
    "description": "姜府内厅，雕梁画栋，姜月茴穿着淡青色绣花罗裙，带着期待的眼神接过锦缎襁褓",
    "shot_type": "medium shot",
    "camera_movement": "static",
    "lighting": "室内柔和光线",
    "mood": "期待、好奇"
  },
  "action": "姜月茴小心翼翼接过襁褓，嘴角微微上扬，开始解开锦缎",
  "dialogue": {
    "speaker": "",
    "text": "",
    "emotion": "neutral"
  },
  "audio": {
    "dialogue": [],
    "narration": "边关来的...是他的消息吗？",
    "sound_effects": ["脚步声", "锦缎摩擦声"]
  },
  "transition_to_next": "cut",
  "generated_assets": {
    "storyboard_grid": "storyboards/grid_001.png",
    "storyboard_image": "storyboards/scene_E1S03.png",
    "video_clip": null,
    "video_uri": null,
    "status": "storyboard_ready"
  }
}
```

## 数据结构标准化

生成剧本后，建议调用 `ProjectManager.normalize_script()` 方法确保数据结构完整：

```python
from lib.project_manager import ProjectManager

pm = ProjectManager()
pm.normalize_script(project_name, script_filename)
```

该方法会自动补全所有缺失的字段。
