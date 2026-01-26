"""
项目文件管理器

管理漫剧项目的目录结构、分镜剧本读写、状态追踪。
"""

import json
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any


class ProjectManager:
    """漫剧项目管理器"""

    # 项目子目录结构
    SUBDIRS = ['source', 'scripts', 'characters', 'clues', 'storyboards', 'videos', 'output']

    # 项目元数据文件名
    PROJECT_FILE = 'project.json'

    def __init__(self, projects_root: Optional[str] = None):
        """
        初始化项目管理器

        Args:
            projects_root: 项目根目录，默认为当前目录下的 projects/
        """
        if projects_root is None:
            # 尝试从环境变量或默认路径获取
            projects_root = os.environ.get('AI_ANIME_PROJECTS', 'projects')

        self.projects_root = Path(projects_root)
        self.projects_root.mkdir(parents=True, exist_ok=True)

    def list_projects(self) -> List[str]:
        """列出所有项目"""
        return [
            d.name for d in self.projects_root.iterdir()
            if d.is_dir() and not d.name.startswith('.')
        ]

    def create_project(self, name: str) -> Path:
        """
        创建新项目

        Args:
            name: 项目名称（通常是小说名称）

        Returns:
            项目目录路径
        """
        project_dir = self.projects_root / name

        if project_dir.exists():
            raise FileExistsError(f"项目 '{name}' 已存在")

        # 创建所有子目录
        for subdir in self.SUBDIRS:
            (project_dir / subdir).mkdir(parents=True, exist_ok=True)

        return project_dir

    def get_project_path(self, name: str) -> Path:
        """获取项目路径"""
        project_dir = self.projects_root / name
        if not project_dir.exists():
            raise FileNotFoundError(f"项目 '{name}' 不存在")
        return project_dir

    def get_project_status(self, name: str) -> Dict[str, Any]:
        """
        获取项目状态

        Returns:
            包含各阶段完成情况的字典
        """
        project_dir = self.get_project_path(name)

        status = {
            'name': name,
            'path': str(project_dir),
            'source_files': [],
            'scripts': [],
            'characters': [],
            'clues': [],
            'storyboards': [],
            'videos': [],
            'outputs': [],
            'current_stage': 'empty'
        }

        # 检查各目录内容
        for subdir in self.SUBDIRS:
            subdir_path = project_dir / subdir
            if subdir_path.exists():
                files = list(subdir_path.glob('*'))
                if subdir == 'source':
                    status['source_files'] = [f.name for f in files if f.is_file()]
                elif subdir == 'scripts':
                    status['scripts'] = [f.name for f in files if f.suffix == '.json']
                elif subdir == 'characters':
                    status['characters'] = [f.name for f in files if f.suffix in ['.png', '.jpg', '.jpeg']]
                elif subdir == 'clues':
                    status['clues'] = [f.name for f in files if f.suffix in ['.png', '.jpg', '.jpeg']]
                elif subdir == 'storyboards':
                    status['storyboards'] = [f.name for f in files if f.suffix in ['.png', '.jpg', '.jpeg']]
                elif subdir == 'videos':
                    status['videos'] = [f.name for f in files if f.suffix in ['.mp4', '.webm']]
                elif subdir == 'output':
                    status['outputs'] = [f.name for f in files if f.suffix in ['.mp4', '.webm']]

        # 确定当前阶段
        if status['outputs']:
            status['current_stage'] = 'completed'
        elif status['videos']:
            status['current_stage'] = 'videos_generated'
        elif status['storyboards']:
            status['current_stage'] = 'storyboards_generated'
        elif status['characters']:
            status['current_stage'] = 'characters_generated'
        elif status['scripts']:
            status['current_stage'] = 'script_created'
        elif status['source_files']:
            status['current_stage'] = 'source_ready'
        else:
            status['current_stage'] = 'empty'

        return status

    # ==================== 分镜剧本操作 ====================

    def create_script(
        self,
        project_name: str,
        title: str,
        chapter: str,
        source_file: str
    ) -> Dict:
        """
        创建新的分镜剧本模板

        Args:
            project_name: 项目名称
            title: 小说标题
            chapter: 章节名称
            source_file: 源文件路径

        Returns:
            剧本字典
        """
        script = {
            "novel": {
                "title": title,
                "chapter": chapter,
                "source_file": source_file
            },
            "characters": {},
            "scenes": [],
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "total_scenes": 0,
                "estimated_duration_seconds": 0,
                "status": "draft"
            }
        }

        return script

    def save_script(
        self,
        project_name: str,
        script: Dict,
        filename: Optional[str] = None
    ) -> Path:
        """
        保存分镜剧本

        Args:
            project_name: 项目名称
            script: 剧本字典
            filename: 可选的文件名，默认使用章节名

        Returns:
            保存的文件路径
        """
        project_dir = self.get_project_path(project_name)
        scripts_dir = project_dir / 'scripts'

        if filename is None:
            chapter = script['novel'].get('chapter', 'chapter_01')
            filename = f"{chapter.replace(' ', '_')}_script.json"

        # 更新元数据
        script['metadata']['updated_at'] = datetime.now().isoformat()
        script['metadata']['total_scenes'] = len(script.get('scenes', []))

        # 计算总时长
        total_duration = sum(
            scene.get('duration_seconds', 6)
            for scene in script.get('scenes', [])
        )
        script['metadata']['estimated_duration_seconds'] = total_duration

        # 保存文件
        output_path = scripts_dir / filename
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(script, f, ensure_ascii=False, indent=2)

        return output_path

    def load_script(self, project_name: str, filename: str) -> Dict:
        """
        加载分镜剧本

        Args:
            project_name: 项目名称
            filename: 剧本文件名

        Returns:
            剧本字典
        """
        project_dir = self.get_project_path(project_name)
        script_path = project_dir / 'scripts' / filename

        if not script_path.exists():
            raise FileNotFoundError(f"剧本文件不存在: {script_path}")

        with open(script_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def list_scripts(self, project_name: str) -> List[str]:
        """列出项目中的所有剧本"""
        project_dir = self.get_project_path(project_name)
        scripts_dir = project_dir / 'scripts'
        return [f.name for f in scripts_dir.glob('*.json')]

    # ==================== 人物管理 ====================

    def add_character(
        self,
        project_name: str,
        script_filename: str,
        name: str,
        description: str,
        voice_style: Optional[str] = None,
        character_sheet: Optional[str] = None
    ) -> Dict:
        """
        向剧本添加人物

        Args:
            project_name: 项目名称
            script_filename: 剧本文件名
            name: 人物名称
            description: 人物描述
            voice_style: 声音风格
            character_sheet: 人物设计图路径

        Returns:
            更新后的剧本
        """
        script = self.load_script(project_name, script_filename)

        script['characters'][name] = {
            'description': description,
            'voice_style': voice_style or '',
            'character_sheet': character_sheet or ''
        }

        self.save_script(project_name, script, script_filename)
        return script

    def update_character_sheet(
        self,
        project_name: str,
        script_filename: str,
        name: str,
        sheet_path: str
    ) -> Dict:
        """更新人物设计图路径"""
        script = self.load_script(project_name, script_filename)

        if name not in script['characters']:
            raise KeyError(f"人物 '{name}' 不存在")

        script['characters'][name]['character_sheet'] = sheet_path
        self.save_script(project_name, script, script_filename)
        return script

    # ==================== 数据结构标准化 ====================

    @staticmethod
    def create_generated_assets() -> Dict:
        """
        创建标准的 generated_assets 结构

        Returns:
            标准的 generated_assets 字典
        """
        return {
            'storyboard_grid': None,
            'storyboard_image': None,
            'video_clip': None,
            'video_uri': None,
            'status': 'pending'
        }

    @staticmethod
    def create_scene_template(
        scene_id: str,
        episode: int = 1,
        duration_seconds: int = 8
    ) -> Dict:
        """
        创建标准场景对象模板

        Args:
            scene_id: 场景 ID（如 "E1S01"）
            episode: 集数编号
            duration_seconds: 场景时长（秒）

        Returns:
            标准的场景字典
        """
        return {
            'scene_id': scene_id,
            'episode': episode,
            'title': '',
            'scene_type': '剧情',
            'duration_seconds': duration_seconds,
            'segment_break': False,
            'characters_in_scene': [],
            'clues_in_scene': [],
            'visual': {
                'description': '',
                'shot_type': 'medium shot',
                'camera_movement': 'static',
                'lighting': '',
                'mood': ''
            },
            'action': '',
            'dialogue': {
                'speaker': '',
                'text': '',
                'emotion': 'neutral'
            },
            'audio': {
                'dialogue': [],
                'narration': '',
                'sound_effects': []
            },
            'transition_to_next': 'cut',
            'generated_assets': ProjectManager.create_generated_assets()
        }

    def normalize_scene(self, scene: Dict, episode: int = 1) -> Dict:
        """
        补全单个场景中缺失的字段

        Args:
            scene: 场景字典
            episode: 集数编号（用于补全 episode 字段）

        Returns:
            补全后的场景字典
        """
        template = self.create_scene_template(
            scene_id=scene.get('scene_id', '000'),
            episode=episode,
            duration_seconds=scene.get('duration_seconds', 8)
        )

        # 合并 visual 字段
        if 'visual' not in scene:
            scene['visual'] = template['visual']
        else:
            for key in template['visual']:
                if key not in scene['visual']:
                    scene['visual'][key] = template['visual'][key]

        # 合并 audio 字段
        if 'audio' not in scene:
            scene['audio'] = template['audio']
        else:
            for key in template['audio']:
                if key not in scene['audio']:
                    scene['audio'][key] = template['audio'][key]

        # 补全 generated_assets 字段
        if 'generated_assets' not in scene:
            scene['generated_assets'] = self.create_generated_assets()
        else:
            assets_template = self.create_generated_assets()
            for key in assets_template:
                if key not in scene['generated_assets']:
                    scene['generated_assets'][key] = assets_template[key]

        # 补全其他顶层字段
        top_level_defaults = {
            'episode': episode,
            'title': '',
            'scene_type': '剧情',
            'segment_break': False,
            'characters_in_scene': [],
            'clues_in_scene': [],
            'action': '',
            'dialogue': template['dialogue'],
            'transition_to_next': 'cut'
        }

        for key, default_value in top_level_defaults.items():
            if key not in scene:
                scene[key] = default_value

        # 更新状态
        self.update_scene_status(scene)

        return scene

    def update_scene_status(self, scene: Dict) -> str:
        """
        根据 generated_assets 内容更新并返回场景状态

        状态值:
        - pending: 未开始
        - in_progress: 处理中
        - storyboard_ready: 分镜图完成
        - completed: 视频完成

        Args:
            scene: 场景字典

        Returns:
            更新后的状态值
        """
        assets = scene.get('generated_assets', {})

        has_grid = bool(assets.get('storyboard_grid'))
        has_image = bool(assets.get('storyboard_image'))
        has_video = bool(assets.get('video_clip'))

        if has_video:
            status = 'completed'
        elif has_image:
            status = 'storyboard_ready'
        elif has_grid:
            status = 'in_progress'
        else:
            status = 'pending'

        assets['status'] = status
        return status

    def normalize_script(
        self,
        project_name: str,
        script_filename: str,
        save: bool = True
    ) -> Dict:
        """
        补全现有 script.json 中缺失的字段

        Args:
            project_name: 项目名称
            script_filename: 剧本文件名
            save: 是否保存修改后的剧本

        Returns:
            补全后的剧本字典
        """
        import re

        script = self.load_script(project_name, script_filename)

        # 从文件名或现有数据推断 episode
        episode = script.get('episode', 1)
        if not episode:
            match = re.search(r'episode[_\s]*(\d+)', script_filename, re.IGNORECASE)
            if match:
                episode = int(match.group(1))
            else:
                episode = 1

        # 补全顶层字段
        script_defaults = {
            'episode': episode,
            'title': script.get('novel', {}).get('chapter', ''),
            'duration_seconds': 0,
            'summary': '',
        }

        for key, default_value in script_defaults.items():
            if key not in script:
                script[key] = default_value

        # 确保必要的顶层结构存在
        if 'novel' not in script:
            script['novel'] = {
                'title': '',
                'chapter': '',
                'source_file': ''
            }

        if 'characters' not in script:
            script['characters'] = {}

        if 'scenes' not in script:
            script['scenes'] = []

        if 'metadata' not in script:
            script['metadata'] = {
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'total_scenes': 0,
                'estimated_duration_seconds': 0,
                'status': 'draft'
            }

        # 规范化每个场景
        for scene in script['scenes']:
            self.normalize_scene(scene, episode)

        # 更新统计信息
        script['metadata']['total_scenes'] = len(script['scenes'])
        script['metadata']['estimated_duration_seconds'] = sum(
            s.get('duration_seconds', 8) for s in script['scenes']
        )
        script['duration_seconds'] = script['metadata']['estimated_duration_seconds']

        if save:
            self.save_script(project_name, script, script_filename)
            print(f"✅ 剧本已规范化并保存: {script_filename}")

        return script

    # ==================== 场景管理 ====================

    def add_scene(
        self,
        project_name: str,
        script_filename: str,
        scene: Dict
    ) -> Dict:
        """
        向剧本添加场景

        Args:
            project_name: 项目名称
            script_filename: 剧本文件名
            scene: 场景字典

        Returns:
            更新后的剧本
        """
        script = self.load_script(project_name, script_filename)

        # 自动生成场景 ID
        existing_ids = [s['scene_id'] for s in script['scenes']]
        next_id = f"{len(existing_ids) + 1:03d}"
        scene['scene_id'] = next_id

        # 确保有 generated_assets 字段
        if 'generated_assets' not in scene:
            scene['generated_assets'] = {
                'storyboard_image': None,
                'video_clip': None,
                'status': 'pending'
            }

        script['scenes'].append(scene)
        self.save_script(project_name, script, script_filename)
        return script

    def update_scene_asset(
        self,
        project_name: str,
        script_filename: str,
        scene_id: str,
        asset_type: str,
        asset_path: str
    ) -> Dict:
        """
        更新场景的生成资源路径

        Args:
            project_name: 项目名称
            script_filename: 剧本文件名
            scene_id: 场景 ID
            asset_type: 资源类型 ('storyboard_grid', 'storyboard_image' 或 'video_clip')
            asset_path: 资源路径

        Returns:
            更新后的剧本
        """
        script = self.load_script(project_name, script_filename)

        for scene in script['scenes']:
            if scene['scene_id'] == scene_id:
                scene['generated_assets'][asset_type] = asset_path

                # 更新状态
                assets = scene['generated_assets']
                if assets.get('storyboard_image') and assets.get('video_clip'):
                    assets['status'] = 'completed'
                elif assets.get('storyboard_image') or assets.get('video_clip') or assets.get('storyboard_grid'):
                    assets['status'] = 'in_progress'

                self.save_script(project_name, script, script_filename)
                return script

        raise KeyError(f"场景 '{scene_id}' 不存在")

    def get_pending_scenes(
        self,
        project_name: str,
        script_filename: str,
        asset_type: str
    ) -> List[Dict]:
        """
        获取待处理的场景列表

        Args:
            project_name: 项目名称
            script_filename: 剧本文件名
            asset_type: 资源类型

        Returns:
            待处理场景列表
        """
        script = self.load_script(project_name, script_filename)

        return [
            scene for scene in script['scenes']
            if not scene['generated_assets'].get(asset_type)
        ]

    # ==================== 文件路径工具 ====================

    def get_source_path(self, project_name: str, filename: str) -> Path:
        """获取源文件路径"""
        return self.get_project_path(project_name) / 'source' / filename

    def get_character_path(self, project_name: str, filename: str) -> Path:
        """获取人物设计图路径"""
        return self.get_project_path(project_name) / 'characters' / filename

    def get_storyboard_path(self, project_name: str, filename: str) -> Path:
        """获取分镜图片路径"""
        return self.get_project_path(project_name) / 'storyboards' / filename

    def get_video_path(self, project_name: str, filename: str) -> Path:
        """获取视频路径"""
        return self.get_project_path(project_name) / 'videos' / filename

    def get_output_path(self, project_name: str, filename: str) -> Path:
        """获取输出路径"""
        return self.get_project_path(project_name) / 'output' / filename

    def get_scenes_needing_individual(
        self,
        project_name: str,
        script_filename: str
    ) -> List[Dict]:
        """
        获取有多宫格图但无单独场景图的场景列表

        Args:
            project_name: 项目名称
            script_filename: 剧本文件名

        Returns:
            需要生成单独场景图的场景列表
        """
        script = self.load_script(project_name, script_filename)

        return [
            scene for scene in script['scenes']
            if scene['generated_assets'].get('storyboard_grid')
            and not scene['generated_assets'].get('storyboard_image')
        ]

    # ==================== 项目级元数据管理 ====================

    def _get_project_file_path(self, project_name: str) -> Path:
        """获取项目元数据文件路径"""
        return self.get_project_path(project_name) / self.PROJECT_FILE

    def project_exists(self, project_name: str) -> bool:
        """检查项目元数据文件是否存在"""
        try:
            return self._get_project_file_path(project_name).exists()
        except FileNotFoundError:
            return False

    def load_project(self, project_name: str) -> Dict:
        """
        加载项目元数据

        Args:
            project_name: 项目名称

        Returns:
            项目元数据字典
        """
        project_file = self._get_project_file_path(project_name)

        if not project_file.exists():
            raise FileNotFoundError(f"项目元数据文件不存在: {project_file}")

        with open(project_file, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_project(self, project_name: str, project: Dict) -> Path:
        """
        保存项目元数据

        Args:
            project_name: 项目名称
            project: 项目元数据字典

        Returns:
            保存的文件路径
        """
        project_file = self._get_project_file_path(project_name)

        # 更新时间戳
        project['metadata']['updated_at'] = datetime.now().isoformat()

        with open(project_file, 'w', encoding='utf-8') as f:
            json.dump(project, f, ensure_ascii=False, indent=2)

        return project_file

    def create_project_metadata(
        self,
        project_name: str,
        title: str,
        style: Optional[str] = None
    ) -> Dict:
        """
        创建新的项目元数据文件

        Args:
            project_name: 项目名称
            title: 项目标题
            style: 整体视觉风格描述

        Returns:
            项目元数据字典
        """
        project = {
            "title": title,
            "style": style or "",
            "episodes": [],
            "characters": {},
            "clues": {},
            "status": {
                "current_phase": "script",
                "progress": {
                    "characters": {"total": 0, "completed": 0},
                    "clues": {"total": 0, "completed": 0},
                    "storyboards": {"total": 0, "completed": 0},
                    "videos": {"total": 0, "completed": 0}
                }
            },
            "metadata": {
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
        }

        self.save_project(project_name, project)
        return project

    def add_episode(
        self,
        project_name: str,
        episode: int,
        title: str,
        script_file: str
    ) -> Dict:
        """
        向项目添加剧集

        Args:
            project_name: 项目名称
            episode: 集数
            title: 剧集标题
            script_file: 剧本文件相对路径

        Returns:
            更新后的项目元数据
        """
        project = self.load_project(project_name)

        # 检查是否已存在
        for ep in project['episodes']:
            if ep['episode'] == episode:
                ep['title'] = title
                ep['script_file'] = script_file
                self.save_project(project_name, project)
                return project

        # 添加新剧集
        project['episodes'].append({
            "episode": episode,
            "title": title,
            "script_file": script_file,
            "status": "draft",
            "scenes_count": 0
        })

        # 按集数排序
        project['episodes'].sort(key=lambda x: x['episode'])

        self.save_project(project_name, project)
        return project

    def sync_project_status(self, project_name: str) -> Dict:
        """
        同步项目状态（统计各类资源的完成情况）

        Args:
            project_name: 项目名称

        Returns:
            更新后的项目元数据
        """
        project = self.load_project(project_name)
        project_dir = self.get_project_path(project_name)

        # 统计人物设计图
        characters_total = len(project['characters'])
        characters_completed = sum(
            1 for char in project['characters'].values()
            if char.get('character_sheet') and (project_dir / char['character_sheet']).exists()
        )

        # 统计线索设计图
        clues_total = len([c for c in project['clues'].values() if c.get('importance') == 'major'])
        clues_completed = sum(
            1 for clue in project['clues'].values()
            if clue.get('clue_sheet') and (project_dir / clue['clue_sheet']).exists()
        )

        # 统计分镜和视频（遍历所有剧本）
        storyboards_total = 0
        storyboards_completed = 0
        videos_total = 0
        videos_completed = 0

        for ep in project['episodes']:
            try:
                script = self.load_script(project_name, ep['script_file'].replace('scripts/', ''))
                scenes_count = len(script.get('scenes', []))
                ep['scenes_count'] = scenes_count
                storyboards_total += scenes_count
                videos_total += scenes_count

                for scene in script.get('scenes', []):
                    assets = scene.get('generated_assets', {})
                    if assets.get('storyboard_image'):
                        storyboards_completed += 1
                    if assets.get('video_clip'):
                        videos_completed += 1

                # 更新剧集状态
                if videos_completed == scenes_count and scenes_count > 0:
                    ep['status'] = 'completed'
                elif storyboards_completed > 0 or videos_completed > 0:
                    ep['status'] = 'in_production'
                else:
                    ep['status'] = 'draft'

            except FileNotFoundError:
                continue

        # 更新进度
        project['status']['progress'] = {
            "characters": {"total": characters_total, "completed": characters_completed},
            "clues": {"total": clues_total, "completed": clues_completed},
            "storyboards": {"total": storyboards_total, "completed": storyboards_completed},
            "videos": {"total": videos_total, "completed": videos_completed}
        }

        # 确定当前阶段
        if videos_completed == videos_total and videos_total > 0:
            project['status']['current_phase'] = 'compose'
        elif videos_completed > 0:
            project['status']['current_phase'] = 'video'
        elif storyboards_completed > 0:
            project['status']['current_phase'] = 'storyboard'
        elif clues_completed > 0 or clues_total == 0:
            project['status']['current_phase'] = 'storyboard'
        elif characters_completed > 0:
            project['status']['current_phase'] = 'clues'
        else:
            project['status']['current_phase'] = 'characters'

        self.save_project(project_name, project)
        return project

    # ==================== 项目级人物管理 ====================

    def add_project_character(
        self,
        project_name: str,
        name: str,
        description: str,
        voice_style: Optional[str] = None,
        character_sheet: Optional[str] = None
    ) -> Dict:
        """
        向项目添加人物（项目级）

        Args:
            project_name: 项目名称
            name: 人物名称
            description: 人物描述
            voice_style: 声音风格
            character_sheet: 人物设计图路径

        Returns:
            更新后的项目元数据
        """
        project = self.load_project(project_name)

        project['characters'][name] = {
            'description': description,
            'voice_style': voice_style or '',
            'character_sheet': character_sheet or ''
        }

        self.save_project(project_name, project)
        return project

    def update_project_character_sheet(
        self,
        project_name: str,
        name: str,
        sheet_path: str
    ) -> Dict:
        """更新项目级人物设计图路径"""
        project = self.load_project(project_name)

        if name not in project['characters']:
            raise KeyError(f"人物 '{name}' 不存在")

        project['characters'][name]['character_sheet'] = sheet_path
        self.save_project(project_name, project)
        return project

    def get_project_character(self, project_name: str, name: str) -> Dict:
        """获取项目级人物定义"""
        project = self.load_project(project_name)

        if name not in project['characters']:
            raise KeyError(f"人物 '{name}' 不存在")

        return project['characters'][name]

    # ==================== 线索管理 ====================

    def add_clue(
        self,
        project_name: str,
        name: str,
        clue_type: str,
        description: str,
        importance: str = 'major',
        clue_sheet: Optional[str] = None
    ) -> Dict:
        """
        向项目添加线索

        Args:
            project_name: 项目名称
            name: 线索名称
            clue_type: 线索类型 ('prop' 或 'location')
            description: 详细视觉描述
            importance: 重要程度 ('major' 或 'minor')
            clue_sheet: 线索设计图路径

        Returns:
            更新后的项目元数据
        """
        project = self.load_project(project_name)

        if clue_type not in ['prop', 'location']:
            raise ValueError(f"无效的线索类型: {clue_type}，必须是 'prop' 或 'location'")

        if importance not in ['major', 'minor']:
            raise ValueError(f"无效的重要程度: {importance}，必须是 'major' 或 'minor'")

        project['clues'][name] = {
            'type': clue_type,
            'description': description,
            'importance': importance,
            'clue_sheet': clue_sheet or ''
        }

        self.save_project(project_name, project)
        return project

    def update_clue_sheet(
        self,
        project_name: str,
        name: str,
        sheet_path: str
    ) -> Dict:
        """
        更新线索设计图路径

        Args:
            project_name: 项目名称
            name: 线索名称
            sheet_path: 设计图路径

        Returns:
            更新后的项目元数据
        """
        project = self.load_project(project_name)

        if name not in project['clues']:
            raise KeyError(f"线索 '{name}' 不存在")

        project['clues'][name]['clue_sheet'] = sheet_path
        self.save_project(project_name, project)
        return project

    def get_clue(self, project_name: str, name: str) -> Dict:
        """
        获取线索定义

        Args:
            project_name: 项目名称
            name: 线索名称

        Returns:
            线索定义字典
        """
        project = self.load_project(project_name)

        if name not in project['clues']:
            raise KeyError(f"线索 '{name}' 不存在")

        return project['clues'][name]

    def get_pending_clues(self, project_name: str) -> List[Dict]:
        """
        获取待生成设计图的线索列表

        Args:
            project_name: 项目名称

        Returns:
            待处理线索列表（importance='major' 且无 clue_sheet）
        """
        project = self.load_project(project_name)
        project_dir = self.get_project_path(project_name)

        pending = []
        for name, clue in project['clues'].items():
            if clue.get('importance') == 'major':
                sheet = clue.get('clue_sheet')
                if not sheet or not (project_dir / sheet).exists():
                    pending.append({'name': name, **clue})

        return pending

    def get_clue_path(self, project_name: str, filename: str) -> Path:
        """获取线索设计图路径"""
        return self.get_project_path(project_name) / 'clues' / filename

    # ==================== 参考图收集工具 ====================

    def collect_reference_images(
        self,
        project_name: str,
        scene: Dict
    ) -> List[Path]:
        """
        收集场景所需的所有参考图

        Args:
            project_name: 项目名称
            scene: 场景字典

        Returns:
            参考图路径列表
        """
        project = self.load_project(project_name)
        project_dir = self.get_project_path(project_name)
        refs = []

        # 人物参考图
        for char in scene.get('characters_in_scene', []):
            char_data = project['characters'].get(char, {})
            sheet = char_data.get('character_sheet')
            if sheet:
                sheet_path = project_dir / sheet
                if sheet_path.exists():
                    refs.append(sheet_path)

        # 线索参考图
        for clue in scene.get('clues_in_scene', []):
            clue_data = project['clues'].get(clue, {})
            sheet = clue_data.get('clue_sheet')
            if sheet:
                sheet_path = project_dir / sheet
                if sheet_path.exists():
                    refs.append(sheet_path)

        return refs
