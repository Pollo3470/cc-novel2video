"""
环境初始化模块

设置项目路径并加载 .env 文件。
"""

import os
import sys
from pathlib import Path


def init_environment():
    """
    初始化项目环境

    1. 定位项目根目录
    2. 添加项目根目录到 Python 路径
    3. 加载 .env 文件
    """
    # 获取项目根目录（lib 的父目录）
    lib_dir = Path(__file__).parent
    project_root = lib_dir.parent

    # 添加项目根目录到路径
    project_root_str = str(project_root)
    if project_root_str not in sys.path:
        sys.path.insert(0, project_root_str)

    # 加载 .env 文件
    try:
        from dotenv import load_dotenv
        env_path = project_root / '.env'
        if env_path.exists():
            load_dotenv(env_path)
        else:
            load_dotenv()
    except ImportError:
        pass  # python-dotenv 未安装时跳过

    return project_root


# 模块导入时自动初始化
PROJECT_ROOT = init_environment()
