import io
import http.client
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from server import ApiRouter, AppHandler, ProductionLikeHTTPServer, ProgressStore, RevisionConflict, state_etag, wsgi_application


class ProgressStoreTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = ProgressStore(Path(self.temp_dir.name) / "progress.db")

    def tearDown(self):
        server._wsgi_router = None
        self.temp_dir.cleanup()

    def test_round_trip_and_revision(self):
        initial = {
            "xp": 120,
            "completed": {"feed-state": True},
            "questionStats": {"q01": {"correct": 1, "attempts": 1}},
            "nodeNotes": {"feed-state": "Review snapshot recovery."},
        }
        first = self.store.save("local", initial)
        self.assertEqual(first["revision"], 1)
        self.assertEqual(self.store.load("local")["state"], initial)

        updated = {**initial, "xp": 145}
        second = self.store.save("local", updated)
        self.assertEqual(second["revision"], 2)
        self.assertEqual(self.store.load("local")["state"]["xp"], 145)

    def test_history_tracks_progress_metrics(self):
        self.store.save(
            "local",
            {
                "xp": 80,
                "completed": {"a": True, "b": False},
                "questionStats": {
                    "q01": {"correct": 1, "mastery": 3},
                    "q02": {"correct": 1, "mastery": 2},
                },
            },
        )
        history = self.store.history("local")
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["xp"], 80)
        self.assertEqual(history[0]["mastered_nodes"], 1)
        self.assertEqual(history[0]["mastered_questions"], 1)

    def test_revision_conflict_preserves_newer_state(self):
        first = self.store.save("local", {"uiVersion": 6, "xp": 10})
        self.store.save("local", {"uiVersion": 6, "xp": 20}, expected_revision=first["revision"])

        with self.assertRaises(RevisionConflict) as conflict:
            self.store.save("local", {"uiVersion": 6, "xp": 15}, expected_revision=first["revision"])

        self.assertEqual(conflict.exception.revision, 2)
        self.assertEqual(self.store.load("local")["state"]["xp"], 20)

    def test_state_validation_rejects_invalid_shapes(self):
        with self.assertRaisesRegex(ValueError, "questionStats must be an object"):
            self.store.save("local", {"uiVersion": 6, "xp": 10, "questionStats": []})

        with self.assertRaisesRegex(ValueError, "xp must be a non-negative number"):
            self.store.save("local", {"uiVersion": 6, "xp": -1})

        with self.assertRaisesRegex(ValueError, "rewardHistory must be an array"):
            self.store.save("local", {"uiVersion": 8, "xp": 10, "rewardHistory": {}})

        with self.assertRaisesRegex(ValueError, "quiz.wrongChoices must contain non-negative integers"):
            self.store.save(
                "local",
                {"uiVersion": 9, "xp": 10, "quiz": {"wrongChoices": [1, -1]}},
            )

        with self.assertRaisesRegex(ValueError, "quiz.resolution is invalid"):
            self.store.save(
                "local",
                {"uiVersion": 9, "xp": 10, "quiz": {"resolution": "guessed"}},
            )

        with self.assertRaisesRegex(ValueError, "quiz.outcomes contains an invalid outcome"):
            self.store.save(
                "local",
                {"uiVersion": 9, "xp": 10, "quiz": {"outcomes": ["clean", "lucky"]}},
            )

        with self.assertRaisesRegex(ValueError, "soundVolume must be a number between 0 and 100"):
            self.store.save("local", {"uiVersion": 9, "xp": 10, "soundVolume": 101})

        with self.assertRaisesRegex(ValueError, "soundPack is invalid"):
            self.store.save("local", {"uiVersion": 9, "xp": 10, "soundPack": "casino"})

        with self.assertRaisesRegex(ValueError, "scenarioPlaybackSpeed is invalid"):
            self.store.save("local", {"uiVersion": 10, "xp": 10, "scenarioPlaybackSpeed": 1000})

        with self.assertRaisesRegex(ValueError, "quiz.preConfidence is invalid"):
            self.store.save(
                "local",
                {"uiVersion": 11, "xp": 10, "quiz": {"preConfidence": "certain"}},
            )

        with self.assertRaisesRegex(ValueError, "quiz.calibrations contains an invalid outcome"):
            self.store.save(
                "local",
                {"uiVersion": 11, "xp": 10, "quiz": {"calibrations": ["overconfident", "lucky"]}},
            )

        with self.assertRaisesRegex(ValueError, "scenarioStage contains an invalid stage"):
            self.store.save(
                "local",
                {"uiVersion": 12, "xp": 10, "scenarioStage": {"green-socket": "skipped"}},
            )

        with self.assertRaisesRegex(ValueError, "scenarioHistory must be an array"):
            self.store.save(
                "local",
                {"uiVersion": 12, "xp": 10, "scenarioHistory": {}},
            )

        with self.assertRaisesRegex(ValueError, "scenarioHistory may contain at most 200 entries"):
            self.store.save(
                "local",
                {"uiVersion": 12, "xp": 10, "scenarioHistory": [{} for _ in range(201)]},
            )

        with self.assertRaisesRegex(ValueError, "scenarioHistory must contain objects"):
            self.store.save(
                "local",
                {"uiVersion": 12, "xp": 10, "scenarioHistory": ["bad-entry"]},
            )

        with self.assertRaisesRegex(ValueError, "scenarioHistory.branch is invalid"):
            self.store.save(
                "local",
                {"uiVersion": 13, "xp": 10, "scenarioHistory": [{"branch": "lucky"}]},
            )

        with self.assertRaisesRegex(ValueError, "scenarioHistory.commandDecisionScore must be a number between 0 and 35"):
            self.store.save(
                "local",
                {"uiVersion": 13, "xp": 10, "scenarioHistory": [{"commandDecisionScore": 36}]},
            )

        with self.assertRaisesRegex(ValueError, "scenarioHistory.recoveryEvidenceSelected must contain non-negative integers"):
            self.store.save(
                "local",
                {"uiVersion": 13, "xp": 10, "scenarioHistory": [{"recoveryEvidenceSelected": [0, -1]}]},
            )

        with self.assertRaisesRegex(ValueError, "scenarioHistory.commandDispatchText must be a string of at most 1200 characters"):
            self.store.save(
                "local",
                {"uiVersion": 13, "xp": 10, "scenarioHistory": [{"commandDispatchText": "x" * 1201}]},
            )

        with self.assertRaisesRegex(ValueError, "selectedIncidentRun must be a string of at most 100 characters"):
            self.store.save(
                "local",
                {"uiVersion": 13, "xp": 10, "selectedIncidentRun": "x" * 101},
            )

        saved = self.store.save(
            "local",
            {
                "uiVersion": 13,
                "xp": 10,
                "selectedIncidentRun": "run-1",
                "scenarioHistory": [
                    {
                        "id": "run-1",
                        "scenarioId": "green-socket",
                        "branch": "contained",
                        "attempt": 1,
                        "commandScore": 82,
                        "commandDecisionScore": 35,
                        "commandEvidenceScore": 29,
                        "commandDispatchScore": 18,
                        "commandEvidenceSelected": [0, 2],
                        "commandMissing": ["next update"],
                        "commandDispatchText": "08:15 STRAT-3 remains paused while the output route is isolated.",
                        "recoveryScore": 88,
                        "recoveryDecisionScore": 35,
                        "recoveryEvidenceScore": 35,
                        "recoveryHandoffScore": 18,
                        "recoveryEvidenceSelected": [0, 1],
                        "recoveryMissing": ["release authority"],
                        "recoveryHandoffText": "Freshness and sequence continuity are verified; release remains gated.",
                        "composite": 84,
                    }
                ],
            },
        )
        self.assertEqual(saved["state"]["scenarioHistory"][0]["composite"], 84)

    def test_question_mastery_evidence_validation(self):
        valid = {
            "uiVersion": 18,
            "xp": 10,
            "questionStats": {
                "q233": {
                    "attempts": 3,
                    "correct": 2,
                    "wrong": 1,
                    "skipped": 0,
                    "mastery": 3,
                    "cleanStreak": 2,
                    "retentionPasses": 1,
                    "masteryDates": ["2026-07-13", "2026-07-14", "2026-07-15"],
                    "lastMasteryDate": "2026-07-15",
                    "masteryUpdatedAt": "2026-07-15T10:00:00.000Z",
                    "lastSeen": "2026-07-15",
                    "nextReview": "2026-07-18",
                    "reviewStage": 2,
                    "reviewIntervalDays": 3,
                    "reviewReason": "Clean recall",
                    "lastResult": "correct",
                    "lastReviewGrade": "auto",
                    "confidenceAttempts": {"high": 2},
                    "confidenceClean": {"high": 1},
                    "calibrationOutcomes": {"calibrated": 1},
                    "misconceptions": {"scope-before-action": 1},
                }
            },
        }
        saved = self.store.save("mastery-valid", valid)
        self.assertEqual(saved["state"]["questionStats"]["q233"]["mastery"], 3)

        mutations = [
            ("mastery", 6, "mastery must be an integer between 0 and 5"),
            ("masteryDates", ["2026-07-15", "2026-07-15"], "must be unique and sorted"),
            ("masteryDates", ["15-07-2026"], "must contain YYYY-MM-DD dates"),
            ("lastSeen", "2026-02-31", "must be a YYYY-MM-DD date"),
            ("lastMasteryDate", "2026-07-12", "must reference masteryDates"),
            ("lastResult", "lucky", "lastResult is invalid"),
            ("retentionPasses", -1, "retentionPasses must be a non-negative integer"),
        ]
        for index, (field, value, message) in enumerate(mutations):
            forged = json.loads(json.dumps(valid))
            forged["questionStats"]["q233"][field] = value
            with self.subTest(field=field, value=value):
                with self.assertRaisesRegex(ValueError, message):
                    self.store.save(f"mastery-invalid-{index}", forged)

        forged_counts = json.loads(json.dumps(valid))
        forged_counts["questionStats"]["q233"]["attempts"] = 2
        with self.assertRaisesRegex(ValueError, "correct and wrong counts may not exceed attempts"):
            self.store.save("mastery-invalid-counts", forged_counts)

    def test_practice_run_audit_validation_and_lineage(self):
        source_run = {
            "id": "practice-adaptive-source",
            "date": "2026-07-15",
            "startedAt": "2026-07-15T18:00:00.000Z",
            "completedAt": "2026-07-15T18:02:00.000Z",
            "durationSeconds": 120,
            "mode": "adaptive",
            "origin": "bank",
            "name": "Command queue",
            "score": 75,
            "clean": 1,
            "recovered": 1,
            "eliminated": 0,
            "skipped": 0,
            "mistakes": 1,
            "xpEarned": 24,
            "questionIds": ["q001", "q002"],
            "questionBranches": ["market", "feed"],
            "outcomes": ["clean", "recovered"],
            "calibrations": ["balanced", "overconfident"],
            "selectionReasons": {"q001": "Unseen coverage selected", "q002": "Prior miss targeted"},
            "evidenceBefore": {"q001": 0, "q002": 1},
            "evidenceAfter": {"q001": 1, "q002": 1},
            "repairQuestionIds": ["q002"],
            "remediationCycleId": "",
            "replayOfRunId": "",
            "repairOfRunId": "",
            "legacy": False,
        }
        repair_run = {
            "id": "practice-run-repair-1",
            "date": "2026-07-15",
            "startedAt": "2026-07-15T18:05:00.000Z",
            "completedAt": "2026-07-15T18:06:00.000Z",
            "durationSeconds": 60,
            "mode": "run-repair",
            "origin": "audit",
            "name": "Repair | Command queue",
            "score": 100,
            "clean": 1,
            "recovered": 0,
            "eliminated": 0,
            "skipped": 0,
            "mistakes": 0,
            "xpEarned": 10,
            "questionIds": ["q002"],
            "questionBranches": ["feed"],
            "outcomes": ["clean"],
            "calibrations": ["calibrated"],
            "selectionReasons": {"q002": "Exact run repair: recovered with a high-confidence miss"},
            "evidenceBefore": {"q002": 1},
            "evidenceAfter": {"q002": 2},
            "repairQuestionIds": [],
            "remediationCycleId": "",
            "replayOfRunId": "",
            "repairOfRunId": source_run["id"],
            "legacy": False,
        }
        valid = {
            "uiVersion": 19,
            "xp": 42,
            "quizHistory": [source_run, repair_run],
            "selectedPracticeRun": repair_run["id"],
        }
        saved = self.store.save("practice-valid", valid)
        self.assertEqual(saved["state"]["quizHistory"][0]["repairQuestionIds"], ["q002"])
        self.assertEqual(saved["state"]["selectedPracticeRun"], repair_run["id"])

        mutations = [
            ("score", lambda state: state["quizHistory"][0].__setitem__("score", 74), "score must match weighted outcomes"),
            ("duration", lambda state: state["quizHistory"][0].__setitem__("durationSeconds", 121), "durationSeconds must match"),
            ("repair-set", lambda state: state["quizHistory"][0].__setitem__("repairQuestionIds", []), "repairQuestionIds must match"),
            ("selection", lambda state: state.__setitem__("selectedPracticeRun", "missing"), "must reference a completed practice run"),
            ("timestamp", lambda state: state["quizHistory"][0].__setitem__("completedAt", "2026-07-15 18:02"), "timestamps must be timezone-aware"),
        ]
        for index, (name, mutate, message) in enumerate(mutations):
            forged = json.loads(json.dumps(valid))
            mutate(forged)
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, message):
                    self.store.save(f"practice-invalid-{index}", forged)

        forged_lineage = json.loads(json.dumps(valid))
        forged_lineage["quizHistory"][1]["questionIds"] = ["q001"]
        forged_lineage["quizHistory"][1]["questionBranches"] = ["market"]
        forged_lineage["quizHistory"][1]["selectionReasons"] = {"q001": "forged"}
        forged_lineage["quizHistory"][1]["evidenceBefore"] = {"q001": 1}
        forged_lineage["quizHistory"][1]["evidenceAfter"] = {"q001": 2}
        with self.assertRaisesRegex(ValueError, "Exact repair questions must match"):
            self.store.save("practice-invalid-lineage", forged_lineage)

        forged_ambiguous_lineage = json.loads(json.dumps(valid))
        forged_ambiguous_lineage["quizHistory"][1]["replayOfRunId"] = source_run["id"]
        with self.assertRaisesRegex(ValueError, "may not claim both replay and repair lineage"):
            self.store.save("practice-invalid-ambiguous-lineage", forged_ambiguous_lineage)

        legacy = {
            "uiVersion": 19,
            "xp": 10,
            "quizHistory": [{
                "id": "legacy-practice-2026-07-13-single-0",
                "date": "2026-07-13",
                "startedAt": "2026-07-13T12:00:00.000Z",
                "completedAt": "2026-07-13T12:00:00.000Z",
                "durationSeconds": 0,
                "mode": "single",
                "origin": "bank",
                "name": "",
                "score": 100,
                "clean": 0,
                "recovered": 0,
                "eliminated": 0,
                "skipped": 0,
                "mistakes": 0,
                "xpEarned": 0,
                "questionIds": [],
                "questionBranches": [],
                "outcomes": [],
                "calibrations": [],
                "selectionReasons": {},
                "evidenceBefore": {},
                "evidenceAfter": {},
                "repairQuestionIds": [],
                "remediationCycleId": "",
                "replayOfRunId": "",
                "repairOfRunId": "",
                "legacy": True,
            }],
            "selectedPracticeRun": "legacy-practice-2026-07-13-single-0",
        }
        self.assertEqual(self.store.save("practice-legacy-v19", legacy)["state"]["quizHistory"][0]["score"], 100)
        self.assertEqual(
            self.store.save("practice-legacy-v18", {"uiVersion": 18, "xp": 10, "quizHistory": [{"date": "2026-07-13", "mode": "single", "score": 100}]})["state"]["quizHistory"][0]["score"],
            100,
        )

    def test_training_plan_validation_and_round_trip(self):
        valid = {
            "uiVersion": 20,
            "xp": 42,
            "trainingPlans": [{
                "id": "training-plan-1",
                "date": "2026-07-15",
                "createdAt": "2026-07-15T18:00:00.000Z",
                "updatedAt": "2026-07-15T18:05:00.000Z",
                "completedAt": "",
                "minutesBudget": 60,
                "intensity": "balanced",
                "status": "active",
                "basis": {"readiness": 12, "dueQuestions": 4, "weakBranch": "feed"},
                "items": [
                    {
                        "id": "training-plan-1-item-1",
                        "type": "review",
                        "targetId": "review",
                        "title": "Clear due decisions",
                        "detail": "4 spaced reviews",
                        "reason": "Retention debt is currently due.",
                        "minutes": 10,
                        "status": "complete",
                        "baseline": 1,
                        "startedAt": "2026-07-15T18:00:30.000Z",
                        "completedAt": "2026-07-15T18:03:00.000Z",
                    },
                    {
                        "id": "training-plan-1-item-2",
                        "type": "checkpoint",
                        "targetId": "market-states",
                        "title": "Market states",
                        "detail": "Verified path gate",
                        "reason": "This is the next prerequisite.",
                        "minutes": 20,
                        "status": "active",
                        "baseline": 0,
                        "startedAt": "2026-07-15T18:04:00.000Z",
                        "completedAt": "",
                    },
                ],
            }],
            "activeTrainingPlanId": "training-plan-1",
        }
        saved = self.store.save("training-plan-valid", valid)
        self.assertEqual(saved["state"]["trainingPlans"][0]["items"][1]["status"], "active")
        self.assertEqual(saved["state"]["activeTrainingPlanId"], "training-plan-1")

        mutations = [
            ("budget", lambda state: state["trainingPlans"][0]["items"][1].__setitem__("minutes", 55), "planned minutes may not exceed"),
            ("duplicate-item", lambda state: state["trainingPlans"][0]["items"][1].__setitem__("id", "training-plan-1-item-1"), "item IDs must be unique"),
            ("intensity", lambda state: state["trainingPlans"][0].__setitem__("intensity", "extreme"), "intensity is invalid"),
            ("pointer", lambda state: state.__setitem__("activeTrainingPlanId", "missing"), "must reference the single active training plan"),
            ("active-start", lambda state: state["trainingPlans"][0]["items"][1].__setitem__("startedAt", ""), "startedAt is required"),
            ("skipped-terminal", lambda state: (state["trainingPlans"][0]["items"][1].__setitem__("status", "skipped"), state["trainingPlans"][0]["items"][1].__setitem__("completedAt", "")), "completedAt is required"),
            ("before-created", lambda state: state["trainingPlans"][0]["items"][1].__setitem__("startedAt", "2026-07-15T17:59:00.000Z"), "after plan creation"),
            ("after-update", lambda state: state["trainingPlans"][0]["items"][1].__setitem__("startedAt", "2026-07-15T18:06:00.000Z"), "may not be later than the plan update"),
        ]
        for index, (name, mutate, message) in enumerate(mutations):
            forged = json.loads(json.dumps(valid))
            mutate(forged)
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, message):
                    self.store.save(f"training-plan-invalid-{index}", forged)

        incomplete_claim = json.loads(json.dumps(valid))
        incomplete_claim["trainingPlans"][0]["status"] = "complete"
        incomplete_claim["trainingPlans"][0]["completedAt"] = "2026-07-15T18:05:00.000Z"
        incomplete_claim["trainingPlans"][0]["items"][1]["status"] = "pending"
        incomplete_claim["activeTrainingPlanId"] = ""
        with self.assertRaisesRegex(ValueError, "status complete requires every block to be complete"):
            self.store.save("training-plan-incomplete-claim", incomplete_claim)

        two_active = json.loads(json.dumps(valid))
        second_plan = json.loads(json.dumps(valid["trainingPlans"][0]))
        second_plan["id"] = "training-plan-2"
        second_plan["items"][0]["id"] = "training-plan-2-item-1"
        second_plan["items"][1]["id"] = "training-plan-2-item-2"
        two_active["trainingPlans"].append(second_plan)
        with self.assertRaisesRegex(ValueError, "at most one active plan"):
            self.store.save("training-plan-two-active", two_active)

        complete = json.loads(json.dumps(valid))
        complete_plan = complete["trainingPlans"][0]
        complete_plan["status"] = "complete"
        complete_plan["items"][1]["status"] = "complete"
        complete_plan["items"][1]["completedAt"] = "2026-07-15T18:05:00.000Z"
        complete_plan["completedAt"] = "2026-07-15T18:05:00.000Z"
        complete["activeTrainingPlanId"] = ""
        self.assertEqual(self.store.save("training-plan-complete", complete)["state"]["trainingPlans"][0]["status"], "complete")

        late_close = json.loads(json.dumps(complete))
        late_close["trainingPlans"][0]["completedAt"] = "2026-07-15T18:06:00.000Z"
        with self.assertRaisesRegex(ValueError, "must close after every completed block"):
            self.store.save("training-plan-late-close", late_close)

        legacy = self.store.save("training-plan-legacy-v19", {"uiVersion": 19, "xp": 10})
        self.assertEqual(legacy["state"]["uiVersion"], 19)

    def test_remediation_cycle_validation_and_round_trip(self):
        with self.assertRaisesRegex(ValueError, "remediationCycles must be an array"):
            self.store.save("local", {"uiVersion": 14, "xp": 10, "remediationCycles": {}})

        with self.assertRaisesRegex(ValueError, "remediationCycles may contain at most 100 entries"):
            self.store.save(
                "local",
                {"uiVersion": 14, "xp": 10, "remediationCycles": [{} for _ in range(101)]},
            )

        with self.assertRaisesRegex(ValueError, "remediationCycles.status is invalid"):
            self.store.save(
                "local",
                {"uiVersion": 14, "xp": 10, "remediationCycles": [{"status": "lucky"}]},
            )

        with self.assertRaisesRegex(ValueError, "remediationCycles.quizBestScore must be a number between 0 and 100 or null"):
            self.store.save(
                "local",
                {"uiVersion": 14, "xp": 10, "remediationCycles": [{"quizBestScore": 101}]},
            )

        with self.assertRaisesRegex(ValueError, "remediationCycles.questionIds must contain strings of at most 40 characters"):
            self.store.save(
                "local",
                {
                    "uiVersion": 14,
                    "xp": 10,
                    "remediationCycles": [{"id": "cycle-1", "baselineRunId": "run-1", "scenarioId": "green-socket", "questionIds": [7]}],
                },
            )

        with self.assertRaisesRegex(ValueError, "completed remediationCycles must reference a retestRunId"):
            self.store.save(
                "local",
                {
                    "uiVersion": 14,
                    "xp": 10,
                    "remediationCycles": [{"id": "cycle-1", "baselineRunId": "run-1", "scenarioId": "green-socket", "status": "verified", "verified": True}],
                },
            )

        with self.assertRaisesRegex(ValueError, "remediationCycles.verified must match verified status"):
            self.store.save(
                "local",
                {
                    "uiVersion": 14,
                    "xp": 10,
                    "remediationCycles": [{"id": "cycle-1", "baselineRunId": "run-1", "scenarioId": "green-socket", "status": "repairing", "verified": True}],
                },
            )

        with self.assertRaisesRegex(ValueError, "quiz.remediationCycleId must be a string of at most 100 characters or null"):
            self.store.save(
                "local",
                {
                    "uiVersion": 14,
                    "xp": 10,
                    "quiz": {"remediationCycleId": "x" * 101},
                },
            )

        state = {
            "uiVersion": 14,
            "xp": 260,
            "selectedIncidentRun": "run-2",
            "scenarioHistory": [
                {"id": "run-1", "scenarioId": "green-socket", "composite": 68},
                {
                    "id": "run-2",
                    "scenarioId": "green-socket",
                    "composite": 82,
                    "remediationCycleId": "cycle-1",
                },
            ],
            "remediationCycles": [
                {
                    "id": "cycle-1",
                    "baselineRunId": "run-1",
                    "retestRunId": "run-2",
                    "scenarioId": "green-socket",
                    "createdAt": "2026-07-14T20:00:00+00:00",
                    "completedAt": "2026-07-14T21:00:00+00:00",
                    "status": "verified",
                    "targetComponent": "evidence",
                    "baselineComposite": 68,
                    "baselineTargetScore": 54,
                    "questionIds": ["q01", "q02"],
                    "quizAttempts": 1,
                    "quizScore": 88,
                    "quizBestScore": 88,
                    "retestComposite": 82,
                    "retestTargetScore": 77,
                    "compositeDelta": 14,
                    "targetDelta": 23,
                    "verified": True,
                }
            ],
        }
        saved = self.store.save("local", state)
        self.assertEqual(saved["state"]["remediationCycles"][0]["status"], "verified")
        self.assertEqual(saved["state"]["scenarioHistory"][1]["remediationCycleId"], "cycle-1")

    def test_interview_studio_validation_and_round_trip(self):
        answer = (
            "My background is not generic support because I work close to market data production systems and observability. "
            "I have investigated telemetry, incidents, capacity, and publishing paths while owning evidence based production decisions. "
            "That experience transfers directly into trading operations checks, monitoring, escalation, audit records, and reliable trading systems. "
            "I want this role because HFT makes market reliability and operational control immediately consequential."
        )
        words = len(answer.split())
        self.assertGreaterEqual(words, 60)
        criteria = [
            {"id": "identity", "label": "Production identity", "score": 15, "met": True},
            {"id": "transfer", "label": "Role transfer", "score": 15, "met": True},
            {"id": "proof", "label": "Evidence of ownership", "score": 15, "met": True},
            {"id": "role", "label": "Role fit", "score": 15, "met": True},
            {"id": "motivation", "label": "Credible motivation", "score": 15, "met": True},
            {"id": "specific", "label": "Anchor statement", "score": 15, "met": True},
        ]
        run = {
            "id": "coach-run-1",
            "promptId": "coach-intro",
            "at": "2026-07-15T10:00:00.000Z",
            "category": "positioning",
            "difficulty": "core",
            "branch": "interview",
            "answer": answer,
            "wordCount": words,
            "estimatedSeconds": int(words / 130 * 60 + 0.5),
            "deliveryScore": 10,
            "criteria": criteria,
            "score": 100,
            "passed": True,
            "missing": [],
        }
        state = {
            "uiVersion": 17,
            "xp": 40,
            "selectedCoachPrompt": "coach-intro",
            "coachCategory": "all",
            "coachDifficulty": "all",
            "coachDrafts": {"coach-intro": {"text": answer, "updatedAt": "2026-07-15T10:00:00.000Z"}},
            "coachHistory": [run],
            "selectedCoachRun": "coach-run-1",
            "timerSeconds": 60,
            "timerRunning": False,
        }

        saved = self.store.save("local", state)
        self.assertEqual(saved["state"]["coachHistory"][0]["score"], 100)
        self.assertEqual(saved["state"]["selectedCoachRun"], "coach-run-1")
        self.assertEqual(saved["state"]["coachDrafts"]["coach-intro"]["text"], answer)

        forged = json.loads(json.dumps(state))
        forged["coachHistory"][0]["criteria"][0]["label"] = "Made-up evidence"
        with self.assertRaisesRegex(ValueError, "label must match the prompt rubric"):
            self.store.save("forged-label", forged)

        forged_score = json.loads(json.dumps(state))
        forged_score["coachHistory"][0]["score"] = 99
        with self.assertRaisesRegex(ValueError, "score must equal the rubric and delivery total"):
            self.store.save("forged-score", forged_score)

        bad_draft = json.loads(json.dumps(state))
        bad_draft["coachDrafts"]["coach-intro"]["text"] = "x" * 2401
        with self.assertRaisesRegex(ValueError, "text must be a string of at most 2400 characters"):
            self.store.save("bad-draft", bad_draft)

        dangling = json.loads(json.dumps(state))
        dangling["selectedCoachRun"] = "missing-run"
        with self.assertRaisesRegex(ValueError, "selectedCoachRun must reference a completed rehearsal"):
            self.store.save("dangling-run", dangling)

    def test_transfer_review_validation_and_round_trip(self):
        base_review = {
            "id": "retention-cycle-1-1",
            "cycleId": "cycle-1",
            "scenarioId": "green-socket",
            "referenceRunId": "run-2",
            "createdAt": "2026-07-14T21:00:00+00:00",
            "dueDate": "2026-07-15",
            "stage": 1,
            "intervalDays": 1,
            "status": "scheduled",
            "targetComponent": "evidence",
            "referenceComposite": 82,
            "referenceTargetScore": 77,
            "compositeFloor": 77,
            "targetFloor": 72,
            "passed": False,
        }
        verified_cycle = {
            "id": "cycle-1",
            "baselineRunId": "run-1",
            "retestRunId": "run-2",
            "scenarioId": "green-socket",
            "status": "verified",
            "targetComponent": "evidence",
            "verified": True,
        }

        with self.assertRaisesRegex(ValueError, "transferReviews must be an array"):
            self.store.save("local", {"uiVersion": 15, "xp": 10, "transferReviews": {}})

        with self.assertRaisesRegex(ValueError, "transferReviews may contain at most 200 entries"):
            self.store.save(
                "local",
                {"uiVersion": 15, "xp": 10, "transferReviews": [{} for _ in range(201)]},
            )

        for field, value, message in (
            ("status", "lucky", "transferReviews.status is invalid"),
            ("stage", 5, "transferReviews.stage must be an integer between 1 and 4"),
            ("intervalDays", 3, "transferReviews.intervalDays is invalid"),
            ("dueDate", "tomorrow", "transferReviews.dueDate must be a YYYY-MM-DD string"),
            ("compositeFloor", 101, "transferReviews.compositeFloor must be a number between 0 and 100 or null"),
        ):
            invalid = {**base_review, field: value}
            with self.assertRaisesRegex(ValueError, message):
                self.store.save(
                    "local",
                    {"uiVersion": 15, "xp": 10, "remediationCycles": [verified_cycle], "transferReviews": [invalid]},
                )

        with self.assertRaisesRegex(ValueError, "transferReviews.intervalDays must match the review stage"):
            self.store.save(
                "local",
                {
                    "uiVersion": 15,
                    "xp": 10,
                    "remediationCycles": [verified_cycle],
                    "transferReviews": [{**base_review, "stage": 2, "intervalDays": 1}],
                },
            )

        with self.assertRaisesRegex(ValueError, "completed transferReviews must reference a runId"):
            self.store.save(
                "local",
                {
                    "uiVersion": 15,
                    "xp": 10,
                    "remediationCycles": [verified_cycle],
                    "transferReviews": [{**base_review, "status": "passed", "passed": True}],
                },
            )

        with self.assertRaisesRegex(ValueError, "transferReviews must reference an existing remediation cycle"):
            self.store.save(
                "local",
                {"uiVersion": 15, "xp": 10, "remediationCycles": [], "transferReviews": [base_review]},
            )

        with self.assertRaisesRegex(ValueError, "activeTransferReviewId must reference an armed transfer review"):
            self.store.save(
                "local",
                {
                    "uiVersion": 15,
                    "xp": 10,
                    "remediationCycles": [verified_cycle],
                    "transferReviews": [base_review],
                    "activeTransferReviewId": base_review["id"],
                },
            )

        state = {
            "uiVersion": 15,
            "xp": 420,
            "scenarioHistory": [
                {"id": "run-1", "scenarioId": "green-socket", "composite": 68},
                {"id": "run-2", "scenarioId": "green-socket", "composite": 82, "remediationCycleId": "cycle-1", "transferKind": "immediate"},
                {"id": "run-3", "scenarioId": "green-socket", "composite": 84, "remediationCycleId": "cycle-1", "transferReviewId": base_review["id"], "transferKind": "retention"},
            ],
            "remediationCycles": [verified_cycle],
            "transferReviews": [
                {
                    **base_review,
                    "status": "passed",
                    "runId": "run-3",
                    "completedAt": "2026-07-15T21:00:00+00:00",
                    "composite": 84,
                    "targetScore": 80,
                    "compositeDelta": 2,
                    "targetDelta": 3,
                    "passed": True,
                },
                {
                    **base_review,
                    "id": "retention-cycle-1-2",
                    "referenceRunId": "run-3",
                    "createdAt": "2026-07-15T21:00:01+00:00",
                    "dueDate": "2026-07-22",
                    "stage": 2,
                    "intervalDays": 7,
                    "status": "armed",
                    "armedAt": "2026-07-22T20:00:00+00:00",
                    "referenceComposite": 84,
                    "referenceTargetScore": 80,
                    "compositeFloor": 79,
                    "targetFloor": 75,
                },
            ],
            "activeTransferReviewId": "retention-cycle-1-2",
        }
        saved = self.store.save("local", state)
        self.assertEqual(saved["state"]["transferReviews"][0]["status"], "passed")
        self.assertEqual(saved["state"]["transferReviews"][1]["status"], "armed")
        self.assertEqual(saved["state"]["activeTransferReviewId"], "retention-cycle-1-2")
        self.assertEqual(saved["state"]["scenarioHistory"][2]["transferKind"], "retention")

    def test_shift_state_validation_and_round_trip(self):
        phases = ("preopen", "open", "live", "close")

        def result(phase, score=100):
            if score == 100:
                decision, evidence, record_score = 40, 30, 30
            else:
                decision, evidence, record_score = score, 0, 0
            return {
                "phaseId": phase,
                "score": score,
                "decision": decision,
                "evidence": evidence,
                "recordScore": record_score,
                "choice": 1,
                "selectedEvidence": [0, 1],
                "record": "08:00 UTC scope signal control owner and next update are recorded.",
                "missing": [],
                "criticalHeld": score < 70,
                "evaluatedAt": "2026-07-14T08:00:00+00:00",
            }

        answers = {
            phase: {
                "choice": 1,
                "evidence": [0, 1],
                "record": "08:00 UTC scope signal control owner and next update are recorded.",
            }
            for phase in phases
        }
        results = {phase: result(phase) for phase in phases}
        completed = {
            "id": "shift-run-1",
            "templateId": "eu-open-control",
            "status": "complete",
            "startedAt": "2026-07-14T07:30:00+00:00",
            "updatedAt": "2026-07-14T16:15:00+00:00",
            "completedAt": "2026-07-14T16:15:00+00:00",
            "answers": answers,
            "results": results,
            "score": 100,
            "passed": True,
            "criticalHeld": False,
            "weakestPhase": "preopen",
        }
        active = {
            "id": "shift-run-2",
            "templateId": "resilience-day",
            "status": "active",
            "startedAt": "2026-07-15T07:30:00+00:00",
            "updatedAt": "2026-07-15T08:02:00+00:00",
            "stage": 1,
            "answers": {"preopen": answers["preopen"], "open": {"choice": None, "evidence": [], "record": ""}},
            "results": {"preopen": result("preopen")},
        }

        with self.assertRaisesRegex(ValueError, "shiftHistory must be an array"):
            self.store.save("local", {"uiVersion": 16, "xp": 10, "shiftHistory": {}})

        with self.assertRaisesRegex(ValueError, "activeShift.stage must be an integer between 0 and 3"):
            self.store.save("local", {"uiVersion": 16, "xp": 10, "activeShift": {**active, "stage": 4}})

        with self.assertRaisesRegex(ValueError, r"shiftHistory\[0\]\.results must contain all four phases"):
            self.store.save(
                "local",
                {"uiVersion": 16, "xp": 10, "shiftHistory": [{**completed, "results": {"preopen": results["preopen"]}}]},
            )

        broken_result = {**results["preopen"], "score": 99}
        with self.assertRaisesRegex(ValueError, r"shiftHistory\[0\]\.results\.preopen\.score must equal its component total"):
            self.store.save(
                "local",
                {"uiVersion": 16, "xp": 10, "shiftHistory": [{**completed, "results": {**results, "preopen": broken_result}}]},
            )

        with self.assertRaisesRegex(ValueError, "selectedShiftRun must reference a completed shift"):
            self.store.save("local", {"uiVersion": 16, "xp": 10, "shiftHistory": [completed], "selectedShiftRun": "missing"})

        with self.assertRaisesRegex(ValueError, r"shiftHistory\[0\]\.passed must match the shift gate"):
            self.store.save("local", {"uiVersion": 16, "xp": 10, "shiftHistory": [{**completed, "passed": False}]})

        saved = self.store.save(
            "local",
            {
                "uiVersion": 16,
                "xp": 500,
                "activeShift": active,
                "shiftHistory": [completed],
                "selectedShiftRun": "shift-run-1",
            },
        )
        self.assertEqual(saved["state"]["activeShift"]["stage"], 1)
        self.assertEqual(saved["state"]["shiftHistory"][0]["score"], 100)
        self.assertEqual(saved["state"]["selectedShiftRun"], "shift-run-1")

    def test_triage_state_validation_and_round_trip(self):
        completed = {
            "id": "triage-stale-route-run-1",
            "templateId": "triage-stale-route",
            "seed": 42017,
            "status": "complete",
            "startedAt": "2026-07-15T18:00:00.000Z",
            "completedAt": "2026-07-15T18:04:00.000Z",
            "score": 100,
            "passed": True,
            "criticalHeld": False,
            "expectedSeverity": "sev2",
            "expectedScope": "consumer-route",
            "severity": "sev2",
            "scope": "consumer-route",
            "control": "protect-route",
            "selectedEvidence": [0, 1, 2, 3, 4],
            "dispatch": "18:03 strategy route is stale, trading remains guarded, owner is rebuilding, next update in five minutes.",
            "missing": [],
            "weakestDimension": "severity",
            "severityScore": 15,
            "scopeScore": 15,
            "controlScore": 30,
            "evidenceScore": 25,
            "dispatchScore": 15,
        }
        active = {
            "id": "triage-sequence-run-2",
            "templateId": "triage-sequence-divergence",
            "seed": 77123,
            "status": "active",
            "startedAt": "2026-07-15T18:05:00.000Z",
            "updatedAt": "2026-07-15T18:06:00.000Z",
            "answers": {
                "severity": "sev2",
                "scope": "",
                "control": "",
                "evidence": [0, 1],
                "dispatch": "",
            },
        }
        valid = {
            "uiVersion": 21,
            "xp": 500,
            "triageHistory": [completed],
            "activeTriage": active,
            "selectedTriageRun": "triage-stale-route-run-1",
            "triageBranch": "feed",
        }
        saved = self.store.save("triage-valid", valid)
        self.assertEqual(saved["state"]["triageHistory"][0]["score"], 100)
        self.assertEqual(saved["state"]["activeTriage"]["answers"]["evidence"], [0, 1])

        mutations = [
            ("score", lambda state: state["triageHistory"][0].__setitem__("score", 99), "score must equal its component total"),
            ("pass", lambda state: state["triageHistory"][0].__setitem__("passed", False), "passed must match the 75 percent critical gate"),
            ("control", lambda state: state["triageHistory"][0].__setitem__("control", "watch"), "controlScore does not match"),
            ("expected", lambda state: state["triageHistory"][0].__setitem__("expectedScope", "venue"), "expected classification does not match"),
            ("evidence", lambda state: state["triageHistory"][0].__setitem__("selectedEvidence", [0, 0]), "must not contain duplicate indexes"),
            ("time", lambda state: state["activeTriage"].__setitem__("updatedAt", "2026-07-15T17:59:00.000Z"), "ordered timezone-aware timestamps"),
            ("selection", lambda state: state.__setitem__("selectedTriageRun", "missing"), "must reference a completed triage run"),
            ("branch", lambda state: state.__setitem__("triageBranch", "mystery"), "triageBranch is invalid"),
        ]
        for index, (name, mutate, message) in enumerate(mutations):
            forged = json.loads(json.dumps(valid))
            mutate(forged)
            with self.subTest(name=name):
                with self.assertRaisesRegex(ValueError, message):
                    self.store.save(f"triage-invalid-{index}", forged)

    def test_schema_version_is_initialized(self):
        self.assertEqual(self.store.schema_version(), 2)

    def test_diagnostics_reports_database_integrity(self):
        diagnostics = self.store.diagnostics()
        self.assertEqual(diagnostics["status"], "ok")
        self.assertEqual(diagnostics["integrity"], "ok")
        self.assertEqual(diagnostics["schema_version"], 2)
        self.assertEqual(diagnostics["journal_mode"], "wal")

    def test_keep_alive_requests_reset_request_scoped_metadata(self):
        AppHandler.router = ApiRouter(self.store)
        AppHandler.static_root = Path(self.temp_dir.name)
        httpd = ProductionLikeHTTPServer(("127.0.0.1", 0), AppHandler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection("127.0.0.1", httpd.server_port, timeout=3)
        try:
            connection.request("GET", "/api/health/live")
            first = connection.getresponse()
            first.read()
            first_id = first.getheader("X-Request-ID")
            time.sleep(0.02)

            connection.request("GET", "/api/health/live")
            second = connection.getresponse()
            second.read()
            second_id = second.getheader("X-Request-ID")
            second_timing = second.getheader("Server-Timing")

            self.assertNotEqual(first_id, second_id)
            self.assertRegex(second_timing, r"^app;dur=\d+\.\d{2}$")
            self.assertLess(float(second_timing.split("=")[1]), 1000)
        finally:
            connection.close()
            httpd.shutdown()
            thread.join(timeout=3)
            httpd.server_close()

    def test_concurrent_writers_cannot_lose_an_update(self):
        first = self.store.save("local", {"uiVersion": 9, "xp": 1})
        barrier = threading.Barrier(3)
        saved_revisions = []
        conflicts = []

        def writer(xp):
            barrier.wait()
            try:
                saved = self.store.save(
                    "local",
                    {"uiVersion": 9, "xp": xp},
                    expected_revision=first["revision"],
                )
                saved_revisions.append(saved["revision"])
            except RevisionConflict as exc:
                conflicts.append(exc.revision)

        threads = [threading.Thread(target=writer, args=(xp,)) for xp in (2, 3)]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=5)

        self.assertEqual(saved_revisions, [2])
        self.assertEqual(conflicts, [2])
        self.assertIn(self.store.load("local")["state"]["xp"], (2, 3))

    def test_state_etag_revalidation_and_if_match(self):
        router = ApiRouter(self.store)
        empty = router.handle("GET", "/api/state?profile=local")
        self.assertEqual(empty.status, 200)
        self.assertEqual(empty.headers["ETag"], state_etag("local", 0))

        not_modified = router.handle(
            "GET",
            "/api/state?profile=local",
            {"If-None-Match": empty.headers["ETag"]},
        )
        self.assertEqual(not_modified.status, 304)
        self.assertEqual(not_modified.body, b"")

        payload = json.dumps(
            {"profile": "local", "revision": 0, "state": {"uiVersion": 9, "xp": 10}}
        ).encode()
        saved = router.handle(
            "PUT",
            "/api/state",
            {"Content-Type": "application/json", "If-Match": state_etag("local", 0)},
            payload,
        )
        self.assertEqual(saved.status, 200)
        self.assertEqual(saved.headers["ETag"], state_etag("local", 1))

        stale = router.handle(
            "PUT",
            "/api/state",
            {"Content-Type": "application/json", "If-Match": state_etag("local", 0)},
            payload,
        )
        self.assertEqual(stale.status, 409)
        self.assertEqual(stale.headers["ETag"], state_etag("local", 1))

    def test_cross_origin_write_is_rejected(self):
        router = ApiRouter(self.store)
        response = router.handle(
            "PUT",
            "/api/state",
            {
                "Content-Type": "application/json",
                "Host": "training.example",
                "Origin": "https://attacker.example",
            },
            json.dumps({"profile": "local", "revision": 0, "state": {"xp": 1}}).encode(),
        )
        self.assertEqual(response.status, 403)

    def test_same_origin_write_with_port_is_allowed(self):
        router = ApiRouter(self.store)
        response = router.handle(
            "PUT",
            "/api/state",
            {
                "Content-Type": "application/json",
                "Host": "127.0.0.1:8768",
                "Origin": "http://127.0.0.1:8768",
            },
            json.dumps({"profile": "local", "revision": 0, "state": {"xp": 1}}).encode(),
        )
        self.assertEqual(response.status, 200)

    def test_wsgi_response_has_request_id_and_security_headers(self):
        server._wsgi_router = ApiRouter(self.store)
        captured = {}

        def start_response(status, headers):
            captured["status"] = status
            captured["headers"] = dict(headers)

        body = b"".join(
            wsgi_application(
                {
                    "REQUEST_METHOD": "GET",
                    "PATH_INFO": "/api/health/ready",
                    "QUERY_STRING": "",
                    "CONTENT_LENGTH": "0",
                    "wsgi.input": io.BytesIO(),
                    "REMOTE_ADDR": "127.0.0.1",
                    "HTTP_X_REQUEST_ID": "test-request-1",
                },
                start_response,
            )
        )

        self.assertTrue(captured["status"].startswith("200"))
        self.assertEqual(captured["headers"]["X-Request-ID"], "test-request-1")
        self.assertEqual(captured["headers"]["X-Content-Type-Options"], "nosniff")
        self.assertEqual(json.loads(body)["status"], "ok")

    def test_verified_backup_round_trip(self):
        self.store.save("local", {"uiVersion": 9, "xp": 77})
        destination = Path(self.temp_dir.name) / "backups" / "progress.db"
        self.store.backup(destination)
        restored = ProgressStore(destination)
        self.assertEqual(restored.load("local")["state"]["xp"], 77)


if __name__ == "__main__":
    unittest.main()
