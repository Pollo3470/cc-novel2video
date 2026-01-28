# Storyboard Script JSON Format

Complete schema for storyboard scripts used in manga video generation.

## 内容模式

系统支持两种内容模式，通过 `content_mode` 字段区分：

| 模式 | content_mode | 数据结构 | 说明 |
|------|--------------|----------|------|
| 说书+画面（默认） | `narration` | `segments` | 保留原文，后期人工配音 |
| 剧集动画 | `drama` | `scenes` | 改编剧本，演员对话 |

---

## 说书模式 Schema（segments）

适用于 `content_mode: "narration"` 的项目。

```json
{
  "episode": 1,
  "title": "剧集标题",
  "content_mode": "narration",
  "duration_seconds": 60,
  "summary": "剧集简介",
  "novel": {
    "title": "小说名称",
    "chapter": "第一章",
    "source_file": "source/chapter_01.txt"
  },
  "characters_in_episode": ["角色名1", "角色名2"],
  "clues_in_episode": ["线索名1", "线索名2"],
  "segments": [
    {
      "segment_id": "E1S01",
      "episode": 1,
      "duration_seconds": 4,
      "segment_break": false,

      "novel_text": "小说原文内容（用于后期人工配音，不参与视频生成）",

      "characters_in_segment": ["角色名"],
      "clues_in_segment": ["线索名"],

      "image_prompt": "分镜图生成 Prompt（叙述性描述，直接用于 Gemini API）",
      "video_prompt": "视频生成 Prompt（包含动作、对话、音效，直接用于 Veo API）",

      "transition_to_next": "cut | fade | dissolve | wipe",

      "generated_assets": {
        "storyboard_image": "storyboards/scene_E1S01.png",
        "video_clip": "videos/scene_E1S01.mp4",
        "video_uri": null,
        "status": "pending | storyboard_ready | completed"
      }
    }
  ],
  "metadata": {
    "created_at": "ISO8601 timestamp",
    "updated_at": "ISO8601 timestamp",
    "total_segments": 0,
    "estimated_duration_seconds": 0,
    "status": "draft | reviewed | in_production | completed"
  }
}
```

### segments[] 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `segment_id` | string | 片段唯一标识（格式：E{episode}S{sequence}） |
| `duration_seconds` | int | 片段时长（仅支持 4/6/8 秒，默认 4 秒） |
| `novel_text` | string | **小说原文**（用于后期人工配音，不参与视频生成） |
| `image_prompt` | string | **分镜图 Prompt**（叙述性描述，直接用于 Gemini 图像生成 API） |
| `video_prompt` | string | **视频 Prompt**（包含动作、对话、音效，直接用于 Veo API） |
| `characters_in_segment` | array | 本片段出现的角色名列表 |
| `clues_in_segment` | array | 本片段出现的线索名列表 |

### 说书模式示例

```json
{
  "segment_id": "E1S03",
  "episode": 1,
  "duration_seconds": 4,
  "segment_break": false,
  "novel_text": ""夫人，这是侯爷的亲笔信。"老管家恭敬地递上一封火漆封印的书信。",
  "characters_in_segment": ["姜月茴", "老管家"],
  "clues_in_segment": ["书信"],
  "image_prompt": "姜府内厅，雕梁画栋的古典建筑。中景镜头，姜月茴穿着淡青色绣花罗裙，端坐于檀木椅上。老管家躬身递上一封火漆封印的书信，姜月茴伸手接过，眼神中带着期待。午后柔和的自然光从窗外洒入，营造出庄重而温馨的氛围。",
  "video_prompt": "中景镜头，姜府内厅。老管家躬身向前，恭敬地递上书信。姜月茴伸手接过，嘴角微微上扬。老管家（恭敬地）说道："夫人，这是侯爷的亲笔信。" 纸张轻微翻动声，脚步声。镜头静态，柔和自然光。",
  "transition_to_next": "cut",
  "generated_assets": {
    "storyboard_image": null,
    "video_clip": null,
    "video_uri": null,
    "status": "pending"
  }
}
```

---

## 剧集动画模式 Schema（scenes）

适用于 `content_mode: "drama"` 的项目。

