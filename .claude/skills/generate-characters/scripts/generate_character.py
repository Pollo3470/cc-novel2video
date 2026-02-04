#!/usr/bin/env python3
"""
Character Generator - 使用 Gemini API 生成人物设计图

Usage:
    python generate_character.py <project_name> <character_name>
    python generate_character.py <project_name> <character_name> --ref <ref_image_path>

Example:
    python generate_character.py my_novel 张三
    python generate_character.py my_novel 张三 --ref characters/ref/actor.png
"""

import argparse
import sys
from pathlib import Path
from typing import Optional, List

from lib.media_generator import MediaGenerator
from lib.project_manager import ProjectManager
from lib.prompt_builders import build_character_prompt


def generate_character(
    project_name: str,
    character_name: str,
    reference_images: Optional[List[Path]] = None
) -> Path:
    """
    生成人物设计图

    Args:
        project_name: 项目名称
        character_name: 人物名称
        reference_images: 参考图片路径列表（可选）

    Returns:
        生成的图片路径
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)

    # 从 project.json 获取人物描述
    project = pm.load_project(project_name)

    description = ""
    style = project.get('style', '')
    style_description = project.get('style_description', '')

    if 'characters' in project and character_name in project['characters']:
        char_info = project['characters'][character_name]
        description = char_info.get('description', '')

    if not description:
        raise ValueError(f"人物 '{character_name}' 的描述为空，请先在 project.json 中添加描述")

    # 构建 prompt
    prompt = build_character_prompt(character_name, description, style, style_description)

    # 生成图片（带自动版本管理）
    generator = MediaGenerator(project_dir)

    print(f"🎨 正在生成人物设计图: {character_name}")
    print(f"   描述: {description[:50]}...")
    if reference_images:
        print(f"   参考图片: {[str(p) for p in reference_images]}")

    output_path, version = generator.generate_image(
        prompt=prompt,
        resource_type="characters",
        resource_id=character_name,
        reference_images=reference_images,
        aspect_ratio="3:4"
    )

    print(f"✅ 人物设计图已保存: {output_path} (版本 v{version})")

    # 更新 project.json 中的 character_sheet 路径
    relative_path = f"characters/{character_name}.png"
    pm.update_project_character_sheet(project_name, character_name, relative_path)
    print("✅ project.json 已更新")

    return output_path


def main():
    parser = argparse.ArgumentParser(description='生成人物设计图')
    parser.add_argument('project', help='项目名称')
    parser.add_argument('character', help='人物名称')
    parser.add_argument('--ref', nargs='+', help='参考图片路径（可多个）')

    args = parser.parse_args()

    try:
        # 处理参考图片路径
        reference_images = None
        if args.ref:
            pm = ProjectManager()
            project_dir = pm.get_project_path(args.project)
            reference_images = []
            for ref_path in args.ref:
                # 支持相对路径和绝对路径
                ref_full_path = Path(ref_path)
                if not ref_full_path.is_absolute():
                    ref_full_path = project_dir / ref_path
                if ref_full_path.exists():
                    reference_images.append(ref_full_path)
                    print(f"📎 添加参考图片: {ref_full_path}")
                else:
                    print(f"⚠️  参考图片不存在: {ref_full_path}")

        output_path = generate_character(
            args.project,
            args.character,
            reference_images=reference_images
        )
        print(f"\n🖼️  请查看生成的图片: {output_path}")

    except Exception as e:
        print(f"❌ 错误: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
