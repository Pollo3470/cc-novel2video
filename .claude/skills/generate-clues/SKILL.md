---
name: generate-clues
description: 使用 Gemini 图像生成 API 为漫剧视频生成线索设计图。使用场景：(1) 用户需要为项目生成线索参考图，(2) 用户运行 /generate-clues 命令，(3) project.json 中有 importance='major' 的线索没有 clue_sheet 路径。生成一致的线索设计用于分镜和视频生成。
---

# 生成线索设计图

使用 Gemini 3 Pro Image API 创建线索设计图，确保整个视频中重要物品和环境的视觉一致性。

## 概述

线索（clues）是需要在多个场景中保持一致的重要元素，包括：
- **道具类（prop）**：信物、武器、信件、首饰等关键物品
- **环境类（location）**：标志性建筑、特定树木、重要场所等

## 工作流程

1. **加载项目元数据**
   - 如未指定项目名称，询问用户
   - 从 `projects/{项目名}/project.json` 加载项目数据
   - 列出 `importance='major'` 且没有 `clue_sheet` 的线索

2. **生成线索设计**
   - 对于每个待生成的线索：
     - 根据类型（prop/location）选择对应的 prompt 模板
     - 运行 `.claude/skills/generate-clues/scripts/generate_clue.py`
     - 保存到 `projects/{项目名}/clues/`

3. **审核检查点**
   - 展示每张生成的线索图
   - 询问用户是否批准或重新生成
   - 允许调整描述

4. **更新项目元数据**
   - 更新 project.json 中的 `clue_sheet` 路径
   - 同步项目状态

## 命令格式

```bash
# 生成所有待处理的线索
python .claude/skills/generate-clues/scripts/generate_clue.py <项目名> --all

# 生成指定线索
python .claude/skills/generate-clues/scripts/generate_clue.py <项目名> --clue "玉佩"

# 列出待生成的线索
python .claude/skills/generate-clues/scripts/generate_clue.py <项目名> --list
```

## Prompt 模板

### 道具类（prop）

```
一张专业的概念设计参考图，展示一个重要道具。

道具名称：[名称]
道具描述：[详细描述]

图像布局（16:9 横屏）：
- 左侧：道具正面全视图，干净背景
- 中间：道具 45 度侧视图，展示立体感
- 右侧：关键细节特写（纹理、标记、特殊部位）

风格要求：
- 干净的纯色背景（浅灰或白色）
- 高清细节，适合作为视觉参考
- 光线均匀，无强烈阴影
- 专业概念设计品质
- 色彩准确，符合描述

重点突出道具的独特特征，使其在不同场景中易于识别。
```

### 环境类（location）

```
一张专业的场景设计参考图，展示一个标志性环境元素。

环境名称：[名称]
环境描述：[详细描述]

图像布局（16:9 横屏）：
- 主画面（占 3/4）：环境整体视图，展示完整外观和氛围
- 右下角小图（占 1/4）：标志性特征细节特写

风格要求：
- 光线柔和自然
- 氛围与描述一致
- 突出标志性特征（便于在不同场景中识别）
- 专业概念设计品质

重点突出环境的独特视觉特征，使其在不同时间和天气条件下仍可识别。
```

## API 使用

使用 `lib/gemini_client.py`：

```python
from lib.gemini_client import GeminiClient

client = GeminiClient()
image = client.generate_image(
    prompt=clue_prompt,
    aspect_ratio="16:9",
    output_path=f"projects/{项目名}/clues/{线索名}.png"
)
```

## 质量检查清单

### 道具类

批准道具设计前检查：
- [ ] 三个视角清晰一致
- [ ] 细节符合描述（颜色、材质、尺寸）
- [ ] 特殊标记或纹理清晰可见
- [ ] 整体风格与项目一致

### 环境类

批准环境设计前检查：
- [ ] 整体构图符合描述
- [ ] 标志性特征突出
- [ ] 光线和氛围合适
- [ ] 细节图清晰可辨

## 线索管理

### 添加新线索

在 Claude 对话中添加线索：

```
请为项目添加一个新线索：
- 名称：玉佩
- 类型：prop
- 描述：一块翠绿色的祖传玉佩，约拇指大小，雕刻着莲花纹样，系着红色丝绳
- 重要程度：major
```

或直接编辑 `project.json`：

```json
{
  "clues": {
    "玉佩": {
      "type": "prop",
      "description": "一块翠绿色的祖传玉佩，约拇指大小，雕刻着莲花纹样，系着红色丝绳",
      "importance": "major",
      "clue_sheet": ""
    }
  }
}
```

### 在场景中使用线索

在剧本的场景中添加 `clues_in_scene` 字段：

```json
{
  "scene_id": "E1S3",
  "characters_in_scene": ["姜月茴"],
  "clues_in_scene": ["玉佩", "老槐树"],
  "visual": {
    "description": "姜月茴站在老槐树下，手中紧握着玉佩..."
  }
}
```

生成分镜时，线索的 `clue_sheet` 会自动作为参考图传入 API。
