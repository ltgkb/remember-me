"""Remember Me — Python Memory Engine.

提供对话文本的关键信息提取、语义搜索和备份管理能力。
"""

from .cli import main
from .extractor import ExtractedInfo, InfoExtractor, Insight
from .vector_index import SemanticSearchError, VectorIndex

__version__ = "0.4.0a1"
__all__ = [
    "InfoExtractor",
    "ExtractedInfo",
    "Insight",
    "main",
    "VectorIndex",
    "SemanticSearchError",
]
