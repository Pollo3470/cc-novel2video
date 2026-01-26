#!/usr/bin/env python3
"""
数据迁移脚本：将现有项目的 characters 从剧本迁移到 project.json

使用方法：
    python scripts/migrate_to_project_json.py <项目名>
    python scripts/migrate_to_project_json.py --all  # 迁移所有项目
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime

# 添加 lib 目录到 Python 路径
lib_path = Path(__file__).parent.parent / 'lib'
sys.path.insert(0, str(lib_path))

from project_manager import ProjectManager


def migrate_project(pm: ProjectManager, project_name: str, dry_run: bool = False) -> bool:
    """
    迁移单个项目

    Args:
        pm: ProjectManager 实例
        project_name: 项目名称
        dry_run: 是否只预览不执行

    Returns:
        是否成功
    """
    print(f"\n{'=' * 50}")
    print(f"迁移项目: {project_name}")
    print('=' * 50)

    try:
        project_dir = pm.get_project_path(project_name)
    except FileNotFoundError:
        print(f"  ❌ 项目不存在: {project_name}")
        return False

    # 检查是否已有 project.json
    project_file = project_dir / 'project.json'
    if project_file.exists():
        print(f"  ⚠️  project.json 已存在，跳过迁移")
        print(f"  如需重新迁移，请先删除 {project_file}")
        return True

    # 收集所有剧本中的人物
    scripts_dir = project_dir / 'scripts'
    all_characters = {}
    episodes = []
    script_files = list(scripts_dir.glob('*.json')) if scripts_dir.exists() else []

    if not script_files:
        print(f"  ⚠️  未找到剧本文件")

    for script_file in sorted(script_files):
        print(f"\n  📖 处理剧本: {script_file.name}")

        with open(script_file, 'r', encoding='utf-8') as f:
            script = json.load(f)

        # 提取人物
        characters = script.get('characters', {})
        for name, char_data in characters.items():
            if name not in all_characters:
                all_characters[name] = char_data.copy()
                print(f"      👤 发现人物: {name}")
            else:
                # 合并数据（优先保留有设计图的版本）
                if char_data.get('character_sheet') and not all_characters[name].get('character_sheet'):
                    all_characters[name] = char_data.copy()
                    print(f"      👤 更新人物: {name} (有设计图)")

        # 提取剧集信息
        novel_info = script.get('novel', {})
        scenes_count = len(script.get('scenes', []))

        # 尝试从文件名或内容推断集数
        episode_num = 1
        filename_lower = script_file.stem.lower()
        for i in range(1, 100):
            if f'episode_{i:02d}' in filename_lower or f'episode{i}' in filename_lower:
                episode_num = i
                break
            if f'chapter_{i:02d}' in filename_lower or f'chapter{i}' in filename_lower:
                episode_num = i
                break
            if f'_{i:02d}_' in filename_lower or f'_{i}_' in filename_lower:
                episode_num = i
                break

        episodes.append({
            "episode": episode_num,
            "title": novel_info.get('chapter', script_file.stem),
            "script_file": f"scripts/{script_file.name}",
            "status": "draft",
            "scenes_count": scenes_count
        })
        print(f"      📺 剧集 {episode_num}: {scenes_count} 个场景")

    # 去重并排序剧集
    seen_episodes = {}
    for ep in episodes:
        if ep['episode'] not in seen_episodes:
            seen_episodes[ep['episode']] = ep
    episodes = sorted(seen_episodes.values(), key=lambda x: x['episode'])

    # 构建 project.json
    project_title = project_name
    if script_files:
        with open(script_files[0], 'r', encoding='utf-8') as f:
            first_script = json.load(f)
            project_title = first_script.get('novel', {}).get('title', project_name)

    project_data = {
        "title": project_title,
        "style": "",
        "episodes": episodes,
        "characters": all_characters,
        "clues": {},
        "status": {
            "current_phase": "script",
            "progress": {
                "characters": {"total": len(all_characters), "completed": 0},
                "clues": {"total": 0, "completed": 0},
                "storyboards": {"total": 0, "completed": 0},
                "videos": {"total": 0, "completed": 0}
            }
        },
        "metadata": {
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "migrated_from": "script_based_characters"
        }
    }

    # 统计已完成的人物设计图
    completed_chars = 0
    for name, char_data in all_characters.items():
        sheet = char_data.get('character_sheet')
        if sheet:
            sheet_path = project_dir / sheet
            if sheet_path.exists():
                completed_chars += 1
    project_data['status']['progress']['characters']['completed'] = completed_chars

    # 创建 clues 目录
    clues_dir = project_dir / 'clues'
    if not clues_dir.exists():
        if not dry_run:
            clues_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n  📁 创建目录: clues/")

    print(f"\n  📊 迁移摘要:")
    print(f"      - 人物: {len(all_characters)} 个 ({completed_chars} 个有设计图)")
    print(f"      - 剧集: {len(episodes)} 个")
    print(f"      - 线索: 0 个 (待添加)")

    if dry_run:
        print(f"\n  🔍 预览模式 - 不会实际写入文件")
        print(f"\n  将创建 project.json:")
        print(json.dumps(project_data, ensure_ascii=False, indent=2)[:500] + "...")
    else:
        # 写入 project.json
        with open(project_file, 'w', encoding='utf-8') as f:
            json.dump(project_data, f, ensure_ascii=False, indent=2)
        print(f"\n  ✅ 已创建 project.json")

        # 可选：从剧本中移除 characters 字段（保留原文件备份）
        # 这里我们保留剧本中的 characters 以保持向后兼容
        print(f"  ℹ️  保留剧本中的 characters 字段以保持向后兼容")

    return True


def main():
    parser = argparse.ArgumentParser(description='迁移项目数据到 project.json')
    parser.add_argument('project', nargs='?', help='项目名称，或使用 --all 迁移所有项目')
    parser.add_argument('--all', action='store_true', help='迁移所有项目')
    parser.add_argument('--dry-run', action='store_true', help='预览模式，不实际执行')
    parser.add_argument('--projects-root', default=None, help='项目根目录')

    args = parser.parse_args()

    if not args.project and not args.all:
        parser.print_help()
        print("\n❌ 请指定项目名称或使用 --all")
        sys.exit(1)

    # 初始化 ProjectManager
    pm = ProjectManager(projects_root=args.projects_root)

    print("🚀 开始迁移...")
    print(f"   项目根目录: {pm.projects_root}")

    if args.dry_run:
        print("   📋 预览模式已启用")

    success_count = 0
    fail_count = 0

    if args.all:
        projects = pm.list_projects()
        print(f"   发现 {len(projects)} 个项目")

        for project_name in projects:
            if migrate_project(pm, project_name, dry_run=args.dry_run):
                success_count += 1
            else:
                fail_count += 1
    else:
        if migrate_project(pm, args.project, dry_run=args.dry_run):
            success_count = 1
        else:
            fail_count = 1

    print("\n" + "=" * 50)
    print("迁移完成!")
    print(f"   ✅ 成功: {success_count}")
    print(f"   ❌ 失败: {fail_count}")
    print("=" * 50)

    sys.exit(0 if fail_count == 0 else 1)


if __name__ == '__main__':
    main()
