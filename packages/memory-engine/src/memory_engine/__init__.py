"""Remember Me — Python Memory Engine.

提供对话文本的关键信息提取、语义搜索和备份管理能力。
"""

from .extractor import ExtractedInfo, InfoExtractor, Insight
from .cli import main
from .vector_index import SemanticSearchError, VectorIndex

__version__ = "0.3.0"
__all__ = [
    "InfoExtractor",
    "ExtractedInfo",
    "Insight",
    "main",
    "VectorIndex",
    "SemanticSearchError",
]
