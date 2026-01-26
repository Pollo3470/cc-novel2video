#!/usr/bin/env python3
"""
Character Generator - 使用 Gemini API 生成人物设计图

Usage:
    python generate_character.py <project_name> <character_name>

Example:
    python generate_character.py my_novel 张三
"""

import argparse
import sys
from pathlib import Path

from lib.gemini_client import GeminiClient
from lib.project_manager import ProjectManager


def build_character_prompt(name: str, description: str, style: str = "") -> str:
    """
    构建人物设计图生成 prompt

    Args:
        name: 人物名称
        description: 人物描述
        style: 项目整体风格

    Returns:
        完整的 prompt 字符串
    """
    style_text = f"\n- {style}" if style else ""

    prompt = f"""一张专业的漫画/动漫风格人物设计图。

人物：{name}
描述：{description}

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

注重让人物设计独特且令人印象深刻，适合视觉叙事。"""

    return prompt


def generate_character(
    project_name: str,
    character_name: str
) -> Path:
    """
    生成人物设计图

    Args:
        project_name: 项目名称
        character_name: 人物名称

    Returns:
        生成的图片路径
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)

    # 从 project.json 获取人物描述
    project = pm.load_project(project_name)

    description = ""
    style = project.get('style', '')

    if 'characters' in project and character_name in project['characters']:
        char_info = project['characters'][character_name]
        description = char_info.get('description', '')

    if not description:
        raise ValueError(f"人物 '{character_name}' 的描述为空，请先在 project.json 中添加描述")

    # 构建 prompt
    prompt = build_character_prompt(character_name, description, style)

    # 生成图片
    client = GeminiClient()
    output_path = project_dir / 'characters' / f"{character_name}.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"🎨 正在生成人物设计图: {character_name}")
    print(f"   描述: {description[:50]}...")

    client.generate_image(
        prompt=prompt,
        aspect_ratio="16:9",
        output_path=output_path
    )

    print(f"✅ 人物设计图已保存: {output_path}")

    # 更新 project.json 中的 character_sheet 路径
    relative_path = f"characters/{character_name}.png"
    pm.update_project_character_sheet(project_name, character_name, relative_path)
    print("✅ project.json 已更新")

    return output_path


def main():
    parser = argparse.ArgumentParser(description='生成人物设计图')
    parser.add_argument('project', help='项目名称')
    parser.add_argument('character', help='人物名称')

    args = parser.parse_args()

    try:
        output_path = generate_character(
            args.project,
            args.character
        )
        print(f"\n🖼️  请查看生成的图片: {output_path}")

    except Exception as e:
        print(f"❌ 错误: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
