"""
清理现有项目中的冗余字段

此脚本用于迁移现有数据，移除已改为读时计算的冗余字段。
运行前请确保已备份数据。

用法:
    python scripts/migrate_clean_redundant_fields.py
    python scripts/migrate_clean_redundant_fields.py --dry-run  # 仅预览不修改
"""

import json
import argparse
from pathlib import Path


def migrate_project(project_dir: Path, dry_run: bool = False) -> dict:
    """
    清理单个项目的冗余字段

    Args:
        project_dir: 项目目录路径
        dry_run: 是否仅预览不修改

    Returns:
        迁移统计信息
    """
    stats = {
        'project_cleaned': False,
        'scripts_cleaned': 0,
        'fields_removed': []
    }

    # 清理 project.json
    project_file = project_dir / "project.json"
    if project_file.exists():
        with open(project_file, 'r', encoding='utf-8') as f:
            project = json.load(f)

        original = json.dumps(project)

        # 移除 status 对象（改为读时计算）
        if 'status' in project:
            stats['fields_removed'].append('project.json: status')
            if not dry_run:
                project.pop('status', None)

        # 移除 episodes 中的计算字段
        for ep in project.get('episodes', []):
            if 'scenes_count' in ep:
                stats['fields_removed'].append(f"project.json: episodes[{ep.get('episode')}].scenes_count")
                if not dry_run:
                    ep.pop('scenes_count', None)
            if 'status' in ep:
                stats['fields_removed'].append(f"project.json: episodes[{ep.get('episode')}].status")
                if not dry_run:
                    ep.pop('status', None)

        if json.dumps(project) != original:
            stats['project_cleaned'] = True
            if not dry_run:
                with open(project_file, 'w', encoding='utf-8') as f:
                    json.dump(project, f, ensure_ascii=False, indent=2)

    # 清理 scripts/*.json
    scripts_dir = project_dir / "scripts"
    if scripts_dir.exists():
        for script_file in scripts_dir.glob("*.json"):
            with open(script_file, 'r', encoding='utf-8') as f:
                script = json.load(f)

            original = json.dumps(script)
            script_name = script_file.name

            # 移除冗余字段
            if 'characters_in_episode' in script:
                stats['fields_removed'].append(f"{script_name}: characters_in_episode")
                if not dry_run:
                    script.pop('characters_in_episode', None)

            if 'clues_in_episode' in script:
                stats['fields_removed'].append(f"{script_name}: clues_in_episode")
                if not dry_run:
                    script.pop('clues_in_episode', None)

            if 'duration_seconds' in script:
                stats['fields_removed'].append(f"{script_name}: duration_seconds")
                if not dry_run:
                    script.pop('duration_seconds', None)

            if 'metadata' in script:
                if 'total_scenes' in script['metadata']:
                    stats['fields_removed'].append(f"{script_name}: metadata.total_scenes")
                    if not dry_run:
                        script['metadata'].pop('total_scenes', None)
                if 'estimated_duration_seconds' in script['metadata']:
                    stats['fields_removed'].append(f"{script_name}: metadata.estimated_duration_seconds")
                    if not dry_run:
                        script['metadata'].pop('estimated_duration_seconds', None)

            if json.dumps(script) != original:
                stats['scripts_cleaned'] += 1
                if not dry_run:
                    with open(script_file, 'w', encoding='utf-8') as f:
                        json.dump(script, f, ensure_ascii=False, indent=2)

    return stats


def main():
    parser = argparse.ArgumentParser(description='清理项目中的冗余字段')
    parser.add_argument('--dry-run', action='store_true', help='仅预览不修改')
    parser.add_argument('--projects-root', default='projects', help='项目根目录')
    args = parser.parse_args()

    projects_root = Path(args.projects_root)

    if not projects_root.exists():
        print(f"❌ 项目根目录不存在: {projects_root}")
        return

    if args.dry_run:
        print("🔍 预览模式 - 不会修改任何文件\n")

    total_stats = {
        'projects_processed': 0,
        'projects_cleaned': 0,
        'scripts_cleaned': 0,
        'fields_removed': []
    }

    for project_dir in projects_root.iterdir():
        if project_dir.is_dir() and not project_dir.name.startswith('.'):
            print(f"处理项目: {project_dir.name}")
            stats = migrate_project(project_dir, args.dry_run)

            total_stats['projects_processed'] += 1
            if stats['project_cleaned'] or stats['scripts_cleaned'] > 0:
                total_stats['projects_cleaned'] += 1
            total_stats['scripts_cleaned'] += stats['scripts_cleaned']
            total_stats['fields_removed'].extend(stats['fields_removed'])

            if stats['fields_removed']:
                for field in stats['fields_removed']:
                    print(f"  - 移除: {field}")
            else:
                print("  - 无需清理")

    print(f"\n{'预览' if args.dry_run else '迁移'}完成:")
    print(f"  - 处理项目: {total_stats['projects_processed']}")
    print(f"  - 清理项目: {total_stats['projects_cleaned']}")
    print(f"  - 清理剧本: {total_stats['scripts_cleaned']}")
    print(f"  - 移除字段: {len(total_stats['fields_removed'])}")

    if args.dry_run and total_stats['fields_removed']:
        print("\n要执行实际迁移，请移除 --dry-run 参数重新运行")


if __name__ == "__main__":
    main()