```json
{
  "episode": 1,
  "title": "剧集标题",
  "content_mode": "drama",
  "duration_seconds": 60,
  "summary": "剧集简介",
  "novel": {
    "title": "小说名称",
    "chapter": "第一章",
    "source_file": "source/chapter_01.txt"
  },
  "characters_in_episode": ["角色名1", "角色名2"],
  "clues_in_episode": ["线索名1", "线索名2"],
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

      "image_prompt": "分镜图生成 Prompt（叙述性描述，直接用于 Gemini API）",
      "video_prompt": "视频生成 Prompt（包含动作、对话、旁白、音效，直接用于 Veo API）",

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
- `content_mode`: 内容模式（`narration` 或 `drama`）
- `duration_seconds`: 剧集总时长（秒）
- `summary`: 剧集简介

### novel
- `title`: 小说/故事标题
- `chapter`: 当前章节名称
- `source_file`: 源文件相对路径

### characters_in_episode
出现在本集的角色名列表（字符串数组）。

**注意**: 角色的完整定义（description、character_sheet、voice_style）存储在项目级的 `project.json` 文件中，而不是 episode JSON。

### clues_in_episode
出现在本集的线索名列表（字符串数组）。

**注意**: 线索的完整定义（type、description、importance、clue_sheet）存储在项目级的 `project.json` 文件中。

### segments[]/scenes[] 核心字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `segment_id` / `scene_id` | string | 唯一标识（格式：E{episode}S{sequence}） |
| `episode` | int | 所属集数 |
| `duration_seconds` | int | 时长（秒，说书模式默认 4，剧集模式默认 8） |
| `segment_break` | bool | 是否为分段点（用于视频拼接时的转场） |
| `characters_in_segment/scene` | array | 出场人物列表 |
| `clues_in_segment/scene` | array | 场景中的重要线索列表 |
| `image_prompt` | string | **分镜图 Prompt**（直接用于 Gemini 图像生成 API） |
| `video_prompt` | string | **视频 Prompt**（直接用于 Veo API） |
| `transition_to_next` | string | 转场类型 |

### Prompt 字段设计指南

#### image_prompt 设计指南

> **核心原则**: 描述场景，而非简单罗列关键词。叙述性的描述段落几乎总是比零散的词汇列表产生更好、更连贯的图像。

**结构模板**:
```
[场景环境的叙述性描述]。[镜头类型]，[人物名称][穿着/姿态的具体描述]。
[人物正在做什么的动作描述]。[重要线索/道具的具体描述]。
[光线来源和质感]，营造出[情绪氛围]的氛围。
```

**要素清单**:
1. 场景环境描述（叙述性，非关键词）
2. 镜头类型和构图（如 `close-up portrait`、`wide shot`、`medium shot`）
3. 人物外观、姿态、表情（使用人物名称，系统自动附加 character_sheet）
4. 重要道具/线索（使用线索名称，系统自动附加 clue_sheet）
5. 光线和色调（如 `soft golden hour light`、`柔和的自然光`）
6. 情绪氛围

**注意**:
- 画面比例不写入 prompt，通过 API 参数 `aspect_ratio` 设置
- 人物/线索名称直接使用，代码自动附加参考图

#### video_prompt 设计指南

**核心要素**:

| 要素 | 说明 | 示例 |
|------|------|------|
| **主体** | 视频中的对象 | 姜月茴、老管家 |
| **动作** | 主体的行为 | 躬身递信、伸手接过 |
| **镜头构图** | 镜头取景方式 | 中景、特写、广角 |
| **镜头运动** | 相机移动方式 | 静态、缓慢推进、跟踪镜头 |
| **氛围** | 色彩和光线 | 柔和自然光、暖色调 |

**音频 Prompt 技巧**:

| 类型 | 写法 | 示例 |
|------|------|------|
| **对话** | 使用引号，注明说话方式 | `老管家（恭敬地）说道："夫人，这是侯爷的亲笔信。"` |
| **音效** | 明确描述声音 | `纸张翻动声，脚步声轻响` |
| **环境音** | 描述环境声景 | `背景中传来隐约的鸟鸣` |

**结构顺序**:
1. 开场: 镜头类型 + 场景环境
2. 动作: 人物具体动作的动态描述
3. 对话: `角色名（情绪/语气）说道："对话内容"`
4. 音效: 自然融入的声音描述
5. 镜头运动: 相机移动方式
6. 氛围: 光线和情绪

**模式差异**:

| 模式 | 对话处理 | 旁白处理 |
|------|---------|---------|
| **说书模式 (narration)** | 仅当 novel_text 有角色对话时写入 | 不写入（后期人工配音） |
| **剧集动画模式 (drama)** | 所有对话都写入 | 可写入内心独白 |

**负面提示 (Negative Prompt)**:
- 代码自动添加 `negative_prompt: "background music, BGM, soundtrack"`
- 不使用指令性语言（如 `No walls`），直接描述不想要的元素

### generated_assets
追踪生成进度：
- `storyboard_grid`: 多宫格分镜图路径（仅 drama 模式使用）
- `storyboard_image`: 单独场景分镜图路径
- `video_clip`: 视频片段路径
- `video_uri`: Veo 视频 URI（用于 extend 功能）
- `status`: 当前状态

### 说书模式 vs 剧集动画模式的 generated_assets 差异

| 字段 | narration 模式 | drama 模式 |
|------|---------------|------------|
| `storyboard_grid` | **不使用** | 多宫格图路径 |
| `storyboard_image` | 分镜图路径（9:16 竖屏） | 分镜图路径（16:9 横屏） |
| `video_clip` | 视频路径 | 视频路径 |
| `status` | pending → storyboard_ready → completed | pending → in_progress → storyboard_ready → completed |

> **注意**：narration 模式的 segments 结构中不包含 `storyboard_grid` 字段，直接生成分镜图。

### Status 状态值

| 状态值 | 说明 |
|-------|------|
| `pending` | 未开始 |
| `in_progress` | 处理中（仅 drama 模式：有 storyboard_grid 但无 storyboard_image） |
| `storyboard_ready` | 分镜图完成（有 storyboard_image 但无 video_clip） |
| `completed` | 视频完成 |

## Example Scene (drama 模式)

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
  "image_prompt": "姜府内厅，雕梁画栋的古典建筑，檀木家具散发着岁月的光泽。中景镜头，姜月茴穿着淡青色绣花罗裙，带着期待的眼神，双手小心翼翼地接过锦缎襁褓。她的表情柔和中带着好奇，阳光从雕花窗棂洒入，在地面投下斑驳光影。室内柔和光线，期待与好奇的氛围。",
  "video_prompt": "中景镜头，姜府内厅。姜月茴小心翼翼地接过锦缎襁褓，嘴角微微上扬，开始解开锦缎。内心独白："边关来的...是他的消息吗？" 脚步声，锦缎摩擦声。镜头缓缓推进，室内柔和光线，期待好奇的氛围。",
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

## 数据流与验证

### 数据分层原则

| 层级 | 存储内容 | 示例 |
|------|---------|------|
| `project.json` | 角色/线索的**完整定义** | `characters: {"姜月茴": {"description": "...", "character_sheet": "..."}}` |
| `episode_N.json` | 本集出现的**名称列表** | `characters_in_episode: ["姜月茴", "裴与"]` |
| `segments[]/scenes[]` | 本场景出现的**名称列表** | `characters_in_segment: ["姜月茴"]` |

**重要原则**：
- 角色和线索的 description、character_sheet、voice_style 等属性**只存储在 project.json**
- episode 和 scene/segment 级别仅存储引用（名称列表）
- 不存在从 episode 到 project.json 的"同步"机制，角色和线索必须在 Step 3 直接写入 project.json

### 数据验证

生成剧本后，**必须**调用数据验证工具检查数据完整性和引用一致性：

```python
from lib.data_validator import validate_project, validate_episode

# 验证 project.json
result = validate_project(project_name)
if not result.valid:
    print(f"❌ project.json 验证失败:\n{result}")

# 验证 episode JSON
result = validate_episode(project_name, script_filename)
if not result.valid:
    print(f"❌ 剧本验证失败:\n{result}")
```

### 验证规则

**project.json 验证**：
- `title`：必须存在且非空
- `content_mode`：必须是 `"narration"` 或 `"drama"`
- `style`：必须存在且非空
- `characters[name].description`：必须存在且非空
- `clues[name].type`：必须是 `"prop"` 或 `"location"`
- `clues[name].description`：必须存在且非空
- `clues[name].importance`：必须是 `"major"` 或 `"minor"`

**episode JSON 验证**：
- **引用一致性**：
  - `characters_in_episode` 中每个名称必须存在于 project.json 的 `characters`
  - `clues_in_episode` 中每个名称必须存在于 project.json 的 `clues`
  - `characters_in_segment/scene` 必须是 `characters_in_episode` 的子集
  - `clues_in_segment/scene` 必须是 `clues_in_episode` 的子集
- **字段完整性**：segment_id/scene_id、image_prompt、video_prompt 等必填字段


