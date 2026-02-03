"""
费用计算器

基于 docs/视频&图片生成费用表.md 中的费用规则，计算图片和视频生成的费用。
"""


class CostCalculator:
    """费用计算器"""

    # 图片费用（美元/张）
    # 基于 gemini-3-pro-image-preview 模型
    IMAGE_COST = {
        "1K": 0.134,
        "2K": 0.134,
        "4K": 0.24,
    }

    # 视频费用（美元/秒）
    # 基于 Veo 3.1 Standard 模型
    # 格式：(resolution, generate_audio): cost_per_second
    VIDEO_COST = {
        # 720p
        ("720p", True): 0.40,
        ("720p", False): 0.20,
        # 1080p
        ("1080p", True): 0.40,
        ("1080p", False): 0.20,
        # 4k
        ("4k", True): 0.60,
        ("4k", False): 0.40,
    }

    def calculate_image_cost(self, resolution: str = "2K") -> float:
        """
        计算图片生成费用

        Args:
            resolution: 图片分辨率 ('1K', '2K', '4K')

        Returns:
            费用（美元）
        """
        return self.IMAGE_COST.get(resolution.upper(), 0.134)

    def calculate_video_cost(
        self,
        duration_seconds: int,
        resolution: str = "1080p",
        generate_audio: bool = True
    ) -> float:
        """
        计算视频生成费用

        Args:
            duration_seconds: 视频时长（秒）
            resolution: 分辨率 ('720p', '1080p', '4k')
            generate_audio: 是否生成音频

        Returns:
            费用（美元）
        """
        resolution = resolution.lower()
        cost_per_second = self.VIDEO_COST.get(
            (resolution, generate_audio),
            0.40  # 默认 1080p 含音频
        )
        return duration_seconds * cost_per_second


# 单例实例，方便使用
cost_calculator = CostCalculator()
