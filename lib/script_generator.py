"""
script_generator.py - 剧本生成器

读取 Step 1/2 的 Markdown 中间文件，调用 Gemini 生成最终 JSON 剧本
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Union

from pydantic import ValidationError

from lib.gemini_client import GeminiClient
from lib.prompt_builders_script import (
    build_drama_prompt,
    build_narration_prompt,
)
from lib.script_models import (
    DramaEpisodeScript,
    NarrationEpisodeScript,
)


class ScriptGenerator:
    """
    剧本生成器

    读取 Step 1/2 的 Markdown 中间文件，调用 Gemini 生成最终 JSON 剧本
    """

    MODEL = "gemini-2.5-flash"

    def __init__(self, project_path: Union[str, Path]):
        """
        初始化生成器

        Args:
            project_path: 项目目录路径，如 projects/test0205
        """
        self.project_path = Path(project_path)
        self.client = GeminiClient()

        # 加载 project.json
        self.project_json = self._load_project_json()
        self.content_mode = self.project_json.get("content_mode", "narration")

    def generate(
        self,
        episode: int,
        output_path: Optional[Path] = None,
    ) -> Path:
        """
        生成剧集剧本

        Args:
            episode: 剧集编号
            output_path: 输出路径，默认为 scripts/episode_{episode}.json

        Returns:
            生成的 JSON 文件路径
        """
        # 1. 加载中间文件
        step1_md = self._load_step1(episode)

        # 2. 提取角色和线索（从 project.json）
        characters = self.project_json.get("characters", {})
        clues = self.project_json.get("clues", {})

        # 3. 构建 Prompt
        if self.content_mode == "narration":
            prompt = build_narration_prompt(
                project_overview=self.project_json.get("overview", {}),
                style=self.project_json.get("style", ""),
                style_description=self.project_json.get("style_description", ""),
                characters=characters,
                clues=clues,
                segments_md=step1_md,
            )
            schema = NarrationEpisodeScript.model_json_schema()
        else:
            prompt = build_drama_prompt(
                project_overview=self.project_json.get("overview", {}),
                style=self.project_json.get("style", ""),
                style_description=self.project_json.get("style_description", ""),
                characters=characters,
                clues=clues,
                scenes_md=step1_md,
            )
            schema = DramaEpisodeScript.model_json_schema()

        # 4. 调用 Gemini API
        print(f"📝 正在生成第 {episode} 集剧本...")
        response_text = self.client.generate_text(
            prompt=prompt,
            model=self.MODEL,
            response_schema=schema,
        )

        # 5. 解析并验证响应
        script_data = self._parse_response(response_text, episode)

        # 6. 补充元数据
        script_data = self._add_metadata(script_data, episode)

        # 7. 保存文件
        if output_path is None:
            output_path = self.project_path / "scripts" / f"episode_{episode}.json"

        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(script_data, f, ensure_ascii=False, indent=2)

        print(f"✓ 剧本已保存至 {output_path}")
        return output_path

    def build_prompt(self, episode: int) -> str:
        """
        构建 Prompt（用于 dry-run 模式）

        Args:
            episode: 剧集编号

        Returns:
            构建好的 Prompt 字符串
        """
        step1_md = self._load_step1(episode)
        characters = self.project_json.get("characters", {})
        clues = self.project_json.get("clues", {})

        if self.content_mode == "narration":
            return build_narration_prompt(
                project_overview=self.project_json.get("overview", {}),
                style=self.project_json.get("style", ""),
                style_description=self.project_json.get("style_description", ""),
                characters=characters,
                clues=clues,
                segments_md=step1_md,
            )
        else:
            return build_drama_prompt(
                project_overview=self.project_json.get("overview", {}),
                style=self.project_json.get("style", ""),
                style_description=self.project_json.get("style_description", ""),
                characters=characters,
                clues=clues,
                scenes_md=step1_md,
            )

    def _load_project_json(self) -> dict:
        """加载 project.json"""
        path = self.project_path / "project.json"
        if not path.exists():
            raise FileNotFoundError(f"未找到 project.json: {path}")

        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _load_step1(self, episode: int) -> str:
        """加载 Step 1 的 Markdown 文件"""
        path = self.project_path / "drafts" / f"episode_{episode}" / "step1_segments.md"
        if not path.exists():
            raise FileNotFoundError(f"未找到 Step 1 文件: {path}")

        with open(path, "r", encoding="utf-8") as f:
            return f.read()

    def _parse_response(self, response_text: str, episode: int) -> dict:
        """
        解析并验证 Gemini 响应

        Args:
            response_text: API 返回的 JSON 文本
            episode: 剧集编号

        Returns:
            验证后的剧本数据字典
        """
        # 清理可能的 markdown 包装
        text = response_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # 解析 JSON
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"JSON 解析失败: {e}")

        # Pydantic 验证
        try:
            if self.content_mode == "narration":
                validated = NarrationEpisodeScript.model_validate(data)
            else:
                validated = DramaEpisodeScript.model_validate(data)
            return validated.model_dump()
        except ValidationError as e:
            print(f"⚠️ 数据验证警告: {e}")
            # 返回原始数据，允许部分不符合 schema
            return data

    def _add_metadata(self, script_data: dict, episode: int) -> dict:
        """
        补充剧本元数据

        Args:
            script_data: 剧本数据
            episode: 剧集编号

        Returns:
            补充元数据后的剧本数据
        """
        # 确保基本字段存在
        script_data.setdefault("episode", episode)
        script_data.setdefault("content_mode", self.content_mode)

        # 添加小说信息
        if "novel" not in script_data:
            script_data["novel"] = {
                "title": self.project_json.get("title", ""),
                "chapter": f"第{episode}集",
                "source_file": "",
            }

        # 添加时间戳
        now = datetime.now().isoformat()
        script_data.setdefault("metadata", {})
        script_data["metadata"]["created_at"] = now
        script_data["metadata"]["updated_at"] = now
        script_data["metadata"]["generator"] = self.MODEL

        # 计算统计信息
        if self.content_mode == "narration":
            segments = script_data.get("segments", [])
            script_data["metadata"]["total_segments"] = len(segments)
            script_data["duration_seconds"] = sum(
                s.get("duration_seconds", 4) for s in segments
            )
        else:
            scenes = script_data.get("scenes", [])
            script_data["metadata"]["total_scenes"] = len(scenes)
            script_data["duration_seconds"] = sum(
                s.get("duration_seconds", 8) for s in scenes
            )

        return script_data
