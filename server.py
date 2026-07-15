#!/usr/bin/env python3
"""Trading Ops Ascent origin API and local development server."""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
DIST_ROOT = ROOT / "dist"
DEFAULT_DB = ROOT / "data" / "trading_ops_ascent.db"
MAX_BODY_BYTES = 2_000_000
MAX_STATE_BYTES = 1_800_000
PROFILE_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,40}$")
REQUEST_ID_PATTERN = re.compile(r"^[a-zA-Z0-9._:-]{1,80}$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SCHEMA_VERSION = 2
API_VERSION = "1"
PRACTICE_RUN_MODES = {
    "adaptive", "calibration", "daily", "review", "stage", "weak", "sprint", "heaven", "hell",
    "boss", "full", "checkpoint", "single", "random", "remediation", "triage", "shift", "coach", "custom",
    "saved", "run-replay", "run-repair",
}
PRACTICE_RUN_ORIGINS = {"bank", "path", "incident", "triage", "shift", "coach", "audit", "plan"}
PRACTICE_RUN_OUTCOMES = {"clean", "recovered", "eliminated", "skipped"}
PRACTICE_RUN_CALIBRATIONS = {
    "unrated", "calibrated", "balanced", "overconfident", "underconfident", "needs-work",
}
TRAINING_PLAN_MINUTES = {30, 60, 90, 120}
TRAINING_PLAN_INTENSITIES = {"focused", "balanced", "pressure"}
TRAINING_PLAN_TYPES = {"repair", "review", "module", "checkpoint", "guide", "drill", "adaptive", "incident", "triage", "coach", "shift"}
TRAINING_PLAN_ITEM_STATUSES = {"pending", "active", "complete", "skipped"}
TRAINING_PLAN_STATUSES = {"active", "complete", "archived"}
SHIFT_TEMPLATE_PHASES = {
    "eu-open-control": ("preopen", "open", "live", "close"),
    "resilience-day": ("preopen", "open", "live", "close"),
}
TRIAGE_TEMPLATE_META = {
    "triage-stale-route": ("feed", "sev2", "consumer-route", "protect-route", 7),
    "triage-sequence-divergence": ("feed", "sev2", "channel-partition", "quarantine-rebuild", 7),
    "triage-reject-cascade": ("orders", "sev2", "strategy-route", "throttle-protect", 7),
    "triage-limit-epoch": ("risk", "sev1", "firm-control-plane", "firm-no-go", 7),
    "triage-clock-domain": ("monitoring", "sev2", "clock-domain", "hold-time-sensitive", 7),
    "triage-open-capacity": ("capacity", "sev2", "hot-partition", "protect-shed", 7),
    "triage-volatility-halt": ("sessions", "sev3", "instrument-family", "phase-aware-hold", 7),
}
TRIAGE_DIMENSIONS = (
    ("severity", "severityScore", 15),
    ("scope", "scopeScore", 15),
    ("control", "controlScore", 30),
    ("evidence", "evidenceScore", 25),
    ("dispatch", "dispatchScore", 15),
)
TRIAGE_SEVERITIES = {"sev1", "sev2", "sev3", "sev4"}
COACH_PROMPT_META = {
    "coach-intro": ("positioning", "core", "interview", 60),
    "coach-why-role": ("positioning", "core", "interview", 60),
    "coach-why-firm": ("positioning", "hard", "interview", 75),
    "coach-gap": ("positioning", "hard", "interview", 75),
    "coach-star-incident": ("behavioral", "core", "incident", 90),
    "coach-star-monitoring": ("behavioral", "core", "monitoring", 90),
    "coach-star-capacity": ("behavioral", "hard", "capacity", 90),
    "coach-star-disagreement": ("behavioral", "hard", "incident", 90),
    "coach-stale-green": ("technical", "core", "feed", 90),
    "coach-sequence-gap": ("technical", "hard", "feed", 100),
    "coach-latency-path": ("technical", "hard", "feed", 90),
    "coach-redundant-diverge": ("technical", "hft", "feed", 110),
    "coach-reject-spike": ("technical", "core", "orders", 90),
    "coach-unknown-order": ("technical", "hft", "orders", 110),
    "coach-position-break": ("technical", "hard", "risk", 100),
    "coach-preopen": ("technical", "core", "sessions", 90),
    "coach-capacity-open": ("technical", "hft", "capacity", 110),
    "coach-auction-extension": ("technical", "hard", "sessions", 90),
    "coach-mifid": ("technical", "hard", "risk", 90),
    "coach-dashboard-denominator": ("defense", "core", "monitoring", 90),
    "coach-dashboard-tail": ("defense", "hard", "monitoring", 90),
    "coach-dashboard-causality": ("defense", "hard", "monitoring", 100),
    "coach-dashboard-audit": ("defense", "hft", "risk", 110),
    "coach-dispatch": ("defense", "hft", "incident", 120),
}
COACH_CATEGORY_RUBRICS = {
    "positioning": (
        ("identity", "Production identity"),
        ("transfer", "Role transfer"),
        ("proof", "Evidence of ownership"),
        ("role", "Role fit"),
        ("motivation", "Credible motivation"),
    ),
    "behavioral": (
        ("situation", "Situation and stakes"),
        ("ownership", "Your responsibility"),
        ("action", "Evidence-led action"),
        ("pressure", "Calm control"),
        ("result", "Result and learning"),
    ),
    "technical": (
        ("scope", "Scope and context"),
        ("risk", "Trading risk"),
        ("evidence", "Decisive evidence"),
        ("control", "Control and escalation"),
        ("closeout", "Communication and recovery"),
    ),
    "defense": (
        ("claim", "Claim boundary"),
        ("semantics", "Metric semantics"),
        ("evidence", "Corroborating evidence"),
        ("decision", "Operational decision"),
        ("improvement", "Production improvement"),
    ),
}
COACH_PROMPT_ANCHORS = {
    "coach-intro": "Anchor statement",
    "coach-why-role": "Role motivation",
    "coach-why-firm": "Environment fit",
    "coach-gap": "Gap and plan",
    "coach-star-incident": "Incident specificity",
    "coach-star-monitoring": "Decision-grade monitoring",
    "coach-star-capacity": "Capacity proof",
    "coach-star-disagreement": "Constructive challenge",
    "coach-stale-green": "Staleness discrimination",
    "coach-sequence-gap": "Recovery boundary",
    "coach-latency-path": "Timestamp path",
    "coach-redundant-diverge": "First divergent event",
    "coach-reject-spike": "Reject denominator",
    "coach-unknown-order": "Lifecycle truth",
    "coach-position-break": "Position equation",
    "coach-preopen": "Pre-open invariant",
    "coach-capacity-open": "Queue growth math",
    "coach-auction-extension": "Authoritative phase",
    "coach-mifid": "Operational regulation",
    "coach-dashboard-denominator": "Denominator challenge",
    "coach-dashboard-tail": "Tail-risk interpretation",
    "coach-dashboard-causality": "Causal timeline",
    "coach-dashboard-audit": "Auditability design",
    "coach-dispatch": "Dispatch completeness",
}
STATE_OBJECT_FIELDS = {
    "completed",
    "awards",
    "scenarioScores",
    "scenarioStep",
    "scenarioStage",
    "scenarioResult",
    "scenarioAnswers",
    "scenarioAftershockAnswers",
    "scenarioAftershockResult",
    "drillScores",
    "stageQuizScores",
    "cardRatings",
    "questionStats",
    "questionFavorites",
    "dailyXp",
    "dailyActivity",
    "nodeNotes",
    "customPlaylists",
    "claimedShiftRewards",
    "coachDrafts",
}
SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; "
        "worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; "
        "frame-ancestors 'self'"
    ),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def request_id(value: str | None = None) -> str:
    if value and REQUEST_ID_PATTERN.fullmatch(value):
        return value
    return uuid.uuid4().hex


def state_etag(profile_id: str, revision: int) -> str:
    return f'"state-{profile_id}-r{revision}"'


def etag_matches(header_value: str | None, expected: str) -> bool:
    if not header_value:
        return False
    expected_value = expected.removeprefix("W/")
    return any(
        candidate.strip().removeprefix("W/") in {"*", expected_value}
        for candidate in header_value.split(",")
    )


def revision_from_etag(value: str | None, profile_id: str) -> int | None:
    if not value:
        return None
    match = re.fullmatch(rf'(?:W/)?"state-{re.escape(profile_id)}-r(\d+)"', value.strip())
    if not match:
        raise ValueError("If-Match must contain the current state ETag")
    return int(match.group(1))


class RevisionConflict(Exception):
    def __init__(self, revision: int, updated_at: str | None):
        super().__init__(f"Expected revision does not match current revision {revision}")
        self.revision = revision
        self.updated_at = updated_at


class PayloadTooLarge(ValueError):
    pass


def validate_scenario_history(entries: list[dict[str, Any]]) -> None:
    score_limits = {
        "commandScore": 100,
        "commandDecisionScore": 35,
        "commandEvidenceScore": 35,
        "commandDispatchScore": 30,
        "recoveryScore": 100,
        "recoveryDecisionScore": 35,
        "recoveryEvidenceScore": 35,
        "recoveryHandoffScore": 30,
        "composite": 100,
    }
    index_fields = (
        "commandDecision",
        "recoveryDecision",
    )
    evidence_fields = (
        "commandEvidenceSelected",
        "recoveryEvidenceSelected",
    )
    missing_fields = (
        "commandMissing",
        "recoveryMissing",
    )
    text_limits = {
        "id": 100,
        "at": 64,
        "scenarioId": 80,
        "commandDispatchText": 1200,
        "recoveryHandoffText": 1200,
        "commandRationale": 500,
        "recoveryRationale": 500,
        "remediationCycleId": 100,
        "transferReviewId": 100,
        "transferKind": 20,
    }

    for entry in entries:
        for field, maximum in score_limits.items():
            if field not in entry:
                continue
            value = entry[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= maximum:
                raise ValueError(f"scenarioHistory.{field} must be a number between 0 and {maximum}")
        for field in index_fields:
            value = entry.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, int) or value < 0):
                raise ValueError(f"scenarioHistory.{field} must be a non-negative integer or null")
        attempt = entry.get("attempt")
        if attempt is not None and (isinstance(attempt, bool) or not isinstance(attempt, int) or not 1 <= attempt <= 100_000):
            raise ValueError("scenarioHistory.attempt must be an integer between 1 and 100000")
        branch = entry.get("branch")
        if branch is not None and branch not in ("contained", "escalated"):
            raise ValueError("scenarioHistory.branch is invalid")
        transfer_kind = entry.get("transferKind")
        if transfer_kind not in (None, "", "immediate", "retention"):
            raise ValueError("scenarioHistory.transferKind is invalid")
        for field in evidence_fields:
            value = entry.get(field, [])
            if not isinstance(value, list) or len(value) > 20:
                raise ValueError(f"scenarioHistory.{field} must be an array of at most 20 indexes")
            if any(isinstance(index, bool) or not isinstance(index, int) or index < 0 for index in value):
                raise ValueError(f"scenarioHistory.{field} must contain non-negative integers")
        for field in missing_fields:
            value = entry.get(field, [])
            if not isinstance(value, list) or len(value) > 20:
                raise ValueError(f"scenarioHistory.{field} must be an array of at most 20 labels")
            if any(not isinstance(label, str) or len(label) > 100 for label in value):
                raise ValueError(f"scenarioHistory.{field} must contain labels of at most 100 characters")
        for field, maximum in text_limits.items():
            if field in entry and (not isinstance(entry[field], str) or len(entry[field]) > maximum):
                raise ValueError(f"scenarioHistory.{field} must be a string of at most {maximum} characters")


