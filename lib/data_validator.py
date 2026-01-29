"""
数据验证工具

验证 project.json 和 episode JSON 的数据结构完整性和引用一致性。
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict, Any, Optional


@dataclass
class ValidationResult:
    """验证结果"""
    valid: bool
    errors: List[str] = field(default_factory=list)  # 错误列表（阻止继续）
    warnings: List[str] = field(default_factory=list)  # 警告列表（仅提示）

    def __str__(self) -> str:
        if self.valid:
            msg = "验证通过"
            if self.warnings:
                msg += f"\n警告 ({len(self.warnings)}):\n" + "\n".join(f"  - {w}" for w in self.warnings)
            return msg
        else:
            msg = f"验证失败 ({len(self.errors)} 个错误)"
            msg += "\n错误:\n" + "\n".join(f"  - {e}" for e in self.errors)
            if self.warnings:
                msg += f"\n警告 ({len(self.warnings)}):\n" + "\n".join(f"  - {w}" for w in self.warnings)
            return msg


class DataValidator:
    """数据验证器"""

    # 有效的内容模式
    VALID_CONTENT_MODES = {"narration", "drama"}

    # 有效的时长
    VALID_DURATIONS = {4, 6, 8}

    # 有效的线索类型
    VALID_CLUE_TYPES = {"prop", "location"}

    # 有效的线索重要性
    VALID_CLUE_IMPORTANCE = {"major", "minor"}

    # 有效的场景类型（drama 模式）
    VALID_SCENE_TYPES = {"剧情", "空镜"}

    # segment/scene ID 格式
    ID_PATTERN = re.compile(r'^E\d+S\d+$')

    def __init__(self, projects_root: Optional[str] = None):
        """
        初始化验证器

        Args:
            projects_root: 项目根目录，默认为 projects/
        """
        import os
        if projects_root is None:
            projects_root = os.environ.get('AI_ANIME_PROJECTS', 'projects')
        self.projects_root = Path(projects_root)

    def _load_json(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """加载 JSON 文件"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            return None

    def validate_project(self, project_name: str) -> ValidationResult:
        """
        验证 project.json

        检查内容：
        - 必填字段完整性
        - characters 结构正确性
        - clues 结构正确性

        Args:
            project_name: 项目名称

        Returns:
            ValidationResult
        """
        errors = []
        warnings = []

        # 加载 project.json
        project_path = self.projects_root / project_name / "project.json"
        project = self._load_json(project_path)

        if project is None:
            return ValidationResult(
                valid=False,
                errors=[f"无法加载 project.json: {project_path}"]
            )

        # 检查顶层必填字段
        if not project.get('title'):
            errors.append("缺少必填字段: title")

        content_mode = project.get('content_mode')
        if not content_mode:
            errors.append("缺少必填字段: content_mode")
        elif content_mode not in self.VALID_CONTENT_MODES:
            errors.append(f"content_mode 值无效: '{content_mode}'，必须是 {self.VALID_CONTENT_MODES}")

        if not project.get('style'):
            errors.append("缺少必填字段: style")

        # 检查 characters
        characters = project.get('characters', {})
        if isinstance(characters, dict):
            for char_name, char_data in characters.items():
                if not isinstance(char_data, dict):
                    errors.append(f"角色 '{char_name}' 数据格式错误，应为对象")
                    continue

                if not char_data.get('description'):
                    errors.append(f"角色 '{char_name}' 缺少必填字段: description")

        # 检查 clues
        clues = project.get('clues', {})
        if isinstance(clues, dict):
            for clue_name, clue_data in clues.items():
                if not isinstance(clue_data, dict):
                    errors.append(f"线索 '{clue_name}' 数据格式错误，应为对象")
                    continue

                clue_type = clue_data.get('type')
                if not clue_type:
                    errors.append(f"线索 '{clue_name}' 缺少必填字段: type")
                elif clue_type not in self.VALID_CLUE_TYPES:
                    errors.append(f"线索 '{clue_name}' type 值无效: '{clue_type}'，必须是 {self.VALID_CLUE_TYPES}")

                if not clue_data.get('description'):
                    errors.append(f"线索 '{clue_name}' 缺少必填字段: description")

                importance = clue_data.get('importance')
                if not importance:
                    errors.append(f"线索 '{clue_name}' 缺少必填字段: importance")
                elif importance not in self.VALID_CLUE_IMPORTANCE:
                    errors.append(f"线索 '{clue_name}' importance 值无效: '{importance}'，必须是 {self.VALID_CLUE_IMPORTANCE}")

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings
        )

    def validate_episode(self, project_name: str, episode_file: str) -> ValidationResult:
        """
        验证 episode JSON

        检查内容：
        - 引用一致性（characters_in_episode/clues_in_episode 必须存在于 project.json）
        - 字段完整性

        Args:
            project_name: 项目名称
            episode_file: 剧本文件名（如 episode_1.json）

        Returns:
            ValidationResult
        """
        errors = []
        warnings = []

        project_dir = self.projects_root / project_name

        # 加载 project.json
        project_path = project_dir / "project.json"
        project = self._load_json(project_path)
        if project is None:
            return ValidationResult(
                valid=False,
                errors=[f"无法加载 project.json: {project_path}"]
            )

        project_characters = set(project.get('characters', {}).keys())
        project_clues = set(project.get('clues', {}).keys())

        # 加载 episode JSON
        episode_path = project_dir / "scripts" / episode_file
        episode = self._load_json(episode_path)
        if episode is None:
            return ValidationResult(
                valid=False,
                errors=[f"无法加载剧本文件: {episode_path}"]
            )

        # 检查顶层必填字段
        if not isinstance(episode.get('episode'), int):
            errors.append("缺少必填字段: episode (整数)")

        if not episode.get('title'):
            errors.append("缺少必填字段: title")

        content_mode = episode.get('content_mode', project.get('content_mode', 'narration'))

        # 检查 characters_in_episode
        characters_in_episode = episode.get('characters_in_episode')
        if characters_in_episode is None:
            errors.append("缺少必填字段: characters_in_episode")
            characters_in_episode = []
        elif not isinstance(characters_in_episode, list):
            errors.append("characters_in_episode 必须是数组")
            characters_in_episode = []

        # 验证 characters_in_episode 引用一致性
        characters_in_episode_set = set(characters_in_episode)
        invalid_chars = characters_in_episode_set - project_characters
        if invalid_chars:
            errors.append(f"characters_in_episode 引用了不存在于 project.json 的角色: {invalid_chars}")

        # 检查 clues_in_episode
        clues_in_episode = episode.get('clues_in_episode')
        if clues_in_episode is None:
            errors.append("缺少必填字段: clues_in_episode")
            clues_in_episode = []
        elif not isinstance(clues_in_episode, list):
            errors.append("clues_in_episode 必须是数组")
            clues_in_episode = []

        # 验证 clues_in_episode 引用一致性
        clues_in_episode_set = set(clues_in_episode)
        invalid_clues = clues_in_episode_set - project_clues
        if invalid_clues:
            errors.append(f"clues_in_episode 引用了不存在于 project.json 的线索: {invalid_clues}")

        # 根据 content_mode 验证 segments 或 scenes
        if content_mode == 'narration':
            self._validate_segments(
                episode.get('segments', []),
                characters_in_episode_set,
                clues_in_episode_set,
                errors,
                warnings
            )
        else:  # drama
            self._validate_scenes(
                episode.get('scenes', []),
                characters_in_episode_set,
                clues_in_episode_set,
                errors,
                warnings
            )

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings
        )

    def _validate_segments(
        self,
        segments: List[Dict],
        characters_in_episode: set,
        clues_in_episode: set,
        errors: List[str],
        warnings: List[str]
    ):
        """验证 segments（narration 模式）"""
        if not segments:
            errors.append("segments 数组为空")
            return

        for i, segment in enumerate(segments):
            prefix = f"segments[{i}]"

            # segment_id
            segment_id = segment.get('segment_id')
            if not segment_id:
                errors.append(f"{prefix}: 缺少必填字段 segment_id")
            elif not self.ID_PATTERN.match(segment_id):
                errors.append(f"{prefix}: segment_id 格式错误 '{segment_id}'，应为 E{{n}}S{{nn}}")

            # duration_seconds
            duration = segment.get('duration_seconds')
            if duration is None:
                warnings.append(f"{prefix}: 缺少 duration_seconds，将使用默认值 4")
            elif duration not in self.VALID_DURATIONS:
                errors.append(f"{prefix}: duration_seconds 值无效 '{duration}'，必须是 {self.VALID_DURATIONS}")

            # novel_text
            if not segment.get('novel_text'):
                errors.append(f"{prefix}: 缺少必填字段 novel_text")

            # characters_in_segment
            chars_in_segment = segment.get('characters_in_segment')
            if chars_in_segment is None:
                errors.append(f"{prefix}: 缺少必填字段 characters_in_segment")
            elif not isinstance(chars_in_segment, list):
                errors.append(f"{prefix}: characters_in_segment 必须是数组")
            else:
                invalid = set(chars_in_segment) - characters_in_episode
                if invalid:
                    errors.append(f"{prefix}: characters_in_segment 引用了不在 characters_in_episode 中的角色: {invalid}")

            # clues_in_segment
            clues_in_segment = segment.get('clues_in_segment')
            if clues_in_segment is None:
                errors.append(f"{prefix}: 缺少必填字段 clues_in_segment")
            elif not isinstance(clues_in_segment, list):
                errors.append(f"{prefix}: clues_in_segment 必须是数组")
            else:
                invalid = set(clues_in_segment) - clues_in_episode
                if invalid:
                    errors.append(f"{prefix}: clues_in_segment 引用了不在 clues_in_episode 中的线索: {invalid}")

            # image_prompt 和 video_prompt（新格式，符合 CLAUDE.md 规范）
            if not segment.get('image_prompt'):
                errors.append(f"{prefix}: 缺少必填字段 image_prompt")
            if not segment.get('video_prompt'):
                errors.append(f"{prefix}: 缺少必填字段 video_prompt")

    def _validate_scenes(
        self,
        scenes: List[Dict],
        characters_in_episode: set,
        clues_in_episode: set,
        errors: List[str],
        warnings: List[str]
    ):
        """验证 scenes（drama 模式）"""
        if not scenes:
            errors.append("scenes 数组为空")
            return

        for i, scene in enumerate(scenes):
            prefix = f"scenes[{i}]"

            # scene_id
            scene_id = scene.get('scene_id')
            if not scene_id:
                errors.append(f"{prefix}: 缺少必填字段 scene_id")
            elif not self.ID_PATTERN.match(scene_id):
                errors.append(f"{prefix}: scene_id 格式错误 '{scene_id}'，应为 E{{n}}S{{nn}}")

            # scene_type
            scene_type = scene.get('scene_type')
            if not scene_type:
                errors.append(f"{prefix}: 缺少必填字段 scene_type")
            elif scene_type not in self.VALID_SCENE_TYPES:
                errors.append(f"{prefix}: scene_type 值无效 '{scene_type}'，必须是 {self.VALID_SCENE_TYPES}")

            # duration_seconds
            duration = scene.get('duration_seconds')
            if duration is None:
                warnings.append(f"{prefix}: 缺少 duration_seconds，将使用默认值 8")
            elif duration not in self.VALID_DURATIONS:
                errors.append(f"{prefix}: duration_seconds 值无效 '{duration}'，必须是 {self.VALID_DURATIONS}")

            # characters_in_scene
            chars_in_scene = scene.get('characters_in_scene')
            if chars_in_scene is None:
                errors.append(f"{prefix}: 缺少必填字段 characters_in_scene")
            elif not isinstance(chars_in_scene, list):
                errors.append(f"{prefix}: characters_in_scene 必须是数组")
            else:
                invalid = set(chars_in_scene) - characters_in_episode
                if invalid:
                    errors.append(f"{prefix}: characters_in_scene 引用了不在 characters_in_episode 中的角色: {invalid}")

            # clues_in_scene
            clues_in_scene = scene.get('clues_in_scene')
            if clues_in_scene is None:
                errors.append(f"{prefix}: 缺少必填字段 clues_in_scene")
            elif not isinstance(clues_in_scene, list):
                errors.append(f"{prefix}: clues_in_scene 必须是数组")
            else:
                invalid = set(clues_in_scene) - clues_in_episode
                if invalid:
                    errors.append(f"{prefix}: clues_in_scene 引用了不在 clues_in_episode 中的线索: {invalid}")

            # image_prompt 和 video_prompt（新格式，符合 CLAUDE.md 规范）
            if not scene.get('image_prompt'):
                errors.append(f"{prefix}: 缺少必填字段 image_prompt")
            if not scene.get('video_prompt'):
                errors.append(f"{prefix}: 缺少必填字段 video_prompt")


# 便捷函数
def validate_project(project_name: str, projects_root: Optional[str] = None) -> ValidationResult:
    """验证 project.json"""
    validator = DataValidator(projects_root)
    return validator.validate_project(project_name)


def validate_episode(project_name: str, episode_file: str, projects_root: Optional[str] = None) -> ValidationResult:
    """验证 episode JSON"""
    validator = DataValidator(projects_root)
    return validator.validate_episode(project_name, episode_file)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("用法: python data_validator.py <project_name> [episode_file]")
        print("  验证 project.json: python data_validator.py my_project")
        print("  验证 episode JSON: python data_validator.py my_project episode_1.json")
        sys.exit(1)

    project_name = sys.argv[1]

    if len(sys.argv) >= 3:
        episode_file = sys.argv[2]
        result = validate_episode(project_name, episode_file)
        print(f"验证 {project_name}/scripts/{episode_file}:")
    else:
        result = validate_project(project_name)
        print(f"验证 {project_name}/project.json:")

    print(result)
    sys.exit(0 if result.valid else 1)
