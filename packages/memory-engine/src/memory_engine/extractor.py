"""信息提取器 — 从对话文本中提取关键信息。"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import ClassVar


@dataclass
class ExtractedInfo:
    """提取的关键信息条目。"""

    type: str  # 'decision', 'term', 'todo', 'date', 'role'
    raw_text: str
    suggested_title: str | None = None
    confidence: float = 0.0  # 0.0 - 1.0


@dataclass
class Insight:
    """基于提取信息生成的洞察。"""

    category: str
    summary: str
    related_indices: list[int] = field(default_factory=list)
    severity: str = "info"  # 'info', 'warning', 'critical'


class InfoExtractor:
    """从对话文本中提取关键信息。

    支持提取决策、术语定义、待办任务、日期/时间和角色信息。
    所有方法均为纯函数风格，不维护内部状态。
    """

    # ------------------------------------------------------------------
    # 正则规则定义
    # ------------------------------------------------------------------
    _DECISION_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"(?:决定|采用|选择|确定|选用|使用|启用|配置为|设置为|定为)"
        r"(?:了|为|：|\s)*([^。！？\n]{3,80})",
        re.IGNORECASE,
    )

    _TERM_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"(?!TODO|FIXME|HACK|NOTE|待办)([^\s:：=。！？\n]{2,20})"
        r"(?:\s*[:=]\s*|\s*是指\s*|\s*定义为\s*)"
        r"([^。！？\n]{2,100})",
    )

    _TODO_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"(?:TODO|FIXME|待办|需要|必须|应该|应当)"
        r"(?:\s*[:：]\s*|\s+)([^。！？\n]{3,100})",
        re.IGNORECASE,
    )

    _DATE_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日]?"
        r"|\d{4}[-/]\d{1,2}[-/]\d{1,2}"
        r"|(?:下周|明天|后天|今天|昨[天日]|上[周月]|本[周月]|下[周月])"
        r"|\d{1,2}[:：]\d{2}(?:\s*[AaPp][Mm])?"
        r"|(?:[一二三四五六七八九十]{1,4}|\d{1,2})月"
        r"(?:[一二三四五六七八九十]{1,3}|\d{1,2})?[日号]?)",
    )

    _ROLE_RE: ClassVar[re.Pattern[str]] = re.compile(
        r"(产品经理|项目经理|开发人员|工程师|架构师|设计师|测试|运维|"
        r"前端|后端|全栈|DevOps|数据科学家|研究员|分析师|"
        r"技术负责人|团队领导|CTO|CEO|主管|经理|总监|"
        r"用户|客户|供应商|合作伙伴|顾问|专家|"
        r"Python|JavaScript|TypeScript|Java|Go|Rust|C\+\+|"
        r"博士|硕士|本科|研究生|教授|讲师)(?:工程师|人员|开发者)?",
        re.IGNORECASE,
    )

    # 置信度调节参数
    _SENTENCE_START_BONUS: ClassVar[float] = 0.15
    _LENGTH_OPTIMAL_MIN: ClassVar[int] = 10
    _LENGTH_OPTIMAL_MAX: ClassVar[int] = 60
    _KEYWORD_DENSITY_WEIGHT: ClassVar[float] = 0.10

    # ------------------------------------------------------------------
    # 公共 API
    # ------------------------------------------------------------------

    def extract(self, text: str) -> list[ExtractedInfo]:
        """提取文本中所有类型的关键信息。

        Args:
            text: 待分析的原始对话文本。

        Returns:
            按置信度降序排列的提取结果列表。
        """
        if not text or not text.strip():
            return []

        results: list[ExtractedInfo] = []

        # 规则1: 决策检测
        for match in self._DECISION_RE.finditer(text):
            confidence = self.calculate_confidence(match, text)
            raw = match.group(0)
            suggested = self._generate_decision_title(raw, match.group(1))
            results.append(
                ExtractedInfo(
                    type="decision",
                    raw_text=raw,
                    suggested_title=suggested,
                    confidence=round(confidence, 3),
                )
            )

        # 规则2: 术语定义检测
        for match in self._TERM_RE.finditer(text):
            confidence = self.calculate_confidence(match, text)
            raw = match.group(0)
            term = match.group(1).strip()
            # 过滤常见标记词误匹配（如 TODO 的后缀 ODO）
            if term.upper() in ("TODO", "FIXME", "HACK", "NOTE", "BUG", "XXX", "ODO", "TBD"):
                continue
            suggested = f"术语: {term}"
            # 术语定义置信度略高，因为有明确结构
            confidence = min(1.0, confidence + 0.05)
            results.append(
                ExtractedInfo(
                    type="term",
                    raw_text=raw,
                    suggested_title=suggested,
                    confidence=round(confidence, 3),
                )
            )

        # 规则3: 待办/任务检测
        for match in self._TODO_RE.finditer(text):
            confidence = self.calculate_confidence(match, text)
            raw = match.group(0)
            suggested = self._generate_todo_title(match.group(1).strip())
            results.append(
                ExtractedInfo(
                    type="todo",
                    raw_text=raw,
                    suggested_title=suggested,
                    confidence=round(confidence, 3),
                )
            )

        # 规则4: 日期/时间检测
        for match in self._DATE_RE.finditer(text):
            confidence = self.calculate_confidence(match, text)
            raw = match.group(0)
            results.append(
                ExtractedInfo(
                    type="date",
                    raw_text=raw,
                    suggested_title=f"时间提及: {raw}",
                    confidence=round(confidence, 3),
                )
            )

        # 规则5: 人名/角色检测
        for match in self._ROLE_RE.finditer(text):
            confidence = self.calculate_confidence(match, text)
            raw = match.group(0)
            end_pos = match.end()
            # 过滤被英文字母紧跟的短匹配（如 Kolmogorov-Smirnov 中的 Go）
            if end_pos < len(text) and text[end_pos].isascii() and text[end_pos].isalpha() and len(raw) <= 4:
                continue
            results.append(
                ExtractedInfo(
                    type="role",
                    raw_text=raw,
                    suggested_title=f"角色: {raw}",
                    confidence=round(min(1.0, confidence + 0.08), 3),
                )
            )

        # 去重：相同 raw_text 保留置信度最高的
        seen: dict[str, ExtractedInfo] = {}
        for info in results:
            if info.raw_text not in seen or seen[info.raw_text].confidence < info.confidence:
                seen[info.raw_text] = info

        # 按置信度降序排列
        return sorted(seen.values(), key=lambda x: x.confidence, reverse=True)

    def generate_insights(self, extracted: list[ExtractedInfo]) -> list[Insight]:
        """将提取的信息聚合为高层洞察。

        Args:
            extracted: ``extract()`` 的输出列表。

        Returns:
            洞察列表，包含分类汇总和潜在风险提示。
        """
        if not extracted:
            return []

        insights: list[Insight] = []
        by_type: dict[str, list[tuple[int, ExtractedInfo]]] = {
            "decision": [],
            "term": [],
            "todo": [],
            "date": [],
            "role": [],
        }

        for idx, info in enumerate(extracted):
            by_type.setdefault(info.type, []).append((idx, info))

        # 决策洞察
        decisions = by_type.get("decision", [])
        if len(decisions) >= 3:
            insights.append(
                Insight(
                    category="密集决策",
                    summary=f"文本中包含 {len(decisions)} 项决策，"
                    f"建议复核决策间的一致性和依赖关系。",
                    related_indices=[i for i, _ in decisions],
                    severity="warning",
                )
            )
        elif decisions:
            high_conf = [i for i, d in decisions if d.confidence >= 0.8]
            insights.append(
                Insight(
                    category="关键决策",
                    summary=f"识别到 {len(decisions)} 项决策"
                    f"（高置信度 {len(high_conf)} 项）。",
                    related_indices=[i for i, _ in decisions],
                    severity="info",
                )
            )

        # 术语洞察
        terms = by_type.get("term", [])
        if terms:
            insights.append(
                Insight(
                    category="术语定义",
                    summary=f"发现 {len(terms)} 个术语定义，"
                    f"建议统一词汇表以避免沟通歧义。",
                    related_indices=[i for i, _ in terms],
                    severity="info",
                )
            )

        # 待办洞察
        todos = by_type.get("todo", [])
        if todos:
            high_priority = [i for i, t in todos if t.confidence >= 0.75]
            insights.append(
                Insight(
                    category="待办任务",
                    summary=f"提取 {len(todos)} 项待办"
                    f"（高优先级 {len(high_priority)} 项）。",
                    related_indices=[i for i, _ in todos],
                    severity="warning" if len(todos) > 5 else "info",
                )
            )

        # 角色洞察
        roles = by_type.get("role", [])
        if len(roles) >= 2:
            role_names = {r.raw_text for _, r in roles}
            insights.append(
                Insight(
                    category="多方参与",
                    summary=f"涉及 {len(role_names)} 种角色/身份，"
                    f"需关注职责边界和协作流程。",
                    related_indices=[i for i, _ in roles],
                    severity="info",
                )
            )

        # 日期洞察
        dates = by_type.get("date", [])
        if len(dates) >= 3:
            insights.append(
                Insight(
                    category="时间敏感",
                    summary=f"检测到 {len(dates)} 个时间提及，"
                    f"可能存在截止日或里程碑。",
                    related_indices=[i for i, _ in dates],
                    severity="warning",
                )
            )

        return insights

    def calculate_confidence(self, match: re.Match[str], text: str) -> float:
        """计算单次正则匹配的置信度 (0.0–1.0)。

        综合以下因素：
        1. **句首位置**：匹配出现在句子开头时加分。
        2. **文本长度**：长度在最佳区间内的匹配得分最高。
        3. **关键词密度**：匹配文本中包含更多上下文关键词时加分。
        4. **基础分**：所有有效匹配至少获得 0.5 的基础置信度。

        Args:
            match: ``re.Match`` 对象。
            text: 原始完整文本。

        Returns:
            0.0 到 1.0 之间的浮点数。
        """
        matched_text = match.group(0)
        start_pos = match.start()

        score = 0.5  # 基础分

        # 因素1: 句首位置加分
        if self._is_sentence_start(start_pos, text):
            score += self._SENTENCE_START_BONUS

        # 因素2: 文本长度评分（高斯型）
        length_score = self._length_score(len(matched_text))
        score += length_score * 0.25

        # 因素3: 关键词密度
        keyword_bonus = self._keyword_density_bonus(matched_text)
        score += keyword_bonus * self._KEYWORD_DENSITY_WEIGHT

        return min(1.0, max(0.0, score))

    # ------------------------------------------------------------------
    # 内部辅助
    # ------------------------------------------------------------------

    def _is_sentence_start(self, pos: int, text: str) -> bool:
        """判断匹配位置是否处于句子开头（句首或段落首）。"""
        if pos == 0:
            return True
        # 向前查找最近的句末标点或换行
        search_start = max(0, pos - 20)
        prefix = text[search_start:pos]
        # 如果前面紧邻的是句末标点或换行，则认为是句首
        stripped = prefix.rstrip()
        if not stripped:
            return True
        return stripped[-1] in "。！？\n"

    def _length_score(self, length: int) -> float:
        """根据匹配文本长度计算评分（最佳区间得分最高）。"""
        if length < self._LENGTH_OPTIMAL_MIN:
            # 太短，线性衰减
            return length / self._LENGTH_OPTIMAL_MIN
        if length <= self._LENGTH_OPTIMAL_MAX:
            # 最佳区间
            return 1.0
        # 太长，缓慢衰减
        excess = length - self._LENGTH_OPTIMAL_MAX
        return max(0.3, 1.0 - excess / 200.0)

    def _keyword_density_bonus(self, text: str) -> float:
        """根据匹配文本中的上下文关键词密度计算额外加分。"""
        context_keywords = {
            # 决策相关
            "决定", "采用", "选择", "确定", "方案", "策略",
            # 术语相关
            "定义", "是指", "概念", "术语",
            # 待办相关
            "完成", "处理", "解决", "推进", "落实",
            # 时间相关
            "截止", "期限", "之前", "之后", "开始", "结束",
            # 角色相关
            "负责", "主导", "协助", "配合", "汇报",
        }
        matched_lower = text.lower()
        hits = sum(1 for kw in context_keywords if kw in matched_lower)
        # 最多 5 个关键词达到满分密度加分
        return min(1.0, hits / 5.0)

    def _generate_decision_title(self, raw: str, capture: str | None) -> str:
        """为决策类匹配生成建议标题。"""
        if capture:
            content = capture.strip()
            if len(content) > 30:
                content = content[:27] + "..."
            return f"决策: {content}"
        return f"决策: {raw[:30]}"

    def _generate_todo_title(self, content: str) -> str:
        """为待办类匹配生成建议标题。"""
        if len(content) > 35:
            content = content[:32] + "..."
        return f"待办: {content}"
