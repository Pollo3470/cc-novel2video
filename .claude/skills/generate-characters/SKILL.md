---
name: generate-characters
description: 使用 Gemini 图像生成 API 为漫剧视频生成人物设计图。使用场景：(1) 用户需要为项目生成人物参考图，(2) 用户运行 /generate-characters 命令，(3) 剧本中有人物没有 character_sheet 路径。生成一致的人物设计用于分镜和视频生成。
---

# 生成人物设计图

使用 Gemini 3 Pro Image API 创建人物设计图，确保整个视频中的视觉一致性。

## 工作流程

1. **加载项目剧本**
   - 如未指定项目名称，询问用户
   - 从 `projects/{项目名}/scripts/` 加载剧本 JSON
   - 列出没有 `character_sheet` 路径的人物

2. **生成人物设计**
   - 对于每个人物：
     - 根据描述构建详细的 prompt
     - 运行 `.claude/skills/generate-characters/scripts/generate_character.py`
     - 保存到 `projects/{项目名}/characters/`

3. **审核检查点**
   - 展示每张生成的人物图
   - 询问用户是否批准或重新生成
   - 允许调整描述

4. **更新剧本**
   - 更新剧本 JSON 中的 `character_sheet` 路径
   - 保存更新后的剧本

## 人物设计 Prompt 模板

```
一张专业的漫画/动漫风格人物设计图。

人物：[人物名称]
描述：[人物描述]

图像展示人物的三个视角，垂直排列：
1. 正面全身（面向镜头）
2. 3/4 侧面（展示立体感）
3. 侧面轮廓（展示剪影）

风格要求：
- 干净的纯色背景（浅灰或白色）
- 三个视角比例一致
- 清晰的面部特征和表情
- 详细的服装和配饰
- 专业概念设计品质
- 适合竖屏视频格式（9:16）

注重让人物设计独特且令人印象深刻，适合视觉叙事。
```

## API 使用

使用 `lib/gemini_client.py`：

```python
from lib.gemini_client import GeminiClient

client = GeminiClient()
image = client.generate_image(
    prompt=character_prompt,
    aspect_ratio="9:16",
    output_path=f"projects/{项目名}/characters/{人物名}.png"
)
```

## 质量检查清单

批准人物设计前检查：
- [ ] 三个视角中面部清晰一致
- [ ] 服装符合描述
- [ ] 颜色鲜明易识别
- [ ] 整体风格适合故事类型