def validate_remediation_cycles(entries: list[dict[str, Any]]) -> None:
    score_fields = (
        "baselineComposite",
        "baselineTargetScore",
        "quizScore",
        "quizBestScore",
        "retestComposite",
        "retestTargetScore",
    )
    delta_fields = ("compositeDelta", "targetDelta")
    text_limits = {
        "id": 100,
        "baselineRunId": 100,
        "retestRunId": 100,
        "scenarioId": 80,
        "createdAt": 64,
        "quizFinishedAt": 64,
        "completedAt": 64,
    }
    allowed_statuses = {"repairing", "retest-ready", "verified", "needs-review"}
    allowed_components = {"decision", "evidence", "communication"}

    for entry in entries:
        for field in score_fields:
            value = entry.get(field)
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100:
                raise ValueError(f"remediationCycles.{field} must be a number between 0 and 100 or null")
        for field in delta_fields:
            value = entry.get(field)
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not -100 <= value <= 100:
                raise ValueError(f"remediationCycles.{field} must be a number between -100 and 100 or null")
        for field, maximum in text_limits.items():
            if field in entry and (not isinstance(entry[field], str) or len(entry[field]) > maximum):
                raise ValueError(f"remediationCycles.{field} must be a string of at most {maximum} characters")
        status = entry.get("status", "repairing")
        if status not in allowed_statuses:
            raise ValueError("remediationCycles.status is invalid")
        component = entry.get("targetComponent", "decision")
        if component not in allowed_components:
            raise ValueError("remediationCycles.targetComponent is invalid")
        for field in ("id", "baselineRunId", "scenarioId"):
            if not entry.get(field):
                raise ValueError(f"remediationCycles.{field} is required")
        question_ids = entry.get("questionIds", [])
        if not isinstance(question_ids, list) or len(question_ids) > 20:
            raise ValueError("remediationCycles.questionIds must be an array of at most 20 question IDs")
        if any(not isinstance(question_id, str) or len(question_id) > 40 for question_id in question_ids):
            raise ValueError("remediationCycles.questionIds must contain strings of at most 40 characters")
        quiz_attempts = entry.get("quizAttempts", 0)
        if isinstance(quiz_attempts, bool) or not isinstance(quiz_attempts, int) or not 0 <= quiz_attempts <= 1000:
            raise ValueError("remediationCycles.quizAttempts must be an integer between 0 and 1000")
        for field in ("quizClean", "quizRecovered", "quizMistakes"):
            value = entry.get(field, 0)
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1000:
                raise ValueError(f"remediationCycles.{field} must be an integer between 0 and 1000")
        verified = entry.get("verified", False)
        if not isinstance(verified, bool):
            raise ValueError("remediationCycles.verified must be a boolean")
        if status in {"verified", "needs-review"} and not entry.get("retestRunId"):
            raise ValueError("completed remediationCycles must reference a retestRunId")
        if verified != (status == "verified"):
            raise ValueError("remediationCycles.verified must match verified status")


