"""
版本管理 API 路由

处理版本查询和还原请求。
"""

from pathlib import Path
from fastapi import APIRouter, HTTPException

from lib.project_manager import ProjectManager
from lib.version_manager import VersionManager

router = APIRouter()

# 初始化项目管理器
project_root = Path(__file__).parent.parent.parent.parent
pm = ProjectManager(project_root / "projects")


def get_version_manager(project_name: str) -> VersionManager:
    """获取项目的版本管理器"""
    project_path = pm.get_project_path(project_name)
    return VersionManager(project_path)


# ==================== 版本查询 ====================

@router.get("/projects/{project_name}/versions/{resource_type}/{resource_id}")
async def get_versions(
    project_name: str,
    resource_type: str,
    resource_id: str
):
    """
    获取资源的所有版本列表

    Args:
        project_name: 项目名称
        resource_type: 资源类型 (storyboards, videos, characters, clues)
        resource_id: 资源 ID
    """
    try:
        vm = get_version_manager(project_name)
        versions_info = vm.get_versions(resource_type, resource_id)

        return {
            "resource_type": resource_type,
            "resource_id": resource_id,
            **versions_info
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 版本还原 ====================

@router.post("/projects/{project_name}/versions/{resource_type}/{resource_id}/restore/{version}")
async def restore_version(
    project_name: str,
    resource_type: str,
    resource_id: str,
    version: int
):
    """
    还原到指定版本

    会先备份当前版本，然后将指定版本复制到当前路径。

    Args:
        project_name: 项目名称
        resource_type: 资源类型
        resource_id: 资源 ID
        version: 要还原的版本号
    """
    try:
        vm = get_version_manager(project_name)
        project_path = pm.get_project_path(project_name)

        # 确定当前文件路径
        if resource_type == "storyboards":
            current_file = project_path / "storyboards" / f"scene_{resource_id}.png"
        elif resource_type == "videos":
            current_file = project_path / "videos" / f"scene_{resource_id}.mp4"
        elif resource_type == "characters":
            current_file = project_path / "characters" / f"{resource_id}.png"
        elif resource_type == "clues":
            current_file = project_path / "clues" / f"{resource_id}.png"
        else:
            raise HTTPException(status_code=400, detail=f"不支持的资源类型: {resource_type}")

        # 执行还原
        result = vm.restore_version(
            resource_type=resource_type,
            resource_id=resource_id,
            version=version,
            current_file=current_file
        )

        return {
            "success": True,
            **result
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
