"""
Gemini API 统一封装

提供图片生成和视频生成的统一接口。
"""

import os
import time
import base64
import functools
from pathlib import Path
from typing import Optional, List, Union, Tuple, Type, Dict
from PIL import Image
import io
import threading
from collections import deque

# 可重试的错误类型
RETRYABLE_ERRORS: Tuple[Type[Exception], ...] = (
    ConnectionError,
    TimeoutError,
)

# 尝试导入 Google API 错误类型
try:
    from google.api_core import exceptions as google_exceptions
    from google import genai # Import genai to access its errors

    RETRYABLE_ERRORS = RETRYABLE_ERRORS + (
        google_exceptions.ResourceExhausted,  # 429 Too Many Requests
        google_exceptions.ServiceUnavailable,  # 503
        google_exceptions.DeadlineExceeded,    # 超时
        google_exceptions.InternalServerError, # 500
        genai.errors.ClientError, # 4xx errors from new SDK
        genai.errors.ServerError, # 5xx errors from new SDK
    )
except ImportError:
    pass


class RateLimiter:
    """
    多模型滑动窗口限流器
    """
    def __init__(self, limits_dict: Dict[str, int] = None):
        """
        Args:
            limits_dict: {model_name: rpm} 字典。例如 {"gemini-3-pro-image-preview": 20}
        """
        self.limits = limits_dict or {}
        # 存储请求时间戳：{model_name: deque([timestamp1, timestamp2, ...])}
        self.request_logs: Dict[str, deque] = {}
        self.lock = threading.Lock()

    def acquire(self, model_name: str):
        """
        阻塞直到获得令牌
        """
        if model_name not in self.limits:
            return  # 该模型无限流配置

        limit = self.limits[model_name]
        if limit <= 0:
            return

        with self.lock:
            if model_name not in self.request_logs:
                self.request_logs[model_name] = deque()

            log = self.request_logs[model_name]

            while True:
                now = time.time()

                # 清理超过 60 秒的旧记录
                while log and now - log[0] > 60:
                    log.popleft()

                # 强制增加请求间隔（用户要求 > 3s）
                # 即使获得了令牌，也要确保距离上一次请求至少 3s
                # 获取最新的请求时间（可能是其他线程刚刚写入的）
                min_gap = float(os.environ.get('GEMINI_REQUEST_GAP', 3.1))
                if log:
                    last_request = log[-1]
                    gap = time.time() - last_request
                    if gap < min_gap:
                        time.sleep(min_gap - gap)
                        # 更新时间，重新检查
                        continue

                if len(log) < limit:
                    # 获取令牌成功
                    log.append(time.time())
                    return

                # 达到限制，计算等待时间
                # 等待直到最早的记录过期
                wait_time = 60 - (now - log[0]) + 0.1  # 多加 0.1s 缓冲
                if wait_time > 0:
                    time.sleep(wait_time)


def with_retry(
    max_attempts: int = 5,
    backoff_seconds: Tuple[int, ...] = (2, 4, 8, 16, 32),
    retryable_errors: Tuple[Type[Exception], ...] = RETRYABLE_ERRORS
):
    """
    带指数退避的重试装饰器
    """
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # 尝试提取 output_path 以便在日志中显示上下文
            output_path = kwargs.get('output_path')
            # 如果是位置参数，generate_image 的 output_path 是第 5 个参数 (self, prompt, ref, ar, output_path)
            if not output_path and len(args) > 4:
                output_path = args[4]

            context_str = ""
            if output_path:
                context_str = f"[{Path(output_path).name}] "

            last_error = None
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    # Catch ALL exceptions and check if they look like a retryable error
                    last_error = e
                    should_retry = False

                    # Check if it's in our explicit list
                    if isinstance(e, retryable_errors):
                        should_retry = True

                    # Check by string analysis (catch-all for 429/500/503)
                    error_str = str(e)
                    if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                        should_retry = True
                    elif '500' in error_str or 'InternalServerError' in error_str:
                        should_retry = True
                    elif '503' in error_str or 'ServiceUnavailable' in error_str:
                        should_retry = True

                    if not should_retry:
                        raise e

                    if attempt < max_attempts - 1:
                        # 确保不超过 backoff 数组长度
                        backoff_idx = min(attempt, len(backoff_seconds) - 1)
                        wait_time = backoff_seconds[backoff_idx]
                        print(f"⚠️  {context_str}捕获异常: {type(e).__name__} - {str(e)[:100]}...")
                        print(f"⚠️  {context_str}重试 {attempt + 1}/{max_attempts - 1}，{wait_time}秒后...")
                        time.sleep(wait_time)
            raise last_error
        return wrapper
    return decorator

