# AI Anime Generator Library
# 共享 Python 库，用于 Gemini API 封装和项目管理

# 首先初始化环境（激活 .venv，加载 .env）
from .env_init import PROJECT_ROOT

from .gemini_client import GeminiClient
from .project_manager import ProjectManager

__all__ = ['GeminiClient', 'ProjectManager', 'PROJECT_ROOT']