def validate_transfer_reviews(entries: list[dict[str, Any]]) -> None:
    score_fields = (
        "referenceComposite",
        "referenceTargetScore",
        "compositeFloor",
        "targetFloor",
        "composite",
        "targetScore",
    )
    delta_fields = ("compositeDelta", "targetDelta")
    text_limits = {
        "id": 100,
        "cycleId": 100,
        "scenarioId": 80,
        "referenceRunId": 100,
        "runId": 100,
        "createdAt": 64,
        "armedAt": 64,
        "completedAt": 64,
    }
    allowed_statuses = {"scheduled", "armed", "passed", "failed", "superseded"}
    allowed_components = {"decision", "evidence", "communication"}
    allowed_intervals = {1, 7, 21, 60}
    stage_intervals = {1: 1, 2: 7, 3: 21, 4: 60}

    for entry in entries:
        for field in score_fields:
            value = entry.get(field)
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 100:
                raise ValueError(f"transferReviews.{field} must be a number between 0 and 100 or null")
        for field in delta_fields:
            value = entry.get(field)
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not -100 <= value <= 100:
                raise ValueError(f"transferReviews.{field} must be a number between -100 and 100 or null")
        for field, maximum in text_limits.items():
            if field in entry and (not isinstance(entry[field], str) or len(entry[field]) > maximum):
                raise ValueError(f"transferReviews.{field} must be a string of at most {maximum} characters")
        for field in ("id", "cycleId", "scenarioId", "referenceRunId"):
            if not entry.get(field):
                raise ValueError(f"transferReviews.{field} is required")
        status = entry.get("status", "scheduled")
        if status not in allowed_statuses:
            raise ValueError("transferReviews.status is invalid")
        component = entry.get("targetComponent", "decision")
        if component not in allowed_components:
            raise ValueError("transferReviews.targetComponent is invalid")
        stage = entry.get("stage", 1)
        if isinstance(stage, bool) or not isinstance(stage, int) or not 1 <= stage <= 4:
            raise ValueError("transferReviews.stage must be an integer between 1 and 4")
        interval_days = entry.get("intervalDays")
        if isinstance(interval_days, bool) or interval_days not in allowed_intervals:
            raise ValueError("transferReviews.intervalDays is invalid")
        if interval_days != stage_intervals[stage]:
            raise ValueError("transferReviews.intervalDays must match the review stage")
        due_date = entry.get("dueDate")
        if not isinstance(due_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", due_date):
            raise ValueError("transferReviews.dueDate must be a YYYY-MM-DD string")
        passed = entry.get("passed", False)
        if not isinstance(passed, bool):
            raise ValueError("transferReviews.passed must be a boolean")
        if status in {"passed", "failed"} and not entry.get("runId"):
            raise ValueError("completed transferReviews must reference a runId")
        if passed != (status == "passed"):
            raise ValueError("transferReviews.passed must match passed status")


def validate_coach_run(entry: Any, field_name: str) -> None:
    if not isinstance(entry, dict):
        raise ValueError(f"{field_name} must be an object")
    prompt_id = entry.get("promptId")
    prompt_meta = COACH_PROMPT_META.get(prompt_id)
    if prompt_meta is None:
        raise ValueError(f"{field_name}.promptId is invalid")
    for field, maximum in (("id", 100), ("at", 64)):
        value = entry.get(field, "")
        if not isinstance(value, str) or not value or len(value) > maximum:
            raise ValueError(f"{field_name}.{field} must be a non-empty string of at most {maximum} characters")
    expected_category, expected_difficulty, expected_branch, prompt_seconds = prompt_meta
    if entry.get("category") != expected_category:
        raise ValueError(f"{field_name}.category must match the prompt")
    if entry.get("difficulty") != expected_difficulty:
        raise ValueError(f"{field_name}.difficulty must match the prompt")
    if entry.get("branch") != expected_branch:
        raise ValueError(f"{field_name}.branch must match the prompt")
    answer = entry.get("answer", "")
    if not isinstance(answer, str) or len(answer) > 2400:
        raise ValueError(f"{field_name}.answer must be a string of at most 2400 characters")
    word_count = entry.get("wordCount", 0)
    expected_words = len(answer.strip().split()) if answer.strip() else 0
    if isinstance(word_count, bool) or not isinstance(word_count, int) or word_count != expected_words:
        raise ValueError(f"{field_name}.wordCount must match the answer")
    if expected_words < 35:
        raise ValueError(f"{field_name}.answer must contain at least 35 words")
    estimated_seconds = entry.get("estimatedSeconds", 0)
    expected_seconds = int(expected_words / 130 * 60 + 0.5)
    if isinstance(estimated_seconds, bool) or not isinstance(estimated_seconds, int) or estimated_seconds != expected_seconds:
        raise ValueError(f"{field_name}.estimatedSeconds must match the answer word count")
    delivery_score = entry.get("deliveryScore", 0)
    if isinstance(delivery_score, bool) or not isinstance(delivery_score, int) or not 0 <= delivery_score <= 10:
        raise ValueError(f"{field_name}.deliveryScore must be an integer between 0 and 10")
    minimum_words = 60 if prompt_seconds <= 60 else 85 if prompt_seconds <= 90 else 105
    maximum_words = 175 if prompt_seconds <= 60 else 235 if prompt_seconds <= 90 else 310
    expected_band_score = 5 if minimum_words <= expected_words <= maximum_words else 3 if 35 <= expected_words <= 400 else 0
    sentence_count = len(re.findall(r"[.!?]+(?:\s|$)", answer))
    expected_structure_score = 5 if sentence_count >= 3 else 3 if sentence_count >= 2 else 0
    if delivery_score != expected_band_score + expected_structure_score:
        raise ValueError(f"{field_name}.deliveryScore must match the answer structure and target duration")
    criteria = entry.get("criteria", [])
    if not isinstance(criteria, list) or len(criteria) != 6:
        raise ValueError(f"{field_name}.criteria must contain exactly six dimensions")
    expected_dimensions = (*COACH_CATEGORY_RUBRICS[expected_category], ("specific", COACH_PROMPT_ANCHORS[prompt_id]))
    criterion_ids: set[str] = set()
    expected_missing: list[str] = []
    component_total = delivery_score
    for index, criterion in enumerate(criteria):
        criterion_field = f"{field_name}.criteria[{index}]"
        if not isinstance(criterion, dict):
            raise ValueError(f"{criterion_field} must be an object")
        criterion_id = criterion.get("id")
        label = criterion.get("label")
        score = criterion.get("score")
        met = criterion.get("met")
        if not isinstance(criterion_id, str) or not criterion_id or len(criterion_id) > 40:
            raise ValueError(f"{criterion_field}.id must be a non-empty string of at most 40 characters")
        if criterion_id in criterion_ids:
            raise ValueError(f"{field_name}.criteria IDs must be unique")
        criterion_ids.add(criterion_id)
        if not isinstance(label, str) or not label or len(label) > 100:
            raise ValueError(f"{criterion_field}.label must be a non-empty string of at most 100 characters")
        expected_id, expected_label = expected_dimensions[index]
        if criterion_id != expected_id:
            raise ValueError(f"{criterion_field}.id must match the prompt rubric")
        if label != expected_label:
            raise ValueError(f"{criterion_field}.label must match the prompt rubric")
        if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 15:
            raise ValueError(f"{criterion_field}.score must be an integer between 0 and 15")
        if not isinstance(met, bool) or met != (score == 15):
            raise ValueError(f"{criterion_field}.met must match a full criterion score")
        if not met:
            expected_missing.append(label)
        component_total += score
    score = entry.get("score", 0)
    if isinstance(score, bool) or not isinstance(score, int) or score != min(100, component_total):
        raise ValueError(f"{field_name}.score must equal the rubric and delivery total")
    passed = entry.get("passed")
    if not isinstance(passed, bool) or passed != (score >= 75):
        raise ValueError(f"{field_name}.passed must match the 75 percent gate")
    missing = entry.get("missing", [])
    if not isinstance(missing, list) or missing != expected_missing:
        raise ValueError(f"{field_name}.missing must match incomplete criteria")


def validate_coach_state(state: dict[str, Any]) -> None:
    drafts = state.get("coachDrafts", {})
    if not isinstance(drafts, dict) or len(drafts) > len(COACH_PROMPT_META):
        raise ValueError("coachDrafts must be an object containing known prompts")
    for prompt_id, draft in drafts.items():
        if prompt_id not in COACH_PROMPT_META:
            raise ValueError("coachDrafts contains an unknown prompt")
        if not isinstance(draft, dict):
            raise ValueError(f"coachDrafts.{prompt_id} must be an object")
        text = draft.get("text", "")
        updated_at = draft.get("updatedAt", "")
        if not isinstance(text, str) or len(text) > 2400:
            raise ValueError(f"coachDrafts.{prompt_id}.text must be a string of at most 2400 characters")
        if not isinstance(updated_at, str) or len(updated_at) > 64:
            raise ValueError(f"coachDrafts.{prompt_id}.updatedAt must be a string of at most 64 characters")
    history = state.get("coachHistory", [])
    if not isinstance(history, list):
        raise ValueError("coachHistory must be an array")
    if len(history) > 100:
        raise ValueError("coachHistory may contain at most 100 entries")
    run_ids: set[str] = set()
    for index, entry in enumerate(history):
        validate_coach_run(entry, f"coachHistory[{index}]")
        if entry["id"] in run_ids:
            raise ValueError("coachHistory IDs must be unique")
        run_ids.add(entry["id"])
    selected_prompt = state.get("selectedCoachPrompt", "coach-intro")
    if selected_prompt not in COACH_PROMPT_META:
        raise ValueError("selectedCoachPrompt is invalid")
    selected_run = state.get("selectedCoachRun", "")
    if not isinstance(selected_run, str) or len(selected_run) > 100:
        raise ValueError("selectedCoachRun must be a string of at most 100 characters")
    if selected_run and selected_run not in run_ids:
        raise ValueError("selectedCoachRun must reference a completed rehearsal")
    if state.get("coachCategory", "all") not in {"all", "positioning", "behavioral", "technical", "defense"}:
        raise ValueError("coachCategory is invalid")
    if state.get("coachDifficulty", "all") not in {"all", "core", "hard", "hft"}:
        raise ValueError("coachDifficulty is invalid")
    timer_seconds = state.get("timerSeconds", 60)
    if isinstance(timer_seconds, bool) or not isinstance(timer_seconds, (int, float)) or not 0 <= timer_seconds <= 180:
        raise ValueError("timerSeconds must be a number between 0 and 180")
    if not isinstance(state.get("timerRunning", False), bool):
        raise ValueError("timerRunning must be a boolean")


def validate_shift_answer(answer: Any, field_name: str) -> None:
    if not isinstance(answer, dict):
        raise ValueError(f"{field_name} must be an object")
    choice = answer.get("choice")
    if choice is not None and (isinstance(choice, bool) or not isinstance(choice, int) or not 0 <= choice <= 3):
        raise ValueError(f"{field_name}.choice must be an integer between 0 and 3 or null")
    evidence = answer.get("evidence", [])
    if not isinstance(evidence, list) or len(evidence) > 12:
        raise ValueError(f"{field_name}.evidence must be an array of at most 12 indexes")
    if any(isinstance(index, bool) or not isinstance(index, int) or not 0 <= index <= 11 for index in evidence):
        raise ValueError(f"{field_name}.evidence must contain indexes between 0 and 11")
    if len(set(evidence)) != len(evidence):
        raise ValueError(f"{field_name}.evidence must not contain duplicate indexes")
    record = answer.get("record", "")
    if not isinstance(record, str) or len(record) > 1200:
        raise ValueError(f"{field_name}.record must be a string of at most 1200 characters")


def validate_shift_result(result: Any, phase_id: str, field_name: str) -> None:
    if not isinstance(result, dict):
        raise ValueError(f"{field_name} must be an object")
    if result.get("phaseId") not in (None, phase_id):
        raise ValueError(f"{field_name}.phaseId must match its phase key")
    score_limits = {"score": 100, "decision": 40, "evidence": 30, "recordScore": 30}
    for field, maximum in score_limits.items():
        value = result.get(field, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= maximum:
            raise ValueError(f"{field_name}.{field} must be a number between 0 and {maximum}")
    expected_score = min(100, result.get("decision", 0) + result.get("evidence", 0) + result.get("recordScore", 0))
    if result.get("score", 0) != expected_score:
        raise ValueError(f"{field_name}.score must equal its component total")
    choice = result.get("choice", 0)
    if isinstance(choice, bool) or not isinstance(choice, int) or not 0 <= choice <= 3:
        raise ValueError(f"{field_name}.choice must be an integer between 0 and 3")
    selected = result.get("selectedEvidence", [])
    validate_shift_answer(
        {"choice": choice, "evidence": selected, "record": result.get("record", "")},
        field_name,
    )
    missing = result.get("missing", [])
    if not isinstance(missing, list) or len(missing) > 12:
        raise ValueError(f"{field_name}.missing must be an array of at most 12 labels")
    if any(not isinstance(label, str) or len(label) > 80 for label in missing):
        raise ValueError(f"{field_name}.missing must contain labels of at most 80 characters")
    if not isinstance(result.get("criticalHeld", False), bool):
        raise ValueError(f"{field_name}.criticalHeld must be a boolean")
    if result.get("criticalHeld", False) != (result.get("score", 0) < 70):
        raise ValueError(f"{field_name}.criticalHeld must match the critical phase score")
    evaluated_at = result.get("evaluatedAt", "")
    if not isinstance(evaluated_at, str) or len(evaluated_at) > 64:
        raise ValueError(f"{field_name}.evaluatedAt must be a string of at most 64 characters")


def validate_shift_entry(entry: Any, field_name: str, completed: bool) -> None:
    if not isinstance(entry, dict):
        raise ValueError(f"{field_name} must be an object")
    template_id = entry.get("templateId")
    phases = SHIFT_TEMPLATE_PHASES.get(template_id)
    if phases is None:
        raise ValueError(f"{field_name}.templateId is invalid")
    for field in ("id", "startedAt", "updatedAt"):
        value = entry.get(field, "")
        limit = 100 if field == "id" else 64
        if not isinstance(value, str) or len(value) > limit or (field == "id" and not value):
            raise ValueError(f"{field_name}.{field} must be a non-empty string of at most {limit} characters" if field == "id" else f"{field_name}.{field} must be a string of at most {limit} characters")
    expected_status = "complete" if completed else "active"
    if entry.get("status", expected_status) != expected_status:
        raise ValueError(f"{field_name}.status must be {expected_status}")
    answers = entry.get("answers", {})
    results = entry.get("results", {})
    if not isinstance(answers, dict) or any(phase not in phases for phase in answers):
        raise ValueError(f"{field_name}.answers must contain only known phase objects")
    if not isinstance(results, dict) or any(phase not in phases for phase in results):
        raise ValueError(f"{field_name}.results must contain only known phase objects")
    for phase_id, answer in answers.items():
        validate_shift_answer(answer, f"{field_name}.answers.{phase_id}")
    for phase_id, result in results.items():
        validate_shift_result(result, phase_id, f"{field_name}.results.{phase_id}")
    if completed:
        if set(results) != set(phases):
            raise ValueError(f"{field_name}.results must contain all four phases")
        completed_at = entry.get("completedAt")
        if not isinstance(completed_at, str) or not completed_at or len(completed_at) > 64:
            raise ValueError(f"{field_name}.completedAt must be a non-empty string of at most 64 characters")
        score = entry.get("score")
        if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
            raise ValueError(f"{field_name}.score must be a number between 0 and 100")
        for field in ("passed", "criticalHeld"):
            if not isinstance(entry.get(field), bool):
                raise ValueError(f"{field_name}.{field} must be a boolean")
        expected_score = int(sum(results[phase]["score"] for phase in phases) / len(phases) + 0.5)
        expected_critical = any(results[phase]["score"] < 70 for phase in phases)
        if entry.get("score") != expected_score:
            raise ValueError(f"{field_name}.score must equal the rounded phase average")
        if entry.get("criticalHeld") != expected_critical:
            raise ValueError(f"{field_name}.criticalHeld must match its phase results")
        if entry.get("passed") != (expected_score >= 80 and not expected_critical):
            raise ValueError(f"{field_name}.passed must match the shift gate")
        weakest_phase = entry.get("weakestPhase")
        if weakest_phase not in phases:
            raise ValueError(f"{field_name}.weakestPhase is invalid")
        if results[weakest_phase]["score"] != min(results[phase]["score"] for phase in phases):
            raise ValueError(f"{field_name}.weakestPhase must reference a lowest-scoring phase")
    else:
        stage = entry.get("stage", 0)
        if isinstance(stage, bool) or not isinstance(stage, int) or not 0 <= stage < len(phases):
            raise ValueError(f"{field_name}.stage must be an integer between 0 and 3")


def validate_shift_state(state: dict[str, Any]) -> None:
    history = state.get("shiftHistory", [])
    if not isinstance(history, list):
        raise ValueError("shiftHistory must be an array")
    if len(history) > 50:
        raise ValueError("shiftHistory may contain at most 50 entries")
    ids: set[str] = set()
    for index, entry in enumerate(history):
        validate_shift_entry(entry, f"shiftHistory[{index}]", completed=True)
        if entry["id"] in ids:
            raise ValueError("shiftHistory IDs must be unique")
        ids.add(entry["id"])
    active = state.get("activeShift")
    if active is not None:
        validate_shift_entry(active, "activeShift", completed=False)
        if active["id"] in ids:
            raise ValueError("activeShift must not reference a completed shift ID")
    selected = state.get("selectedShiftRun", "")
    if not isinstance(selected, str) or len(selected) > 100:
        raise ValueError("selectedShiftRun must be a string of at most 100 characters")
    if selected and selected not in ids:
        raise ValueError("selectedShiftRun must reference a completed shift")


def is_iso_date(value: Any) -> bool:
    if not isinstance(value, str) or not DATE_PATTERN.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def parse_iso_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value or len(value) > 64:
        return None
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    return parsed if parsed.tzinfo is not None else None


def validate_triage_answers(answer: Any, template_id: str, field_name: str, *, complete: bool) -> None:
    if not isinstance(answer, dict):
        raise ValueError(f"{field_name} must be an object")
    severity = answer.get("severity", "")
    scope = answer.get("scope", "")
    control = answer.get("control", "")
    for name, value in (("severity", severity), ("scope", scope), ("control", control)):
        if not isinstance(value, str) or len(value) > 100 or (complete and not value):
            requirement = "a non-empty string" if complete else "a string"
            raise ValueError(f"{field_name}.{name} must be {requirement} of at most 100 characters")
    if severity and severity not in TRIAGE_SEVERITIES:
        raise ValueError(f"{field_name}.severity is invalid")
    evidence_field = "selectedEvidence" if complete else "evidence"
    evidence = answer.get(evidence_field, [])
    evidence_count = TRIAGE_TEMPLATE_META[template_id][4]
    if not isinstance(evidence, list) or len(evidence) > evidence_count:
        raise ValueError(f"{field_name}.{evidence_field} must be an array of at most {evidence_count} indexes")
    if any(isinstance(index, bool) or not isinstance(index, int) or not 0 <= index < evidence_count for index in evidence):
        raise ValueError(f"{field_name}.{evidence_field} contains an invalid evidence index")
    if len(set(evidence)) != len(evidence):
        raise ValueError(f"{field_name}.{evidence_field} must not contain duplicate indexes")
    dispatch = answer.get("dispatch", "")
    if not isinstance(dispatch, str) or len(dispatch) > 1200:
        raise ValueError(f"{field_name}.dispatch must be a string of at most 1200 characters")


def validate_triage_state(state: dict[str, Any]) -> None:
    history = state.get("triageHistory", [])
    if not isinstance(history, list):
        raise ValueError("triageHistory must be an array")
    if len(history) > 100:
        raise ValueError("triageHistory may contain at most 100 entries")
    run_ids: set[str] = set()
    severity_order = ("sev1", "sev2", "sev3", "sev4")
    for index, entry in enumerate(history):
        field_name = f"triageHistory[{index}]"
        if not isinstance(entry, dict):
            raise ValueError(f"{field_name} must be an object")
        template_id = entry.get("templateId")
        if template_id not in TRIAGE_TEMPLATE_META:
            raise ValueError(f"{field_name}.templateId is invalid")
        run_id = entry.get("id")
        if not isinstance(run_id, str) or not 1 <= len(run_id) <= 100:
            raise ValueError(f"{field_name}.id must be a non-empty string of at most 100 characters")
        if run_id in run_ids:
            raise ValueError("triageHistory IDs must be unique")
        run_ids.add(run_id)
        if entry.get("status") != "complete":
            raise ValueError(f"{field_name}.status must be complete")
        seed = entry.get("seed")
        if isinstance(seed, bool) or not isinstance(seed, int) or not 1 <= seed <= 4_294_967_295:
            raise ValueError(f"{field_name}.seed must be an integer between 1 and 4294967295")
        started_at = parse_iso_timestamp(entry.get("startedAt"))
        completed_at = parse_iso_timestamp(entry.get("completedAt"))
        if started_at is None or completed_at is None or completed_at < started_at:
            raise ValueError(f"{field_name} must contain ordered timezone-aware timestamps")
        validate_triage_answers(entry, template_id, field_name, complete=True)
        _, expected_severity, expected_scope, expected_control, _ = TRIAGE_TEMPLATE_META[template_id]
        if entry.get("expectedSeverity") != expected_severity or entry.get("expectedScope") != expected_scope:
            raise ValueError(f"{field_name} expected classification does not match its template")
        actual_severity = entry.get("severity")
        expected_severity_score = 15 if actual_severity == expected_severity else 7 if abs(severity_order.index(actual_severity) - severity_order.index(expected_severity)) == 1 else 0
        if entry.get("severityScore") != expected_severity_score:
            raise ValueError(f"{field_name}.severityScore does not match the classification")
        if (entry.get("scope") == expected_scope) != (entry.get("scopeScore") == 15):
            raise ValueError(f"{field_name}.scopeScore does not match the expected scope gate")
        if (entry.get("control") == expected_control) != (entry.get("controlScore") == 30):
            raise ValueError(f"{field_name}.controlScore does not match the expected control gate")
        scores: dict[str, int] = {}
        for dimension, score_field, maximum in TRIAGE_DIMENSIONS:
            value = entry.get(score_field)
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
                raise ValueError(f"{field_name}.{score_field} must be an integer between 0 and {maximum}")
            scores[dimension] = value
        score = entry.get("score")
        score_total = sum(scores.values())
        if isinstance(score, bool) or not isinstance(score, int) or score != score_total:
            raise ValueError(f"{field_name}.score must equal its component total")
        critical_held = scores["severity"] < 15 or scores["control"] < 30
        if not isinstance(entry.get("criticalHeld"), bool) or entry["criticalHeld"] != critical_held:
            raise ValueError(f"{field_name}.criticalHeld must match severity and control gates")
        if not isinstance(entry.get("passed"), bool) or entry["passed"] != (score >= 75 and not critical_held):
            raise ValueError(f"{field_name}.passed must match the 75 percent critical gate")
        weakest = min(TRIAGE_DIMENSIONS, key=lambda item: scores[item[0]] / item[2])[0]
        if entry.get("weakestDimension") != weakest:
            raise ValueError(f"{field_name}.weakestDimension must match the lowest normalized score")
        missing = entry.get("missing", [])
        if not isinstance(missing, list) or len(missing) > 6:
            raise ValueError(f"{field_name}.missing must be an array of at most 6 labels")
        if any(not isinstance(label, str) or len(label) > 100 for label in missing):
            raise ValueError(f"{field_name}.missing must contain labels of at most 100 characters")

    active = state.get("activeTriage")
    if active is not None:
        if not isinstance(active, dict):
            raise ValueError("activeTriage must be an object or null")
        template_id = active.get("templateId")
        if template_id not in TRIAGE_TEMPLATE_META:
            raise ValueError("activeTriage.templateId is invalid")
        active_id = active.get("id")
        if not isinstance(active_id, str) or not 1 <= len(active_id) <= 100:
            raise ValueError("activeTriage.id must be a non-empty string of at most 100 characters")
        if active_id in run_ids:
            raise ValueError("activeTriage must not reference a completed triage ID")
        if active.get("status") != "active":
            raise ValueError("activeTriage.status must be active")
        seed = active.get("seed")
        if isinstance(seed, bool) or not isinstance(seed, int) or not 1 <= seed <= 4_294_967_295:
            raise ValueError("activeTriage.seed must be an integer between 1 and 4294967295")
        started_at = parse_iso_timestamp(active.get("startedAt"))
        updated_at = parse_iso_timestamp(active.get("updatedAt"))
        if started_at is None or updated_at is None or updated_at < started_at:
            raise ValueError("activeTriage must contain ordered timezone-aware timestamps")
        validate_triage_answers(active.get("answers"), template_id, "activeTriage.answers", complete=False)

    selected = state.get("selectedTriageRun", "")
    if not isinstance(selected, str) or len(selected) > 100:
        raise ValueError("selectedTriageRun must be a string of at most 100 characters")
    if selected and selected not in run_ids:
        raise ValueError("selectedTriageRun must reference a completed triage run")
    allowed_branches = {"adaptive", "all", *(meta[0] for meta in TRIAGE_TEMPLATE_META.values())}
    if state.get("triageBranch", "adaptive") not in allowed_branches:
        raise ValueError("triageBranch is invalid")


def validate_practice_history(state: dict[str, Any]) -> None:
    history = state.get("quizHistory", [])
    if not isinstance(history, list):
        raise ValueError("quizHistory must be an array")
    if len(history) > 100:
        raise ValueError("quizHistory may contain at most 100 entries")

    selected = state.get("selectedPracticeRun", "")
    if not isinstance(selected, str) or len(selected) > 100:
        raise ValueError("selectedPracticeRun must be a string of at most 100 characters")

    ui_version = state.get("uiVersion", 1)
    if not isinstance(ui_version, int) or ui_version < 19:
        for index, entry in enumerate(history):
            if not isinstance(entry, dict):
                raise ValueError(f"quizHistory[{index}] must be an object")
            score = entry.get("score")
            if score is not None and (isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100):
                raise ValueError(f"quizHistory[{index}].score must be between 0 and 100")
            run_date = entry.get("date")
            if run_date not in (None, "") and not is_iso_date(run_date):
                raise ValueError(f"quizHistory[{index}].date must be a YYYY-MM-DD date")
        return

    ids: set[str] = set()
    runs: dict[str, dict[str, Any]] = {}
    integer_limits = {
        "score": 100,
        "clean": 50,
        "recovered": 50,
        "eliminated": 50,
        "skipped": 50,
        "mistakes": 200,
        "xpEarned": 100_000,
        "durationSeconds": 86_400,
    }
    text_limits = {
        "id": 100,
        "name": 80,
        "remediationCycleId": 100,
        "replayOfRunId": 100,
        "repairOfRunId": 100,
    }

    for index, entry in enumerate(history):
        field = f"quizHistory[{index}]"
        if not isinstance(entry, dict):
            raise ValueError(f"{field} must be an object")
        for name, maximum in text_limits.items():
            value = entry.get(name, "")
            if not isinstance(value, str) or len(value) > maximum or (name == "id" and not value):
                raise ValueError(f"{field}.{name} must be a string of at most {maximum} characters")
        run_id = entry["id"]
        if run_id in ids:
            raise ValueError("quizHistory IDs must be unique")
        ids.add(run_id)
        runs[run_id] = entry

        if not is_iso_date(entry.get("date")):
            raise ValueError(f"{field}.date must be a YYYY-MM-DD date")
        started = parse_iso_timestamp(entry.get("startedAt"))
        completed = parse_iso_timestamp(entry.get("completedAt"))
        if started is None or completed is None or completed < started:
            raise ValueError(f"{field} timestamps must be timezone-aware and ordered")
        expected_duration = min(86_400, int((completed - started).total_seconds()))
        for name, maximum in integer_limits.items():
            value = entry.get(name)
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
                raise ValueError(f"{field}.{name} must be an integer between 0 and {maximum}")
        if entry["durationSeconds"] != expected_duration:
            raise ValueError(f"{field}.durationSeconds must match the run timestamps")
        if entry.get("mode") not in PRACTICE_RUN_MODES:
            raise ValueError(f"{field}.mode is invalid")
        if entry.get("origin") not in PRACTICE_RUN_ORIGINS:
            raise ValueError(f"{field}.origin is invalid")
        if not isinstance(entry.get("legacy"), bool):
            raise ValueError(f"{field}.legacy must be a boolean")

        question_ids = entry.get("questionIds")
        branches = entry.get("questionBranches")
        outcomes = entry.get("outcomes")
        calibrations = entry.get("calibrations")
        repair_ids = entry.get("repairQuestionIds")
        for name, values in (
            ("questionIds", question_ids),
            ("questionBranches", branches),
            ("outcomes", outcomes),
            ("calibrations", calibrations),
            ("repairQuestionIds", repair_ids),
        ):
            if not isinstance(values, list) or len(values) > 50:
                raise ValueError(f"{field}.{name} must be an array of at most 50 values")
        if any(not isinstance(question_id, str) or not 1 <= len(question_id) <= 40 for question_id in question_ids):
            raise ValueError(f"{field}.questionIds contains an invalid question ID")
        if len(set(question_ids)) != len(question_ids):
            raise ValueError(f"{field}.questionIds must be unique")
        if len(branches) != len(question_ids) or any(not isinstance(branch, str) or not 1 <= len(branch) <= 40 for branch in branches):
            raise ValueError(f"{field}.questionBranches must align with questionIds")
        if len(outcomes) != len(question_ids) or any(outcome not in PRACTICE_RUN_OUTCOMES for outcome in outcomes):
            raise ValueError(f"{field}.outcomes must contain one completed outcome per question")
        if len(calibrations) != len(question_ids) or any(value not in PRACTICE_RUN_CALIBRATIONS for value in calibrations):
            raise ValueError(f"{field}.calibrations must contain one completed calibration per question")

        exact = bool(question_ids)
        if entry["legacy"] == exact:
            raise ValueError(f"{field}.legacy must be true only when exact question evidence is unavailable")
        selection_reasons = entry.get("selectionReasons")
        evidence_before = entry.get("evidenceBefore")
        evidence_after = entry.get("evidenceAfter")
        for name, values in (
            ("selectionReasons", selection_reasons),
            ("evidenceBefore", evidence_before),
            ("evidenceAfter", evidence_after),
        ):
            if not isinstance(values, dict) or len(values) > 50:
                raise ValueError(f"{field}.{name} must be a bounded object")
            if any(key not in question_ids for key in values):
                raise ValueError(f"{field}.{name} may only reference questions in the run")
        if any(not isinstance(value, str) or len(value) > 120 for value in selection_reasons.values()):
            raise ValueError(f"{field}.selectionReasons contains invalid text")
        if exact and (set(evidence_before) != set(question_ids) or set(evidence_after) != set(question_ids)):
            raise ValueError(f"{field} evidence maps must cover every question exactly once")
        if any(isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 5 for value in (*evidence_before.values(), *evidence_after.values())):
            raise ValueError(f"{field} evidence values must be integers between 0 and 5")

        if exact:
            expected_clean = outcomes.count("clean")
            expected_recovered = outcomes.count("recovered")
            expected_eliminated = outcomes.count("eliminated")
            expected_skipped = outcomes.count("skipped")
            expected_score = int(((expected_clean * 2 + expected_recovered) * 50 / len(outcomes)) + 0.5)
            expected_repair = [
                question_id
                for question_id, outcome, calibration in zip(question_ids, outcomes, calibrations, strict=True)
                if outcome != "clean" or calibration == "overconfident"
            ]
            if (entry["clean"], entry["recovered"], entry["eliminated"], entry["skipped"]) != (
                expected_clean, expected_recovered, expected_eliminated, expected_skipped
            ):
                raise ValueError(f"{field} outcome counters must match outcomes")
            if entry["score"] != expected_score:
                raise ValueError(f"{field}.score must match weighted outcomes")
            if repair_ids != expected_repair:
                raise ValueError(f"{field}.repairQuestionIds must match unresolved decisions")
        elif any((question_ids, branches, outcomes, calibrations, repair_ids, selection_reasons, evidence_before, evidence_after)):
            raise ValueError(f"{field} legacy summaries may not claim exact evidence")

        for link_name in ("replayOfRunId", "repairOfRunId"):
            if entry[link_name] == run_id:
                raise ValueError(f"{field}.{link_name} may not reference the run itself")
        if entry["replayOfRunId"] and entry["repairOfRunId"]:
            raise ValueError(f"{field} may not claim both replay and repair lineage")
        if entry["mode"] == "run-replay" and not entry["replayOfRunId"]:
            raise ValueError(f"{field}.replayOfRunId is required for exact replay")
        if entry["mode"] == "run-repair" and not entry["repairOfRunId"]:
            raise ValueError(f"{field}.repairOfRunId is required for exact repair")

    if selected and selected not in ids:
        raise ValueError("selectedPracticeRun must reference a completed practice run")
    for run in history:
        replay_source = runs.get(run["replayOfRunId"])
        if replay_source and run["questionIds"] != replay_source["questionIds"]:
            raise ValueError("Exact replay question order must match its source run")
        repair_source = runs.get(run["repairOfRunId"])
        if repair_source and run["questionIds"] != repair_source["repairQuestionIds"]:
            raise ValueError("Exact repair questions must match the source run repair set")


def validate_training_plans(state: dict[str, Any]) -> None:
    plans = state.get("trainingPlans", [])
    if not isinstance(plans, list):
        raise ValueError("trainingPlans must be an array")
    if len(plans) > 30:
        raise ValueError("trainingPlans may contain at most 30 entries")
    plan_ids: set[str] = set()
    active_ids: list[str] = []
    text_limits = {"title": 100, "detail": 180, "reason": 220}

    for plan_index, plan in enumerate(plans):
        field = f"trainingPlans[{plan_index}]"
        if not isinstance(plan, dict):
            raise ValueError(f"{field} must be an object")
        plan_id = plan.get("id")
        if not isinstance(plan_id, str) or not 1 <= len(plan_id) <= 100:
            raise ValueError(f"{field}.id must be a non-empty string of at most 100 characters")
        if plan_id in plan_ids:
            raise ValueError("trainingPlans IDs must be unique")
        plan_ids.add(plan_id)
        if not is_iso_date(plan.get("date")):
            raise ValueError(f"{field}.date must be a real YYYY-MM-DD date")
        created_at = parse_iso_timestamp(plan.get("createdAt"))
        updated_at = parse_iso_timestamp(plan.get("updatedAt"))
        if created_at is None or updated_at is None or updated_at < created_at:
            raise ValueError(f"{field} timestamps must be timezone-aware and ordered")
        minutes_budget = plan.get("minutesBudget")
        if isinstance(minutes_budget, bool) or minutes_budget not in TRAINING_PLAN_MINUTES:
            raise ValueError(f"{field}.minutesBudget is invalid")
        if plan.get("intensity") not in TRAINING_PLAN_INTENSITIES:
            raise ValueError(f"{field}.intensity is invalid")
        status = plan.get("status")
        if status not in TRAINING_PLAN_STATUSES:
            raise ValueError(f"{field}.status is invalid")
        if status == "active":
            active_ids.append(plan_id)
        basis = plan.get("basis")
        if not isinstance(basis, dict):
            raise ValueError(f"{field}.basis must be an object")
        for name, maximum in (("readiness", 100), ("dueQuestions", 1000)):
            value = basis.get(name)
            if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= maximum:
                raise ValueError(f"{field}.basis.{name} must be an integer between 0 and {maximum}")
        weak_branch = basis.get("weakBranch", "")
        if not isinstance(weak_branch, str) or len(weak_branch) > 40:
            raise ValueError(f"{field}.basis.weakBranch must be a string of at most 40 characters")

        items = plan.get("items")
        if not isinstance(items, list) or not 1 <= len(items) <= 8:
            raise ValueError(f"{field}.items must contain between 1 and 8 blocks")
        item_ids: set[str] = set()
        active_items = 0
        total_minutes = 0
        all_complete = True
        latest_completion: datetime | None = None
        for item_index, item in enumerate(items):
            item_field = f"{field}.items[{item_index}]"
            if not isinstance(item, dict):
                raise ValueError(f"{item_field} must be an object")
            item_id = item.get("id")
            if not isinstance(item_id, str) or not 1 <= len(item_id) <= 100:
                raise ValueError(f"{item_field}.id must be a non-empty string of at most 100 characters")
            if item_id in item_ids:
                raise ValueError(f"{field} item IDs must be unique")
            item_ids.add(item_id)
            if item.get("type") not in TRAINING_PLAN_TYPES:
                raise ValueError(f"{item_field}.type is invalid")
            target_id = item.get("targetId")
            if not isinstance(target_id, str) or not 1 <= len(target_id) <= 100:
                raise ValueError(f"{item_field}.targetId must be a non-empty string of at most 100 characters")
            for name, maximum in text_limits.items():
                value = item.get(name)
                if not isinstance(value, str) or not 1 <= len(value) <= maximum:
                    raise ValueError(f"{item_field}.{name} must be a non-empty string of at most {maximum} characters")
            minutes = item.get("minutes")
            if isinstance(minutes, bool) or not isinstance(minutes, int) or not 5 <= minutes <= 60:
                raise ValueError(f"{item_field}.minutes must be an integer between 5 and 60")
            total_minutes += minutes
            baseline = item.get("baseline")
            if isinstance(baseline, bool) or not isinstance(baseline, int) or not 0 <= baseline <= 1_000_000:
                raise ValueError(f"{item_field}.baseline must be an integer between 0 and 1000000")
            item_status = item.get("status")
            if item_status not in TRAINING_PLAN_ITEM_STATUSES:
                raise ValueError(f"{item_field}.status is invalid")
            all_complete = all_complete and item_status == "complete"
            if item_status == "active":
                active_items += 1
            started_at_raw = item.get("startedAt", "")
            completed_at_raw = item.get("completedAt", "")
            started_at = parse_iso_timestamp(started_at_raw) if started_at_raw else None
            completed_at = parse_iso_timestamp(completed_at_raw) if completed_at_raw else None
            if started_at_raw and (started_at is None or started_at < created_at):
                raise ValueError(f"{item_field}.startedAt must be a timezone-aware timestamp after plan creation")
            if completed_at_raw and (completed_at is None or completed_at < created_at or (started_at and completed_at < started_at)):
                raise ValueError(f"{item_field}.completedAt must be a timezone-aware ordered timestamp")
            if started_at and started_at > updated_at:
                raise ValueError(f"{item_field}.startedAt may not be later than the plan update")
            if completed_at and completed_at > updated_at:
                raise ValueError(f"{item_field}.completedAt may not be later than the plan update")
            if item_status == "active" and started_at is None:
                raise ValueError(f"{item_field}.startedAt is required for an active block")
            if item_status in {"complete", "skipped"} and completed_at is None:
                raise ValueError(f"{item_field}.completedAt is required for a terminal block")
            if completed_at and (latest_completion is None or completed_at > latest_completion):
                latest_completion = completed_at
        if total_minutes > minutes_budget:
            raise ValueError(f"{field} planned minutes may not exceed the time budget")
        if active_items > 1:
            raise ValueError(f"{field} may contain at most one active block")
        if status != "active" and active_items:
            raise ValueError(f"{field} may only contain an active block while the plan is active")
        if status == "complete" and not all_complete:
            raise ValueError(f"{field}.status complete requires every block to be complete")
        if status == "active" and all_complete:
            raise ValueError(f"{field}.status must be complete when every block is complete")
        completed_at_raw = plan.get("completedAt", "")
        completed_at = parse_iso_timestamp(completed_at_raw) if completed_at_raw else None
        if status == "complete":
            if completed_at is None or completed_at < created_at or completed_at > updated_at or (latest_completion and completed_at < latest_completion):
                raise ValueError(f"{field}.completedAt must close after every completed block")
        elif completed_at_raw:
            raise ValueError(f"{field}.completedAt is only valid for a complete plan")

    if len(active_ids) > 1:
        raise ValueError("trainingPlans may contain at most one active plan")
    active_id = state.get("activeTrainingPlanId", "")
    if not isinstance(active_id, str) or len(active_id) > 100:
        raise ValueError("activeTrainingPlanId must be a string of at most 100 characters")
    expected_active = active_ids[0] if active_ids else ""
    if active_id != expected_active:
        raise ValueError("activeTrainingPlanId must reference the single active training plan")


def validate_question_stats(state: dict[str, Any]) -> None:
    question_stats = state.get("questionStats", {})
    if len(question_stats) > 1000:
        raise ValueError("questionStats may contain at most 1000 entries")
    allowed_results = {"", "correct", "recovered", "wrong", "revealed", "eliminated", "skipped"}
    allowed_grades = {"", "auto", "again", "hard", "good"}
    counter_fields = ("attempts", "correct", "wrong", "skipped", "cleanStreak", "retentionPasses")
    date_fields = ("lastSeen", "nextReview", "lastMasteryDate")
    map_fields = ("confidenceAttempts", "confidenceClean", "calibrationOutcomes", "misconceptions")

    for question_id, stats in question_stats.items():
        if not isinstance(question_id, str) or not 1 <= len(question_id) <= 40:
            raise ValueError("questionStats keys must be strings of at most 40 characters")
        if not isinstance(stats, dict):
            raise ValueError(f"questionStats.{question_id} must be an object")
        for field_name in counter_fields:
            value = stats.get(field_name)
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 1_000_000
            ):
                raise ValueError(f"questionStats.{question_id}.{field_name} must be a non-negative integer")
        attempts = stats.get("attempts")
        if attempts is not None:
            if (stats.get("correct") or 0) + (stats.get("wrong") or 0) > attempts:
                raise ValueError(f"questionStats.{question_id} correct and wrong counts may not exceed attempts")
        mastery = stats.get("mastery")
        if mastery is not None and (
            isinstance(mastery, bool) or not isinstance(mastery, int) or not 0 <= mastery <= 5
        ):
            raise ValueError(f"questionStats.{question_id}.mastery must be an integer between 0 and 5")
        review_stage = stats.get("reviewStage")
        if review_stage is not None and (
            isinstance(review_stage, bool) or not isinstance(review_stage, int) or not 0 <= review_stage <= 6
        ):
            raise ValueError(f"questionStats.{question_id}.reviewStage must be an integer between 0 and 6")
        review_interval = stats.get("reviewIntervalDays")
        if review_interval is not None and (
            isinstance(review_interval, bool) or not isinstance(review_interval, int) or not 0 <= review_interval <= 365
        ):
            raise ValueError(f"questionStats.{question_id}.reviewIntervalDays must be between 0 and 365")
        for field_name in date_fields:
            value = stats.get(field_name)
            if value not in (None, "") and not is_iso_date(value):
                raise ValueError(f"questionStats.{question_id}.{field_name} must be a YYYY-MM-DD date")
        mastery_dates = stats.get("masteryDates", [])
        if not isinstance(mastery_dates, list) or len(mastery_dates) > 5:
            raise ValueError(f"questionStats.{question_id}.masteryDates must be an array of at most 5 dates")
        if any(not is_iso_date(value) for value in mastery_dates):
            raise ValueError(f"questionStats.{question_id}.masteryDates must contain YYYY-MM-DD dates")
        if len(set(mastery_dates)) != len(mastery_dates) or mastery_dates != sorted(mastery_dates):
            raise ValueError(f"questionStats.{question_id}.masteryDates must be unique and sorted")
        last_mastery_date = stats.get("lastMasteryDate")
        if last_mastery_date and mastery_dates and last_mastery_date not in mastery_dates:
            raise ValueError(f"questionStats.{question_id}.lastMasteryDate must reference masteryDates")
        mastery_updated_at = stats.get("masteryUpdatedAt")
        if mastery_updated_at is not None and (not isinstance(mastery_updated_at, str) or len(mastery_updated_at) > 64):
            raise ValueError(f"questionStats.{question_id}.masteryUpdatedAt must be a string of at most 64 characters")
        review_reason = stats.get("reviewReason")
        if review_reason is not None and (not isinstance(review_reason, str) or len(review_reason) > 80):
            raise ValueError(f"questionStats.{question_id}.reviewReason must be a string of at most 80 characters")
        if stats.get("lastResult") is not None and stats.get("lastResult") not in allowed_results:
            raise ValueError(f"questionStats.{question_id}.lastResult is invalid")
        if stats.get("lastReviewGrade") is not None and stats.get("lastReviewGrade") not in allowed_grades:
            raise ValueError(f"questionStats.{question_id}.lastReviewGrade is invalid")
        for field_name in map_fields:
            values = stats.get(field_name, {})
            if not isinstance(values, dict) or len(values) > 30:
                raise ValueError(f"questionStats.{question_id}.{field_name} must be a bounded object")
            if any(
                not isinstance(key, str)
                or not 1 <= len(key) <= 80
                or isinstance(value, bool)
                or not isinstance(value, int)
                or not 0 <= value <= 1_000_000
                for key, value in values.items()
            ):
                raise ValueError(f"questionStats.{question_id}.{field_name} contains invalid counters")


def serialize_state(state: dict[str, Any]) -> str:
    ui_version = state.get("uiVersion")
    if ui_version is not None and (not isinstance(ui_version, int) or not 1 <= ui_version <= 100):
        raise ValueError("uiVersion must be an integer between 1 and 100")
    xp = state.get("xp", 0)
    if isinstance(xp, bool) or not isinstance(xp, (int, float)) or not 0 <= xp <= 100_000_000:
        raise ValueError("xp must be a non-negative number")
    sound_volume = state.get("soundVolume", 72)
    if isinstance(sound_volume, bool) or not isinstance(sound_volume, (int, float)) or not 0 <= sound_volume <= 100:
        raise ValueError("soundVolume must be a number between 0 and 100")
    sound_pack = state.get("soundPack", "charged")
    if sound_pack not in ("focused", "charged", "max"):
        raise ValueError("soundPack is invalid")
    scenario_playback_speed = state.get("scenarioPlaybackSpeed", 1400)
    if isinstance(scenario_playback_speed, bool) or scenario_playback_speed not in (800, 1400, 2200):
        raise ValueError("scenarioPlaybackSpeed is invalid")
    for name in STATE_OBJECT_FIELDS:
        if name in state and not isinstance(state[name], dict):
            raise ValueError(f"{name} must be an object")
    validate_question_stats(state)
    for name in ("quizHistory", "attemptHistory", "rewardHistory", "scenarioHistory", "remediationCycles", "transferReviews", "triageHistory", "shiftHistory", "coachHistory", "trainingPlans"):
        if name in state and not isinstance(state[name], list):
            raise ValueError(f"{name} must be an array")
    validate_practice_history(state)
    validate_training_plans(state)
    if len(state.get("attemptHistory", [])) > 500:
        raise ValueError("attemptHistory may contain at most 500 entries")
    if len(state.get("rewardHistory", [])) > 100:
        raise ValueError("rewardHistory may contain at most 100 entries")
    if len(state.get("scenarioHistory", [])) > 200:
        raise ValueError("scenarioHistory may contain at most 200 entries")
    if len(state.get("remediationCycles", [])) > 100:
        raise ValueError("remediationCycles may contain at most 100 entries")
    if len(state.get("transferReviews", [])) > 200:
        raise ValueError("transferReviews may contain at most 200 entries")
    validate_coach_state(state)
    validate_triage_state(state)
    validate_shift_state(state)
    scenario_stages = state.get("scenarioStage", {})
    allowed_scenario_stages = {"command", "review", "aftershock", "complete"}
    if any(stage not in allowed_scenario_stages for stage in scenario_stages.values()):
        raise ValueError("scenarioStage contains an invalid stage")
    if any(not isinstance(entry, dict) for entry in state.get("scenarioHistory", [])):
        raise ValueError("scenarioHistory must contain objects")
    validate_scenario_history(state.get("scenarioHistory", []))
    if any(not isinstance(entry, dict) for entry in state.get("remediationCycles", [])):
        raise ValueError("remediationCycles must contain objects")
    validate_remediation_cycles(state.get("remediationCycles", []))
    if any(not isinstance(entry, dict) for entry in state.get("transferReviews", [])):
        raise ValueError("transferReviews must contain objects")
    validate_transfer_reviews(state.get("transferReviews", []))
    cycle_ids = {entry.get("id") for entry in state.get("remediationCycles", [])}
    if any(entry.get("cycleId") not in cycle_ids for entry in state.get("transferReviews", [])):
        raise ValueError("transferReviews must reference an existing remediation cycle")
    active_transfer_review_id = state.get("activeTransferReviewId", "")
    if not isinstance(active_transfer_review_id, str) or len(active_transfer_review_id) > 100:
        raise ValueError("activeTransferReviewId must be a string of at most 100 characters")
    if active_transfer_review_id and not any(
        entry.get("id") == active_transfer_review_id and entry.get("status") == "armed"
        for entry in state.get("transferReviews", [])
    ):
        raise ValueError("activeTransferReviewId must reference an armed transfer review")
    selected_incident_run = state.get("selectedIncidentRun", "")
    if not isinstance(selected_incident_run, str) or len(selected_incident_run) > 100:
        raise ValueError("selectedIncidentRun must be a string of at most 100 characters")
    quiz = state.get("quiz")
    if quiz is not None:
        if not isinstance(quiz, dict):
            raise ValueError("quiz must be an object or null")
        wrong_choices = quiz.get("wrongChoices", [])
        if not isinstance(wrong_choices, list) or len(wrong_choices) > 10:
            raise ValueError("quiz.wrongChoices must be an array of at most 10 choices")
        if any(isinstance(choice, bool) or not isinstance(choice, int) or choice < 0 for choice in wrong_choices):
            raise ValueError("quiz.wrongChoices must contain non-negative integers")
        for name in ("mistakes", "recovered"):
            value = quiz.get(name, 0)
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise ValueError(f"quiz.{name} must be a non-negative integer")
        resolution = quiz.get("resolution")
        if resolution not in (None, "correct", "recovered", "eliminated", "missed"):
            raise ValueError("quiz.resolution is invalid")
        pre_confidence = quiz.get("preConfidence")
        if pre_confidence not in (None, "low", "medium", "high"):
            raise ValueError("quiz.preConfidence is invalid")
        outcomes = quiz.get("outcomes", [])
        if not isinstance(outcomes, list) or len(outcomes) > 50:
            raise ValueError("quiz.outcomes must be an array of at most 50 outcomes")
        allowed_outcomes = {"pending", "clean", "recovered", "eliminated", "skipped"}
        if any(outcome not in allowed_outcomes for outcome in outcomes):
            raise ValueError("quiz.outcomes contains an invalid outcome")
        calibrations = quiz.get("calibrations", [])
        if not isinstance(calibrations, list) or len(calibrations) > 50:
            raise ValueError("quiz.calibrations must be an array of at most 50 outcomes")
        allowed_calibrations = {
            "pending", "unrated", "calibrated", "balanced", "overconfident", "underconfident", "needs-work"
        }
        if any(outcome not in allowed_calibrations for outcome in calibrations):
            raise ValueError("quiz.calibrations contains an invalid outcome")
        if not isinstance(quiz.get("selectionReasons", {}), dict):
            raise ValueError("quiz.selectionReasons must be an object")
        remediation_cycle_id = quiz.get("remediationCycleId")
        if remediation_cycle_id is not None and (not isinstance(remediation_cycle_id, str) or len(remediation_cycle_id) > 100):
            raise ValueError("quiz.remediationCycleId must be a string of at most 100 characters or null")
    serialized = json.dumps(state, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    if len(serialized.encode("utf-8")) > MAX_STATE_BYTES:
        raise ValueError("Serialized state exceeds the 1.8 MB limit")
    return serialized


class ProgressStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    @contextmanager
    def session(self):
        connection = self.connect()
        try:
            yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            current_version = int(connection.execute("PRAGMA user_version").fetchone()[0])
            if current_version > SCHEMA_VERSION:
                raise RuntimeError(
                    f"Database schema {current_version} is newer than supported schema {SCHEMA_VERSION}"
                )
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS progress_state (
                    profile_id TEXT PRIMARY KEY,
                    state_json TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS save_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    profile_id TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    xp INTEGER NOT NULL DEFAULT 0,
                    mastered_nodes INTEGER NOT NULL DEFAULT 0,
                    mastered_questions INTEGER NOT NULL DEFAULT 0,
                    saved_at TEXT NOT NULL,
                    FOREIGN KEY (profile_id) REFERENCES progress_state(profile_id)
                        ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_save_history_profile
                    ON save_history(profile_id, id DESC);

                CREATE TABLE IF NOT EXISTS app_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                """
            )
            connection.execute(
                "INSERT INTO app_meta(key, value) VALUES('schema_version', ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (str(SCHEMA_VERSION),),
            )
            connection.execute(f"PRAGMA user_version={SCHEMA_VERSION}")
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def schema_version(self) -> int:
        with self.session() as connection:
            return int(connection.execute("PRAGMA user_version").fetchone()[0])

    def ready(self) -> dict[str, Any]:
        with self.session() as connection:
            connection.execute("SELECT 1").fetchone()
            version = int(connection.execute("PRAGMA user_version").fetchone()[0])
        return {"status": "ok" if version == SCHEMA_VERSION else "degraded", "schema_version": version}

    def diagnostics(self) -> dict[str, Any]:
        with self.session() as connection:
            integrity = connection.execute("PRAGMA quick_check").fetchone()[0]
            profiles = connection.execute("SELECT COUNT(*) FROM progress_state").fetchone()[0]
            saves = connection.execute("SELECT COUNT(*) FROM save_history").fetchone()[0]
            journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
        return {
            "status": "ok" if integrity == "ok" else "degraded",
            "integrity": integrity,
            "profiles": profiles,
            "save_events": saves,
            "schema_version": self.schema_version(),
            "journal_mode": journal_mode,
            "database_bytes": self.path.stat().st_size if self.path.exists() else 0,
        }

    def load(self, profile_id: str) -> dict[str, Any] | None:
        with self.session() as connection:
            row = connection.execute(
                "SELECT profile_id, state_json, revision, created_at, updated_at "
                "FROM progress_state WHERE profile_id = ?",
                (profile_id,),
            ).fetchone()
        if row is None:
            return None
        return {
            "profile": row["profile_id"],
            "state": json.loads(row["state_json"]),
            "revision": row["revision"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def save(
        self,
        profile_id: str,
        state: dict[str, Any],
        expected_revision: int | None = None,
    ) -> dict[str, Any]:
        serialized = serialize_state(state)
        now = utc_now()
        completed = state.get("completed") if isinstance(state.get("completed"), dict) else {}
        question_stats = state.get("questionStats") if isinstance(state.get("questionStats"), dict) else {}
        mastered_questions = sum(
            1
            for item in question_stats.values()
            if isinstance(item, dict) and int(item.get("mastery", 0) or 0) >= 3
        )

        connection = self.connect()
        try:
            # Serialize the revision read and write. A deferred transaction can lose
            # updates when two workers observe the same revision before either writes.
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute(
                "SELECT revision, created_at, updated_at FROM progress_state WHERE profile_id = ?",
                (profile_id,),
            ).fetchone()
            current_revision = current["revision"] if current else 0
            if expected_revision is not None and expected_revision != current_revision:
                raise RevisionConflict(current_revision, current["updated_at"] if current else None)
            revision = current_revision + 1
            created_at = current["created_at"] if current else now
            connection.execute(
                """
                INSERT INTO progress_state
                    (profile_id, state_json, revision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(profile_id) DO UPDATE SET
                    state_json = excluded.state_json,
                    revision = excluded.revision,
                    updated_at = excluded.updated_at
                """,
                (profile_id, serialized, revision, created_at, now),
            )
            connection.execute(
                """
                INSERT INTO save_history
                    (profile_id, revision, xp, mastered_nodes, mastered_questions, saved_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    profile_id,
                    revision,
                    int(state.get("xp", 0) or 0),
                    sum(1 for value in completed.values() if value),
                    mastered_questions,
                    now,
                ),
            )
            connection.execute(
                """
                DELETE FROM save_history
                WHERE profile_id = ? AND id NOT IN (
                    SELECT id FROM save_history
                    WHERE profile_id = ? ORDER BY id DESC LIMIT 200
                )
                """,
                (profile_id, profile_id),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

        return {
            "profile": profile_id,
            "state": state,
            "revision": revision,
            "created_at": created_at,
            "updated_at": now,
        }

    def history(self, profile_id: str, limit: int = 20) -> list[dict[str, Any]]:
        safe_limit = max(1, min(100, limit))
        with self.session() as connection:
            rows = connection.execute(
                """
                SELECT revision, xp, mastered_nodes, mastered_questions, saved_at
                FROM save_history
                WHERE profile_id = ?
                ORDER BY id DESC LIMIT ?
                """,
                (profile_id, safe_limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def backup(self, destination: Path) -> Path:
        destination = Path(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.unlink(missing_ok=True)
        source = self.connect()
        target = sqlite3.connect(temporary)
        try:
            source.backup(target)
            integrity = target.execute("PRAGMA quick_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError(f"Backup integrity check failed: {integrity}")
        finally:
            target.close()
            source.close()
        temporary.replace(destination)
        return destination


@dataclass
class ApiResponse:
    status: HTTPStatus
    body: bytes = b""
    headers: dict[str, str] = field(default_factory=dict)


def json_response(
    status: HTTPStatus,
    payload: dict[str, Any] | list[dict[str, Any]],
    headers: dict[str, str] | None = None,
) -> ApiResponse:
    body = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    return ApiResponse(
        status,
        body,
        {"Content-Type": "application/json; charset=utf-8", **(headers or {})},
    )


class ApiRouter:
    def __init__(self, store: ProgressStore):
        self.store = store

    @staticmethod
    def profile(query: dict[str, list[str]]) -> str:
        profile_id = query.get("profile", ["local"])[0]
        if not PROFILE_PATTERN.fullmatch(profile_id):
            raise ValueError("Invalid profile")
        return profile_id

    @staticmethod
    def parse_payload(body: bytes, headers: dict[str, str]) -> dict[str, Any]:
        if not body:
            raise ValueError("Request body must not be empty")
        if len(body) > MAX_BODY_BYTES:
            raise PayloadTooLarge("Request body exceeds 2 MB")
        if not headers.get("content-type", "").lower().startswith("application/json"):
            raise ValueError("Content-Type must be application/json")
        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError("Invalid JSON") from exc
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object")
        return payload

    @staticmethod
    def verify_same_origin(headers: dict[str, str]) -> None:
        origin = headers.get("origin")
        host = headers.get("host")
        if origin and host and urlparse(origin).netloc != host:
            raise PermissionError("Cross-origin state writes are not allowed")

    def handle(
        self,
        method: str,
        target: str,
        headers: dict[str, str] | None = None,
        body: bytes = b"",
    ) -> ApiResponse:
        headers = {name.lower(): value for name, value in (headers or {}).items()}
        parsed = urlparse(target)
        query = parse_qs(parsed.query, keep_blank_values=True)
        path = parsed.path
        try:
            if path == "/api/health/live" and method in {"GET", "HEAD"}:
                return json_response(
                    HTTPStatus.OK,
                    {"status": "ok", "api_version": API_VERSION},
                    {"Cache-Control": "no-store"},
                )
            if path in {"/api/health", "/api/health/ready"} and method in {"GET", "HEAD"}:
                payload = self.store.ready()
                payload["database"] = self.store.path.name
                return json_response(
                    HTTPStatus.OK if payload["status"] == "ok" else HTTPStatus.SERVICE_UNAVAILABLE,
                    payload,
                    {"Cache-Control": "no-store"},
                )
            if path == "/api/state" and method in {"GET", "HEAD"}:
                profile_id = self.profile(query)
                saved = self.store.load(profile_id)
                payload = saved or {
                    "profile": profile_id,
                    "state": None,
                    "revision": 0,
                    "updated_at": None,
                }
                etag = state_etag(profile_id, int(payload["revision"]))
                cache_headers = {
                    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
                    "ETag": etag,
                    "Vary": "Accept-Encoding",
                }
                if etag_matches(headers.get("if-none-match"), etag):
                    return ApiResponse(HTTPStatus.NOT_MODIFIED, headers=cache_headers)
                return json_response(HTTPStatus.OK, payload, cache_headers)
            if path == "/api/diagnostics" and method in {"GET", "HEAD"}:
                return json_response(
                    HTTPStatus.OK,
                    self.store.diagnostics(),
                    {"Cache-Control": "no-store"},
                )
            if path == "/api/history" and method in {"GET", "HEAD"}:
                profile_id = self.profile(query)
                limit = int(query.get("limit", ["20"])[0])
                return json_response(
                    HTTPStatus.OK,
                    {"profile": profile_id, "history": self.store.history(profile_id, limit)},
                    {"Cache-Control": "private, no-store"},
                )
            if path == "/api/export" and method in {"GET", "HEAD"}:
                profile_id = self.profile(query)
                saved = self.store.load(profile_id)
                return json_response(
                    HTTPStatus.OK,
                    saved or {
                        "profile": profile_id,
                        "state": None,
                        "revision": 0,
                        "updated_at": None,
                    },
                    {
                        "Cache-Control": "private, no-store",
                        "Content-Disposition": f'attachment; filename="trading-ops-{profile_id}.json"',
                    },
                )
            if path == "/api/state" and method == "PUT":
                self.verify_same_origin(headers)
                payload = self.parse_payload(body, headers)
                profile_id = payload.get("profile", "local")
                if not isinstance(profile_id, str) or not PROFILE_PATTERN.fullmatch(profile_id):
                    raise ValueError("Invalid profile")
                state = payload.get("state")
                if not isinstance(state, dict):
                    raise ValueError("state must be an object")
                revision = payload.get("revision")
                if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
                    raise ValueError("revision must be a non-negative integer")
                etag_revision = revision_from_etag(headers.get("if-match"), profile_id)
                if etag_revision is not None and etag_revision != revision:
                    raise ValueError("If-Match revision does not match body revision")
                saved = self.store.save(profile_id, state, expected_revision=revision)
                return json_response(
                    HTTPStatus.OK,
                    saved,
                    {
                        "Cache-Control": "no-store",
                        "ETag": state_etag(profile_id, int(saved["revision"])),
                    },
                )
            if path.startswith("/api/") and method == "OPTIONS":
                return ApiResponse(
                    HTTPStatus.NO_CONTENT,
                    headers={"Allow": "GET, HEAD, PUT, OPTIONS", "Cache-Control": "no-store"},
                )
            if path.startswith("/api/"):
                return json_response(
                    HTTPStatus.METHOD_NOT_ALLOWED if path == "/api/state" else HTTPStatus.NOT_FOUND,
                    {"error": "method_not_allowed" if path == "/api/state" else "not_found"},
                    {"Allow": "GET, HEAD, PUT, OPTIONS", "Cache-Control": "no-store"},
                )
            return json_response(HTTPStatus.NOT_FOUND, {"error": "not_found"}, {"Cache-Control": "no-store"})
        except RevisionConflict as exc:
            return json_response(
                HTTPStatus.CONFLICT,
                {
                    "error": "revision_conflict",
                    "revision": exc.revision,
                    "updated_at": exc.updated_at,
                },
                {
                    "Cache-Control": "no-store",
                    "ETag": state_etag(self.profile(query) if method != "PUT" else payload.get("profile", "local"), exc.revision),
                },
            )
        except PayloadTooLarge as exc:
            return json_response(HTTPStatus.CONTENT_TOO_LARGE, {"error": str(exc)}, {"Cache-Control": "no-store"})
        except PermissionError as exc:
            return json_response(HTTPStatus.FORBIDDEN, {"error": str(exc)}, {"Cache-Control": "no-store"})
        except (ValueError, TypeError) as exc:
            return json_response(HTTPStatus.BAD_REQUEST, {"error": str(exc)}, {"Cache-Control": "no-store"})
        except sqlite3.Error:
            return json_response(
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"error": "storage_unavailable"},
                {"Cache-Control": "no-store", "Retry-After": "1"},
            )


class AppHandler(SimpleHTTPRequestHandler):
    router: ApiRouter
    static_root = DIST_ROOT
    protocol_version = "HTTP/1.1"
    server_version = "TradingOpsOrigin/1"
    sys_version = ""

    def __init__(self, *args: Any, **kwargs: Any):
        self._api_response = False
        self._request_started = time.perf_counter()
        self._request_id = ""
        root = self.static_root if (self.static_root / "index.html").exists() else ROOT
        super().__init__(*args, directory=str(root), **kwargs)

    def handle_one_request(self) -> None:
        # HTTP/1.1 keep-alive reuses a handler instance, so request-scoped
        # timing and correlation state must be reset for every message.
        self._api_response = False
        self._request_started = time.perf_counter()
        self._request_id = ""
        super().handle_one_request()

    def current_request_id(self) -> str:
        if not self._request_id:
            self._request_id = request_id(self.headers.get("X-Request-ID"))
        return self._request_id

    def end_headers(self) -> None:
        if not self._api_response:
            path = urlparse(self.path).path
            if path.startswith("/assets/"):
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
                self.send_header("X-Edge-Cache", "IMMUTABLE")
            elif path in {"/service-worker.js", "/asset-manifest.json"}:
                self.send_header("Cache-Control", "no-cache, max-age=0, must-revalidate")
                self.send_header("X-Edge-Cache", "REVALIDATE")
            else:
                self.send_header("Cache-Control", "no-cache, max-age=0, must-revalidate")
                self.send_header("X-Edge-Cache", "REVALIDATE")
        for name, value in SECURITY_HEADERS.items():
            self.send_header(name, value)
        self.send_header("X-Request-ID", self.current_request_id())
        super().end_headers()

    def api_headers(self) -> dict[str, str]:
        return {name.lower(): value for name, value in self.headers.items()}

    def read_api_body(self) -> bytes:
        raw_length = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_length)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length") from exc
        if length > MAX_BODY_BYTES:
            raise PayloadTooLarge("Request body exceeds 2 MB")
        return self.rfile.read(max(0, length))

    def send_api(self, response: ApiResponse, include_body: bool = True) -> None:
        self._api_response = True
        self.send_response(response.status)
        for name, value in response.headers.items():
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(response.body)))
        self.send_header("Server-Timing", f"app;dur={(time.perf_counter() - self._request_started) * 1000:.2f}")
        self.end_headers()
        if include_body and response.body:
            self.wfile.write(response.body)

    def route_api(self, method: str, include_body: bool = True) -> bool:
        if not urlparse(self.path).path.startswith("/api/"):
            return False
        try:
            body = self.read_api_body() if method in {"PUT", "POST", "PATCH"} else b""
            response = self.router.handle(method, self.path, self.api_headers(), body)
        except PayloadTooLarge as exc:
            response = json_response(
                HTTPStatus.CONTENT_TOO_LARGE,
                {"error": str(exc)},
                {"Cache-Control": "no-store"},
            )
        except ValueError as exc:
            response = json_response(
                HTTPStatus.BAD_REQUEST,
                {"error": str(exc)},
                {"Cache-Control": "no-store"},
            )
        self.send_api(response, include_body=include_body)
        return True

    def do_GET(self) -> None:
        if not self.route_api("GET"):
            super().do_GET()

    def do_HEAD(self) -> None:
        if not self.route_api("HEAD", include_body=False):
            super().do_HEAD()

    def do_PUT(self) -> None:
        if not self.route_api("PUT"):
            self.send_api(json_response(HTTPStatus.NOT_FOUND, {"error": "not_found"}))

    def do_POST(self) -> None:
        self.route_api("POST") or self.send_api(json_response(HTTPStatus.NOT_FOUND, {"error": "not_found"}))

    def do_PATCH(self) -> None:
        self.route_api("PATCH") or self.send_api(json_response(HTTPStatus.NOT_FOUND, {"error": "not_found"}))

    def do_DELETE(self) -> None:
        self.route_api("DELETE") or self.send_api(json_response(HTTPStatus.NOT_FOUND, {"error": "not_found"}))

    def do_OPTIONS(self) -> None:
        self.route_api("OPTIONS") or self.send_api(json_response(HTTPStatus.NOT_FOUND, {"error": "not_found"}))

    def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
        record = {
            "timestamp": utc_now(),
            "request_id": self.current_request_id(),
            "remote": self.client_address[0],
            "method": self.command,
            "path": urlparse(self.path).path,
            "status": int(code) if str(code).isdigit() else code,
            "bytes": int(size) if str(size).isdigit() else size,
            "duration_ms": round((time.perf_counter() - self._request_started) * 1000, 2),
        }
        print(json.dumps(record, separators=(",", ":")), file=sys.stdout, flush=True)

    def log_message(self, format: str, *args: Any) -> None:
        return


class ProductionLikeHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True
    request_queue_size = 128


_wsgi_lock = threading.Lock()
_wsgi_router: ApiRouter | None = None


def get_wsgi_router() -> ApiRouter:
    global _wsgi_router
    if _wsgi_router is None:
        with _wsgi_lock:
            if _wsgi_router is None:
                database = Path(os.environ.get("OPS_DB_PATH", DEFAULT_DB))
                _wsgi_router = ApiRouter(ProgressStore(database))
    return _wsgi_router


def wsgi_application(environ: dict[str, Any], start_response: Any) -> Iterable[bytes]:
    started = time.perf_counter()
    incoming_request_id = environ.get("HTTP_X_REQUEST_ID")
    current_id = request_id(incoming_request_id)
    method = environ.get("REQUEST_METHOD", "GET").upper()
    path = environ.get("PATH_INFO", "/")
    query = environ.get("QUERY_STRING", "")
    target = f"{path}?{query}" if query else path
    headers = {
        name[5:].replace("_", "-").lower(): value
        for name, value in environ.items()
        if name.startswith("HTTP_")
    }
    if environ.get("CONTENT_TYPE"):
        headers["content-type"] = environ["CONTENT_TYPE"]
    if environ.get("CONTENT_LENGTH"):
        headers["content-length"] = environ["CONTENT_LENGTH"]
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except ValueError:
        length = 0
    if length > MAX_BODY_BYTES:
        response = json_response(
            HTTPStatus.CONTENT_TOO_LARGE,
            {"error": "Request body exceeds 2 MB"},
            {"Cache-Control": "no-store"},
        )
    else:
        body = environ["wsgi.input"].read(length) if length else b""
        try:
            response = get_wsgi_router().handle(method, target, headers, body)
        except Exception:
            response = json_response(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "internal_error", "request_id": current_id},
                {"Cache-Control": "no-store"},
            )

    duration_ms = (time.perf_counter() - started) * 1000
    outgoing_headers = {
        **SECURITY_HEADERS,
        **response.headers,
        "Content-Length": str(len(response.body)),
        "Server-Timing": f"app;dur={duration_ms:.2f}",
        "X-Request-ID": current_id,
    }
    start_response(
        f"{response.status.value} {response.status.phrase}",
        list(outgoing_headers.items()),
    )
    print(
        json.dumps(
            {
                "timestamp": utc_now(),
                "request_id": current_id,
                "remote": environ.get("REMOTE_ADDR", ""),
                "method": method,
                "path": path,
                "status": response.status.value,
                "bytes": len(response.body),
                "duration_ms": round(duration_ms, 2),
            },
            separators=(",", ":"),
        ),
        file=sys.stdout,
        flush=True,
    )
    return [b"" if method == "HEAD" else response.body]


application = wsgi_application


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("OPS_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("OPS_PORT", "8766")))
    parser.add_argument("--db", type=Path, default=Path(os.environ.get("OPS_DB_PATH", DEFAULT_DB)))
    parser.add_argument("--static-root", type=Path, default=DIST_ROOT)
    parser.add_argument("--backup", type=Path, help="Create a verified SQLite backup and exit")
    args = parser.parse_args()

    store = ProgressStore(args.db)
    if args.backup:
        destination = store.backup(args.backup)
        print(json.dumps({"status": "ok", "backup": str(destination)}))
        return

    AppHandler.router = ApiRouter(store)
    AppHandler.static_root = args.static_root.resolve()
    server = ProductionLikeHTTPServer((args.host, args.port), AppHandler)
    print(
        json.dumps(
            {
                "event": "server_started",
                "url": f"http://{args.host}:{args.port}/",
                "database": str(args.db),
                "static_root": str(AppHandler.static_root),
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
