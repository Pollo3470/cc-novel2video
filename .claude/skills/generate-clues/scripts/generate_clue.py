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

from lib.gemini_client import GeminiClient
from lib.project_manager import ProjectManager


def build_prop_prompt(name: str, description: str) -> str:
    """
    构建道具类线索的 prompt

    Args:
        name: 线索名称
        description: 线索描述

    Returns:
        完整的 prompt 字符串
    """
    prompt = f"""一张专业的概念设计参考图，展示一个重要道具。

道具名称：{name}
道具描述：{description}

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

重点突出道具的独特特征，使其在不同场景中易于识别。"""

    return prompt


def build_location_prompt(name: str, description: str) -> str:
    """
    构建环境类线索的 prompt

    Args:
        name: 线索名称
        description: 线索描述

    Returns:
        完整的 prompt 字符串
    """
    prompt = f"""一张专业的场景设计参考图，展示一个标志性环境元素。

环境名称：{name}
环境描述：{description}

图像布局（16:9 横屏）：
- 主画面（占 3/4）：环境整体视图，展示完整外观和氛围
- 右下角小图（占 1/4）：标志性特征细节特写

风格要求：
- 光线柔和自然
- 氛围与描述一致
- 突出标志性特征（便于在不同场景中识别）
- 专业概念设计品质

重点突出环境的独特视觉特征，使其在不同时间和天气条件下仍可识别。"""

    return prompt


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

    # 获取线索信息
    clue = pm.get_clue(project_name, clue_name)
    clue_type = clue.get('type', 'prop')
    description = clue.get('description', '')

    if not description:
        raise ValueError(f"线索 '{clue_name}' 的描述为空，请先添加描述")

    # 根据类型选择 prompt 模板
    if clue_type == 'location':
        prompt = build_location_prompt(clue_name, description)
    else:
        prompt = build_prop_prompt(clue_name, description)

    # 生成图片
    client = GeminiClient()
    output_path = project_dir / 'clues' / f"{clue_name}.png"

    # 确保目录存在
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"🎨 正在生成线索设计图: {clue_name}")
    print(f"   类型: {clue_type}")
    print(f"   描述: {description[:50]}..." if len(description) > 50 else f"   描述: {description}")

    image = client.generate_image(
        prompt=prompt,
        aspect_ratio="16:9",
        output_path=output_path
    )

    print(f"✅ 线索设计图已保存: {output_path}")

    # 更新 project.json 中的 clue_sheet 路径
    relative_path = f"clues/{clue_name}.png"
    pm.update_clue_sheet(project_name, clue_name, relative_path)
    print(f"✅ 项目元数据已更新")

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
