#!/usr/bin/env python3
"""
Clue Generator - 使用 Gemini API 生成线索设计图

Usage:
    python generate_clue.py <project_name> --all
    python generate_clue.py <project_name> --clue "玉佩"
    python generate_clue.py <project_name> --list

Example:
    python generate_clue.py my_novel --all
    python generate_clue.py my_novel --clue "老槐树"
"""

import argparse
import sys
from pathlib import Path

from lib.media_generator import MediaGenerator
from lib.project_manager import ProjectManager
from lib.prompt_builders import build_clue_prompt


def generate_clue(
    project_name: str,
    clue_name: str
) -> Path:
    """
    生成线索设计图

    Args:
        project_name: 项目名称
        clue_name: 线索名称

    Returns:
        生成的图片路径
    """
    pm = ProjectManager()
    project_dir = pm.get_project_path(project_name)

    # 获取项目信息和风格
    project = pm.load_project(project_name)
    style = project.get('style', '')
    style_description = project.get('style_description', '')

    # 获取线索信息
    clue = pm.get_clue(project_name, clue_name)
    clue_type = clue.get('type', 'prop')
    description = clue.get('description', '')

    if not description:
        raise ValueError(f"线索 '{clue_name}' 的描述为空，请先添加描述")

    # 使用共享库构建 prompt（确保与 WebUI 侧一致）
    prompt = build_clue_prompt(clue_name, description, clue_type, style, style_description)

    # 生成图片（带自动版本管理）
    generator = MediaGenerator(project_dir)

    print(f"🎨 正在生成线索设计图: {clue_name}")
    print(f"   类型: {clue_type}")
    print(f"   描述: {description[:50]}..." if len(description) > 50 else f"   描述: {description}")

    output_path, version = generator.generate_image(
        prompt=prompt,
        resource_type="clues",
        resource_id=clue_name,
        aspect_ratio="16:9"
    )

    print(f"✅ 线索设计图已保存: {output_path} (版本 v{version})")

    # 更新 project.json 中的 clue_sheet 路径
    relative_path = f"clues/{clue_name}.png"
    pm.update_clue_sheet(project_name, clue_name, relative_path)
    print("✅ 项目元数据已更新")

    return output_path


def list_pending_clues(project_name: str) -> None:
    """
    列出待生成的线索

    Args:
        project_name: 项目名称
    """
    pm = ProjectManager()
    pending = pm.get_pending_clues(project_name)

    if not pending:
        print(f"✅ 项目 '{project_name}' 中所有重要线索都已有设计图")
        return

    print(f"\n📋 待生成的线索 ({len(pending)} 个):\n")
    for clue in pending:
        clue_type = clue.get('type', 'prop')
        type_emoji = "📦" if clue_type == 'prop' else "🏠"
        print(f"  {type_emoji} {clue['name']}")
        print(f"     类型: {clue_type}")
        print(f"     描述: {clue.get('description', '')[:60]}...")
        print()


def generate_all_clues(project_name: str) -> tuple:
    """
    生成所有待处理的线索

    Args:
        project_name: 项目名称

    Returns:
        (成功数, 失败数)
    """
    pm = ProjectManager()
    pending = pm.get_pending_clues(project_name)

    if not pending:
        print(f"✅ 项目 '{project_name}' 中所有重要线索都已有设计图")
        return (0, 0)

    print(f"\n🚀 开始生成 {len(pending)} 个线索设计图...\n")

    success_count = 0
    fail_count = 0

    for clue in pending:
        try:
            generate_clue(project_name, clue['name'])
            success_count += 1
            print()
        except Exception as e:
            print(f"❌ 生成 '{clue['name']}' 失败: {e}")
            fail_count += 1
            print()

    print(f"\n{'=' * 40}")
    print(f"生成完成!")
    print(f"   ✅ 成功: {success_count}")
    print(f"   ❌ 失败: {fail_count}")
    print(f"{'=' * 40}")

    return (success_count, fail_count)


def main():
    parser = argparse.ArgumentParser(description='生成线索设计图')
    parser.add_argument('project', help='项目名称')
    parser.add_argument('--all', action='store_true', help='生成所有待处理的线索')
    parser.add_argument('--clue', help='指定线索名称')
    parser.add_argument('--list', action='store_true', help='列出待生成的线索')

    args = parser.parse_args()

    try:
        if args.list:
            list_pending_clues(args.project)
        elif args.all:
            success, fail = generate_all_clues(args.project)
            sys.exit(0 if fail == 0 else 1)
        elif args.clue:
            output_path = generate_clue(args.project, args.clue)
            print(f"\n🖼️  请查看生成的图片: {output_path}")
        else:
            parser.print_help()
            print("\n❌ 请指定 --all、--clue 或 --list")
            sys.exit(1)

    except Exception as e:
        print(f"❌ 错误: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