# 加载 .env 文件
try:
    from dotenv import load_dotenv
    # 从项目根目录加载 .env
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # 也尝试从当前工作目录加载
        load_dotenv()
except ImportError:
    pass  # python-dotenv 未安装时跳过


class GeminiClient:
    """Gemini API 客户端封装"""

    def __init__(self, api_key: Optional[str] = None, rate_limiter: Optional[RateLimiter] = None):
        """
        初始化 Gemini 客户端

        支持两种后端：
        - AI Studio（默认）：使用 GEMINI_API_KEY
        - Vertex AI：使用 GCP 项目和应用默认凭据

        通过环境变量 GEMINI_BACKEND 切换：
        - GEMINI_BACKEND=aistudio（默认）
        - GEMINI_BACKEND=vertex

        Args:
            api_key: API 密钥（仅 AI Studio 模式），默认从环境变量 GEMINI_API_KEY 读取
            rate_limiter: 可选的限流器实例
        """
        from google import genai
        from google.genai import types

        self.types = types
        self.rate_limiter = rate_limiter
        self.backend = os.environ.get('GEMINI_BACKEND', 'aistudio').lower()

        if self.backend == 'vertex':
            # Vertex AI 模式（使用 API Key）
            self.api_key = api_key or os.environ.get('VERTEX_API_KEY')
            if not self.api_key:
                raise ValueError(
                    "使用 Vertex AI 后端时，VERTEX_API_KEY 环境变量必须设置\n"
                    "请在 .env 文件中添加：VERTEX_API_KEY=your-vertex-api-key"
                )

            self.client = genai.Client(
                vertexai=True,
                api_key=self.api_key
            )
            print("✓ 使用 Vertex AI 后端")
        else:
            # AI Studio 模式（默认）
            self.api_key = api_key or os.environ.get('GEMINI_API_KEY')
            if not self.api_key:
                raise ValueError(
                    "GEMINI_API_KEY 环境变量未设置\n"
                    "请在 .env 文件中添加：GEMINI_API_KEY=your-api-key"
                )

            self.client = genai.Client(api_key=self.api_key)
            print("✓ 使用 AI Studio 后端")

        # 模型配置（两种后端使用相同的模型名）
        self.IMAGE_MODEL = "gemini-3-pro-image-preview"
        self.VIDEO_MODEL = "veo-3.1-generate-preview"

    @with_retry(max_attempts=5, backoff_seconds=(2, 4, 8, 16, 32))
    def generate_image(
        self,
        prompt: str,
        reference_images: Optional[List[Union[str, Path, Image.Image]]] = None,
        aspect_ratio: str = "9:16",
        output_path: Optional[Union[str, Path]] = None
    ) -> Image.Image:
        """
        生成图片

        Args:
            prompt: 图片生成提示词
            reference_images: 参考图片列表（用于人物一致性）
            aspect_ratio: 宽高比，默认 9:16（竖屏）
            output_path: 可选的输出路径

        Returns:
            生成的 PIL Image 对象
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.IMAGE_MODEL)

        # 构建请求内容
        contents = [prompt]

        # 添加参考图片
        if reference_images:
            for img in reference_images:
                if isinstance(img, (str, Path)):
                    img = Image.open(img)
                contents.append(img)

        # 调用 API
        response = self.client.models.generate_content(
            model=self.IMAGE_MODEL,
            contents=contents,
            config=self.types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE'],
                image_config=self.types.ImageConfig(
                    aspect_ratio=aspect_ratio
                )
            )
        )

        # 提取生成的图片
        for part in response.parts:
            if part.inline_data is not None:
                image = part.as_image()

                if output_path:
                    output_path = Path(output_path)
                    output_path.parent.mkdir(parents=True, exist_ok=True)
                    image.save(output_path)

                return image

        raise RuntimeError("API 未返回图片")

    @with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
    def generate_image_with_chat(
        self,
        prompt: str,
        chat_session=None,
        reference_images: Optional[List[Union[str, Path, Image.Image]]] = None
    ) -> tuple:
        """
        使用多轮对话生成图片（保持上下文一致性）

        Args:
            prompt: 图片生成提示词
            chat_session: 现有的对话会话，如果为 None 则创建新会话
            reference_images: 参考图片列表

        Returns:
            (生成的图片, 对话会话) 元组
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.IMAGE_MODEL)

        if chat_session is None:
            chat_session = self.client.chats.create(
                model=self.IMAGE_MODEL
            )

        # 构建消息内容
        message_content = [prompt]
        if reference_images:
            for img in reference_images:
                if isinstance(img, (str, Path)):
                    img = Image.open(img)
                message_content.append(img)

        # 发送消息
        response = chat_session.send_message(message_content)

        # 提取图片
        for part in response.parts:
            if part.inline_data is not None:
                image = part.as_image()
                return image, chat_session

        raise RuntimeError("API 未返回图片")

    @with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
    def generate_video(
        self,
        prompt: str,
        start_image: Optional[Union[str, Path, Image.Image]] = None,
        reference_images: Optional[List[dict]] = None,
        aspect_ratio: str = "9:16",
        duration_seconds: str = "8",
        resolution: str = "720p",
        negative_prompt: str = "background music, BGM, soundtrack, musical accompaniment",
        output_path: Optional[Union[str, Path]] = None,
        poll_interval: int = 10,
        max_wait_time: int = 600
    ) -> Path:
        """
        生成视频

        Args:
            prompt: 视频生成提示词（支持对话和音效描述）
            start_image: 起始帧图片（image-to-video 模式）
            reference_images: 参考图片列表，格式为 [{"image": path, "description": str}]
            aspect_ratio: 宽高比，默认 9:16
            duration_seconds: 视频时长，可选 "4", "6", "8"
            resolution: 分辨率，可选 "720p", "1080p", "4k"
            negative_prompt: 负面提示词，指定不想要的元素（默认禁止 BGM）
            output_path: 输出路径
            poll_interval: 轮询间隔（秒）
            max_wait_time: 最大等待时间（秒）

        Returns:
            生成的视频文件路径

        Note:
            如需后续扩展视频，请使用 generate_video_with_ref() 方法
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.VIDEO_MODEL)

        # 添加参考图片（暂时禁用，与 image 参数可能冲突）
        # 注意：referenceImages 与 start_image 可能不能同时使用
        ref_imgs = None
        # if reference_images:
        #     ref_imgs = []
        #     for ref in reference_images:
        #         img = ref["image"]
        #         if isinstance(img, (str, Path)):
        #             img = Image.open(img)
        #         ref_imgs.append(
        #             self.types.VideoGenerationReferenceImage(
        #                 image=img
        #             )
        #         )
        #     # 使用参考图片时 duration 必须是 8
        #     duration_seconds = "8"

        # 构建配置
        config = self.types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds,
            negative_prompt=negative_prompt
        )

        # 准备起始帧（需要使用 types.Image 格式）
        image_param = None
        if start_image:
            if isinstance(start_image, (str, Path)):
                # 读取图片文件为 bytes
                with open(start_image, 'rb') as f:
                    image_bytes = f.read()
                # 确定 MIME 类型
                suffix = Path(start_image).suffix.lower()
                mime_types = {
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.webp': 'image/webp'
                }
                mime_type = mime_types.get(suffix, 'image/png')
                image_param = self.types.Image(
                    image_bytes=image_bytes,
                    mime_type=mime_type
                )
            elif isinstance(start_image, Image.Image):
                # 将 PIL Image 转换为 bytes
                buffer = io.BytesIO()
                start_image.save(buffer, format='PNG')
                image_bytes = buffer.getvalue()
                image_param = self.types.Image(
                    image_bytes=image_bytes,
                    mime_type='image/png'
                )
            else:
                image_param = start_image

        # 调用 API
        operation = self.client.models.generate_videos(
            model=self.VIDEO_MODEL,
            prompt=prompt,
            image=image_param,
            config=config
        )

        # 等待完成
        elapsed = 0
        while not operation.done:
            if elapsed >= max_wait_time:
                raise TimeoutError(f"视频生成超时（{max_wait_time}秒）")
            time.sleep(poll_interval)
            elapsed += poll_interval
            operation = self.client.operations.get(operation)
            print(f"视频生成中... 已等待 {elapsed} 秒")

        # 检查结果
        if not operation.response or not operation.response.generated_videos:
            print(f"DEBUG: Operation details: {operation}")
            if hasattr(operation, 'error') and operation.error:
                raise RuntimeError(f"视频生成失败: {operation.error}")
            raise RuntimeError("视频生成失败: API 返回空结果")

        # 下载视频
        generated_video = operation.response.generated_videos[0]

        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # 下载视频文件（根据官方文档）
            self.client.files.download(file=generated_video.video)
            generated_video.video.save(str(output_path))

            return output_path

        return generated_video

    @with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
    def generate_video_with_ref(
        self,
        prompt: str,
        start_image: Optional[Union[str, Path, Image.Image]] = None,
        aspect_ratio: str = "9:16",
        duration_seconds: str = "8",
        resolution: str = "720p",
        output_path: Optional[Union[str, Path]] = None,
        poll_interval: int = 10,
        max_wait_time: int = 600
    ) -> tuple:
        """
        生成视频并返回视频引用，用于后续扩展

        Args:
            prompt: 视频生成提示词（支持对话和音效描述）
            start_image: 起始帧图片（image-to-video 模式）
            aspect_ratio: 宽高比，默认 9:16
            duration_seconds: 视频时长，可选 "4", "6", "8"
            resolution: 分辨率，扩展模式必须使用 720p
            output_path: 输出路径
            poll_interval: 轮询间隔（秒）
            max_wait_time: 最大等待时间（秒）

        Returns:
            (output_path, video_ref, video_uri) 三元组
            - output_path: 视频文件路径
            - video_ref: Video 对象，用于当前会话的 extend_video()
            - video_uri: 字符串 URI，可保存用于跨会话恢复
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.VIDEO_MODEL)

        # 扩展模式必须使用 720p
        if resolution != "720p":
            print(f"⚠️  扩展模式分辨率限制为 720p，已自动调整")
            resolution = "720p"

        # 构建配置
        config = self.types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            duration_seconds=duration_seconds
        )

        # 准备起始帧
        image_param = self._prepare_image_param(start_image)

        # 调用 API
        operation = self.client.models.generate_videos(
            model=self.VIDEO_MODEL,
            prompt=prompt,
            image=image_param,
            config=config
        )

        # 等待完成
        elapsed = 0
        while not operation.done:
            if elapsed >= max_wait_time:
                raise TimeoutError(f"视频生成超时（{max_wait_time}秒）")
            time.sleep(poll_interval)
            elapsed += poll_interval
            operation = self.client.operations.get(operation)
            print(f"视频生成中... 已等待 {elapsed} 秒")

        # 检查结果
        if not operation.response or not operation.response.generated_videos:
            print(f"DEBUG: Operation details: {operation}")
            if hasattr(operation, 'error') and operation.error:
                raise RuntimeError(f"视频生成失败: {operation.error}")
            raise RuntimeError("视频生成失败: API 返回空结果")

        # 获取生成的视频和引用
        generated_video = operation.response.generated_videos[0]
        video_ref = generated_video.video

        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # 下载视频文件
            self.client.files.download(file=video_ref)
            video_ref.save(str(output_path))

            return output_path, video_ref, video_ref.uri

        return None, video_ref, video_ref.uri

    @with_retry(max_attempts=3, backoff_seconds=(2, 4, 8))
    def extend_video(
        self,
        video_ref,
        prompt: str,
        output_path: Optional[Union[str, Path]] = None,
        poll_interval: int = 10,
        max_wait_time: int = 600
    ) -> tuple:
        """
        扩展现有视频（每次 +7 秒，最多扩展 20 次）

        Args:
            video_ref: 上一次生成的视频引用对象
                      （来自 generate_video_with_ref 或 extend_video 的返回值）
            prompt: 扩展提示词，描述接下来的场景内容
            output_path: 输出路径
            poll_interval: 轮询间隔（秒）
            max_wait_time: 最大等待时间（秒）

        Returns:
            (output_path, new_video_ref, new_video_uri) 三元组
            - output_path: 扩展后的视频文件路径
            - new_video_ref: 新的 Video 对象，用于继续扩展
            - new_video_uri: 字符串 URI，可保存用于跨会话恢复

        Raises:
            ValueError: video_ref 无效
            RuntimeError: 视频扩展失败
            TimeoutError: 扩展超时

        Note:
            - 仅支持 Veo 3.1 模型生成的视频
            - 视频在服务器保存 2 天，扩展时重置计时器
            - 单个视频最长 148 秒
        """
        # 应用限流
        if self.rate_limiter:
            self.rate_limiter.acquire(self.VIDEO_MODEL)

        if video_ref is None:
            raise ValueError("video_ref 不能为空，请先使用 generate_video_with_ref() 生成初始视频")

        # 扩展视频配置（必须使用 720p）
        config = self.types.GenerateVideosConfig(
            number_of_videos=1,
            resolution="720p"
        )

        # 调用扩展 API
        operation = self.client.models.generate_videos(
            model=self.VIDEO_MODEL,
            video=video_ref,
            prompt=prompt,
            config=config
        )

        # 等待完成
        elapsed = 0
        while not operation.done:
            if elapsed >= max_wait_time:
                raise TimeoutError(f"视频扩展超时（{max_wait_time}秒）")
            time.sleep(poll_interval)
            elapsed += poll_interval
            operation = self.client.operations.get(operation)
            print(f"视频扩展中... 已等待 {elapsed} 秒")

        # 检查结果
        if not operation.response or not operation.response.generated_videos:
            raise RuntimeError("视频扩展失败")

        # 获取扩展后的视频和新引用
        generated_video = operation.response.generated_videos[0]
        new_video_ref = generated_video.video

        if output_path:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            # 下载视频文件
            self.client.files.download(file=new_video_ref)
            new_video_ref.save(str(output_path))

            return output_path, new_video_ref, new_video_ref.uri

        return None, new_video_ref, new_video_ref.uri

    def restore_video_ref(self, video_uri: str):
        """
        从保存的 URI 恢复视频引用对象

        Args:
            video_uri: 之前保存的视频 URI（如 "https://generativelanguage.googleapis.com/..."）

        Returns:
            types.Video 对象，可用于 extend_video()

        Note:
            - 视频在服务器保存 2 天
            - 每次 extend 会重置 2 天计时器
            - 如果视频已过期，将抛出异常
        """
        if not video_uri:
            raise ValueError("video_uri 不能为空")

        return self.types.Video(uri=video_uri)

    def _prepare_image_param(
        self,
        image: Optional[Union[str, Path, Image.Image]]
    ):
        """
        准备图片参数用于 API 调用

        Args:
            image: 图片路径或 PIL Image 对象

        Returns:
            types.Image 对象或 None
        """
        if image is None:
            return None

        mime_type_png = 'image/png'

        if isinstance(image, (str, Path)):
            # 读取图片文件为 bytes
            with open(image, 'rb') as f:
                image_bytes = f.read()
            # 确定 MIME 类型
            suffix = Path(image).suffix.lower()
            mime_types = {
                '.png': mime_type_png,
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            }
            mime_type = mime_types.get(suffix, mime_type_png)
            return self.types.Image(
                image_bytes=image_bytes,
                mime_type=mime_type
            )
        elif isinstance(image, Image.Image):
            # 将 PIL Image 转换为 bytes
            buffer = io.BytesIO()
            image.save(buffer, format='PNG')
            image_bytes = buffer.getvalue()
            return self.types.Image(
                image_bytes=image_bytes,
                mime_type=mime_type_png
            )
        else:
            return image
