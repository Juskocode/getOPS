import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../frontend/source.fragment.html', import.meta.url);
const source = await readFile(sourceUrl, 'utf8');
const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);

test('inline application script parses', () => {
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]));
});

test('question elimination does not reveal until resolution', () => {
  const start = source.indexOf('function answerQuestion(selectedIndex)');
  const end = source.indexOf('function gradeQuestionConfidence', start);
  const answerQuestion = source.slice(start, end);

  assert.match(answerQuestion, /wrongChoices\.push\(selectedIndex\)/);
  assert.match(answerQuestion, /if \(remaining\.length === 1\)/);
  assert.match(answerQuestion, /state\.quiz\.resolution = 'eliminated'/);
  assert.match(answerQuestion, /state\.quiz\.resolution = recovered \? 'recovered' : 'correct'/);
  assert.match(source, /state\.quiz\.answered \? renderAnswerInsight\(q,playbook,stats\) : ''/);
});

test('quiz state tracks clean, recovered, and eliminated outcomes', () => {
  assert.match(source, /score: 0, recovered: 0, mistakes: 0/);
  assert.match(source, /wrongChoices: \[\], lastEliminated: null, resolution: null/);
  assert.match(source, /outcomes: questions\.map\(\(\) => 'pending'\)/);
  assert.match(source, /calibrations: questions\.map\(\(\) => 'pending'\)/);
  assert.match(source, /setQuizOutcome\(recovered \? 'recovered' : 'clean'\)/);
  assert.match(source, /setQuizCalibration\(calibration\.outcome\)/);
  assert.match(source, /\(state\.quiz\.score \+ \(state\.quiz\.recovered \|\| 0\) \* 0\.5\)/);
  assert.match(source, /const STORAGE_KEY = 'eqvilent-trading-ops-ascent-v22'/);
  assert.match(source, /const LEGACY_STORAGE_KEYS = \['eqvilent-trading-ops-ascent-v21'/);
});

test('question mastery requires distinct-day evidence and durable retention', () => {
  assert.match(source, /const MASTERY_THRESHOLD = 3/);
  assert.match(source, /const DURABLE_MASTERY = 5/);
  assert.match(source, /const DURABLE_RETENTION_PASSES = 2/);
  assert.match(source, /function recordQuestionMastery\(stats, resolution, wasDue = false\)/);
  assert.match(source, /if \(stats\.lastMasteryDate !== today\)/);
  assert.match(source, /const hasEvidenceSchema = candidate && Number\(candidate\.uiVersion\) >= 18/);
  assert.match(source, /if \(!hasEvidenceSchema\) raw\.mastery = Math\.min\(raw\.mastery, raw\.masteryDates\.length \? 1 : 0\)/);
  assert.match(source, /stats\.mastery = current > 0 \? current : 1/);
  assert.match(source, /if \(wasDue && hadPriorEvidence\) stats\.retentionPasses \+= 1/);
  assert.match(source, /const evidenceAdvanced = boundedQuestionMastery\(stats\) > masteryBefore/);
  assert.match(source, /recovered \|\| evidenceAdvanced/);
  assert.match(source, /function questionIsMastered\(stats = \{\}\)/);
  assert.match(source, /function questionIsDurable\(stats = \{\}\)/);

  const gradeStart = source.indexOf('function gradeQuestionConfidence(grade)');
  const gradeEnd = source.indexOf('function recordRemediationQuiz', gradeStart);
  assert.doesNotMatch(source.slice(gradeStart, gradeEnd), /stats\.mastery\s*=/);
});

test('practice runs retain exact evidence and close into replay and repair', () => {
  assert.match(source, /const PRACTICE_HISTORY_LIMIT = 100/);
  assert.match(source, /function normalizePracticeRun\(entry, index = 0\)/);
  assert.match(source, /questionIds: \[\.\.\.state\.quiz\.ids\]/);
  assert.match(source, /evidenceBefore: \{ \.\.\.\(state\.quiz\.evidenceBefore \|\| \{\}\) \}/);
  assert.match(source, /evidenceAfter: Object\.fromEntries\(state\.quiz\.ids\.map/);
  assert.match(source, /repairQuestionIds/);
  assert.match(source, /replayOfRunId/);
  assert.match(source, /repairOfRunId/);
  assert.match(source, /function renderPracticeAudit\(\)/);
  assert.match(source, /data-action="practice-run-replay"/);
  assert.match(source, /data-action="practice-run-repair"/);
  assert.match(source, /makeQuiz\('run-replay', \[\.\.\.run\.questionIds\], 'audit'/);
  assert.match(source, /makeQuiz\('run-repair', \[\.\.\.repairIds\], 'audit'/);
  const replayAction = source.slice(
    source.indexOf("if (action === 'practice-run-replay')"),
    source.indexOf("if (action === 'practice-run-repair')")
  );
  assert.doesNotMatch(replayAction, /repairOfRunId/);
  assert.match(source, /const lineage = mode === 'run-repair'/);
  assert.match(source, /function renderPracticeEvidencePulse\(\)/);
  assert.match(source, /origin === 'audit'/);
  assert.match(source, /Linked follow-up runs/);
  assert.match(source, /const substantialRun = state\.quiz\.ids\.length >= 5/);
  assert.match(source, /const closedRepair = state\.quiz\.mode === 'run-repair'/);
  assert.match(source, /practice-repair-bonus:/);
});

test('adaptive shift plans are bounded, persisted, and evidence-driven', () => {
  assert.match(source, /const TRAINING_PLAN_LIMIT = 30/);
  assert.match(source, /uiVersion: 22/);
  assert.match(source, /planMinutes: 60, planIntensity: 'balanced', trainingPlans: \[\], activeTrainingPlanId: ''/);
  assert.match(source, /function normalizeTrainingPlan\(entry, index = 0\)/);
  assert.match(source, /function trainingPlanEvidenceValue\(item\)/);
  assert.match(source, /item\.type === 'checkpoint'/);
  assert.match(source, /function syncTrainingPlans\(\)/);
  assert.match(source, /function generateTrainingPlan\(minutes = state\.planMinutes, intensity = state\.planIntensity\)/);
  assert.match(source, /function renderTrainingPlan\(\)/);
  assert.match(source, /data-action="training-plan-generate"/);
  assert.match(source, /data-action="training-plan-launch"/);
  assert.match(source, /data-action="training-plan-skip"/);
  assert.match(source, /run\.mode === 'run-repair' && run\.repairOfRunId === item\.targetId && run\.score === 100/);
  assert.match(source, /run\.scenarioId === item\.targetId && run\.composite >= 75/);
  assert.match(source, /run\.promptId === item\.targetId && run\.passed/);
  assert.match(source, /run\.templateId === item\.targetId && run\.passed/);
  assert.match(source, /item\.type === 'triage'/);
  assert.match(source, /add\('triage', triageTemplate\.id/);
  assert.match(source, /makeQuiz\(item\.type, null, 'plan'\)/);
  assert.match(source, /makeQuiz\('checkpoint', null, 'plan'\)/);
  assert.match(source, /origin === 'plan'/);
  assert.doesNotMatch(source, /function dailyPlan\(/);

  const plannerStart = source.indexOf('function syncTrainingPlans()');
  const plannerEnd = source.indexOf('function trainingPlanEvidenceLabel', plannerStart);
  const plannerEvidenceFlow = source.slice(plannerStart, plannerEnd);
  assert.doesNotMatch(plannerEvidenceFlow, /award\(/);
  assert.doesNotMatch(plannerEvidenceFlow, /state\.xp\s*[+]=/);
});

test('readiness is inspectable, evidence weighted, and wired to corrective actions', () => {
  assert.match(source, /function readinessBreakdown\(\)/);
  assert.match(source, /function renderReadinessConsole\(\)/);
  assert.match(source, /Evidence weighted, not activity weighted/);
  assert.match(source, /data-action="readiness-action"/);
  assert.match(source, /const attemptWeight = Math\.min\(1, questionAttempts\(\) \/ 50\)/);
  assert.match(source, /Durability gap targeted/);
  assert.match(source, /const latestEvidence = bEvidenceAt >= aEvidenceAt \? b : a/);
});

test('interview studio provides a persistent adaptive 24-prompt rehearsal path', () => {
  assert.equal([...source.matchAll(/coachPrompt\('coach-[^']+'/g)].length, 24);
  assert.match(source, /selectedCoachPrompt: 'coach-intro', coachCategory: 'all', coachDifficulty: 'all', coachDrafts: \{\}, coachHistory: \[\], selectedCoachRun: ''/);
  assert.match(source, /function adaptiveCoachPrompt\(excludeId = state\.selectedCoachPrompt\)/);
  assert.match(source, /function captureCoachDraft\(\)/);
  assert.match(source, /function scoreCoachResponse\(prompt, answer\)/);
  const coachInputStart = source.indexOf("if (event.target.id === 'ops-coach-answer')");
  const coachInputEnd = source.indexOf("});", coachInputStart);
  assert.match(source.slice(coachInputStart, coachInputEnd), /saveState\(\)/);
  assert.match(source, /state\.coachHistory = state\.coachHistory\.slice\(-100\)/);
  assert.match(source, /coachPromptIds\.has\(requestedCoachPrompt\) \? requestedCoachPrompt : coachPromptBank\[legacyCoachIndex\]\.id/);
  assert.match(source, /Number\(candidate && typeof candidate === 'object' \? candidate\.timerSeconds : NaN\)/);
  assert.match(source, /selectedRun \? renderCoachReview\(selectedRun\) :/);
  assert.match(source, /<h3>Model answer<\/h3>/);
  assert.match(source, /merged\.coachDrafts = coachDrafts/);
  assert.match(source, /merged\.coachHistory = \[\.\.\.coachRuns\.values\(\)\]/);
});

test('interview evidence closes into profile, today, and a question repair queue', () => {
  assert.match(source, /function coachRemediationPlan\(run\)/);
  assert.match(source, /makeQuiz\('coach', plan\.ids, 'coach', plan\.reasons\)/);
  assert.match(source, /coach: \{ name: 'Interview Repair Queue'/);
  assert.match(source, /origin === 'coach'/);
  assert.match(source, /function renderCoachPulse\(\)/);
  assert.match(source, /function renderCoachEvidenceCenter\(\)/);
  assert.match(source, /\$\{renderCoachPulse\(\)\}/);
  assert.match(source, /\$\{renderCoachEvidenceCenter\(\)\}/);
});

test('shift desk persists a complete trading day with explicit phase gates', () => {
  assert.match(source, /const shiftTemplates = \[/);
  assert.match(source, /activeShift: null, shiftHistory: \[\], selectedShiftRun: ''/);
  assert.match(source, /function captureShiftDraft\(\)/);
  assert.match(source, /function evaluateShiftPhase\(\)/);
  assert.match(source, /function advanceShiftPhase\(\)/);
  assert.match(source, /function completeShiftRun\(\)/);
  assert.match(source, /score >= 80 && !criticalHeld/);
  assert.match(source, /phase\.critical && active\.results\[phase\.id\]\.score < 70/);
  assert.match(source, /data-action="shift-evaluate"/);
  assert.match(source, /active\.stage === template\.phases\.length - 1 \? 'shift-complete' : 'shift-next'/);
  assert.match(source, /merged\.shiftHistory = \[\.\.\.shiftRuns\.values\(\)\]/);
});

test('shift evidence generates a weakest-phase repair queue and profile trail', () => {
  assert.match(source, /function shiftRemediationPlan\(run\)/);
  assert.match(source, /remediationBranches/);
  assert.match(source, /makeQuiz\('shift', plan\.ids, 'shift', plan\.reasons\)/);
  assert.match(source, /shift: \{ name: 'Shift Repair Queue'/);
  assert.match(source, /origin === 'shift'/);
  assert.match(source, /function renderShiftEvidenceCenter\(\)/);
  assert.match(source, /\$\{renderShiftEvidenceCenter\(\)\}/);
  assert.match(source, /function renderShiftPulse\(\)/);
  assert.match(source, /data-action="open-shift-evidence"/);
});

test('sound palette covers every quiz reward state', () => {
  for (const cue of ['select', 'queue', 'eliminate', 'error', 'success', 'recovery', 'reveal', 'combo', 'reward', 'rank']) {
    assert.equal(source.includes(`${cue}: () =>`), true, `missing ${cue} cue`);
  }
  assert.match(source, /const SOUND_PACKS = \{/);
  assert.match(source, /soundVolume: 72, soundPack: 'charged'/);
  assert.match(source, /preview: \(\) =>/);
});

test('adaptive command queue is inspectable and avoids recent repeats', () => {
  assert.match(source, /adaptive: \{ name: 'Command Queue'/);
  assert.match(source, /function adaptiveQuestionPriority\(question, context\)/);
  assert.match(source, /score -= recentRank < 10 \? 130/);
  assert.match(source, /const selectionReasons = explicitReasons/);
  assert.match(source, /adaptiveQuestionReason\(question, adaptiveContext\)/);
});

test('expanded bank and evidence debrief remain wired into the quiz', () => {
  assert.match(source, /\['q500','interview','advanced'/);
  assert.match(source, /const branchEvidenceMatrix = \{/);
  assert.match(source, /function renderQuizDebrief\(\)/);
  assert.match(source, /\$\{renderRunTrail\(\)\}/);
});

test('telemetry triage is deterministic, gated, persisted, and closes into repair', () => {
  assert.equal([...source.matchAll(/id: 'triage-[^']+'/g)].length, 7);
  assert.match(source, /const TRIAGE_HISTORY_LIMIT = 100/);
  assert.match(source, /const TRIAGE_REPAIR_QUESTIONS = \{/);
  assert.match(source, /severity: Array\.from\(\{ length: 10 \}/);
  assert.match(source, /function triageCase\(templateId, seed\)/);
  assert.match(source, /function adaptiveTriageTemplate\(excludeId = ''\)/);
  assert.match(source, /const weakest = dimensions\.reduce\(\(current, dimension\) => dimension\.pct < current\.pct \? dimension : current/);
  assert.match(source, /function captureTriageDraft\(\)/);
  assert.match(source, /function evaluateTriageCase\(\)/);
  assert.match(source, /score >= 75 && !criticalHeld/);
  assert.match(source, /scores\.severityScore < 15 \|\| scores\.controlScore < 30/);
  assert.match(source, /state\.triageHistory = \[\.\.\.state\.triageHistory, run\]\.slice\(-TRIAGE_HISTORY_LIMIT\)/);
  assert.match(source, /function renderTriageArena\(\)/);
  assert.match(source, /function focusTriageConsole\(particles = 18\)/);
  assert.match(source, /target\?\.scrollIntoView\(\{ behavior: reducedMotion \? 'auto' : 'smooth', block: 'start' \}\)/);
  assert.match(source, /\.ops-event-log > div \{ display:grid; grid-template-columns:58px 84px minmax\(0,1fr\)/);
  assert.match(source, /renderTimeline\(\{ label: generated\.label, lanes: generated\.lanes \}\)/);
  assert.doesNotMatch(source, /renderTelemetryChart/);
  assert.match(source, /data-action="triage-evaluate"/);
  assert.match(source, /event\.target\.id === 'ops-triage-dispatch'\) \{ captureTriageDraft\(\); saveState\(\); \}/);
  assert.match(source, /makeQuiz\('triage', plan\.ids, 'triage', plan\.reasons\)/);
  assert.match(source, /const PRACTICE_RUN_ORIGINS = new Set\(\['bank','path','incident','triage','shift','coach','audit','plan'\]\)/);
  assert.match(source, /function quizPurposeLabel\(question, selectionReason = ''\)/);
  assert.match(source, /`\$\{label\} repair from \$\{sourceLabel\}`/);
  assert.match(source, /triage: \{ name: 'Triage Repair Queue'/);
  assert.match(source, /origin === 'triage'/);
  assert.match(source, /\$\{renderTriagePulse\(\)\}/);
  assert.match(source, /\$\{renderTriageEvidenceCenter\(\)\}/);
  assert.match(source, /Array\.isArray\(source\.selectedEvidence\)/);
});

test('progress backup follows the active persistence profile', () => {
  assert.match(source, /persistence\.exportUrl \|\| '\/api\/export\?profile=local'/);
  assert.doesNotMatch(source, /\/api\/export\?profile=operator/);
});

test('incident lab has deterministic playback and a gated command window', () => {
  assert.match(source, /function startScenarioPlayback\(\)/);
  assert.match(source, /function advanceScenario\(scenario, direction = 1, cue = true\)/);
  assert.match(source, /data-action="scenario-playback"/);
  assert.match(source, /data-action="scenario-jump"/);
  assert.match(source, /The decision and dispatch controls unlock at the final snapshot/);
  assert.match(source, /inject: \(\) =>/);
  assert.match(source, /incident: \(\) =>/);
});

test('incident lab branches into explicit aftershocks and scored recovery gates', () => {
  assert.match(source, /const scenarioAftershocks = \{/);
  assert.match(source, /scenarioStage: \{\}/);
  assert.match(source, /data-action="scenario-aftershock-start"/);
  assert.match(source, /function evaluateScenarioRecovery\(id\)/);
  assert.match(source, /commandResult\.score \* 0\.6 \+ recoveryScore \* 0\.4/);
  assert.match(source, /state\.scenarioStage\[id\] = 'review'/);
  assert.match(source, /state\.scenarioStage\[id\] = 'complete'/);
  assert.match(source, /function renderIncidentCommandRecord\(\)/);
  assert.match(source, /scenarioHistory = state\.scenarioHistory\.slice\(-200\)/);
});

test('incident replay center turns scored evidence into a repair queue', () => {
  assert.match(source, /selectedIncidentRun: ''/);
  assert.match(source, /function incidentRunComponents\(run\)/);
  assert.match(source, /function incidentRemediationPlan\(run\)/);
  assert.match(source, /function renderIncidentTrend\(histories, selectedId\)/);
  assert.match(source, /function renderIncidentReplay\(run, histories\)/);
  assert.match(source, /commandDecisionScore: commandResult\.decision/);
  assert.match(source, /recoveryHandoffText: rawHandoff/);
  assert.match(source, /makeQuiz\('remediation', ids, 'incident', reasons, \{ remediationCycleId: cycle\.id \}\)/);
  assert.match(source, /origin === 'incident'/);
});

test('incident remediation closes the loop through a scored transfer retest', () => {
  assert.match(source, /remediationCycles: \[\]/);
  assert.match(source, /function beginRemediationCycle\(run, plan\)/);
  assert.match(source, /function recordRemediationQuiz\(pct\)/);
  assert.match(source, /function pendingRemediationCycle\(scenarioId\)/);
  assert.match(source, /function scoreRemediationTransfer\(cycle, run\)/);
  assert.match(source, /status: verified \? 'verified' : 'needs-review'/);
  assert.match(source, /data-action="remediation-retest"/);
  assert.match(source, /function resetScenarioState\(id\)/);
  assert.match(source, /TRANSFER VERIFIED/);
  assert.match(source, /Target \+5 or ≥90%/);
});

test('verified transfer proofs enter a persisted retention ladder', () => {
  assert.match(source, /const TRANSFER_REVIEW_INTERVALS = \[0, 1, 7, 21, 60\]/);
  assert.match(source, /transferReviews: \[\], activeTransferReviewId: ''/);
  assert.match(source, /function scheduleTransferReview\(cycle, stage, referenceRun\)/);
  assert.match(source, /function ensureTransferReviewSchedule\(\)/);
  assert.match(source, /function armTransferReview\(review\)/);
  assert.match(source, /function scoreTransferReview\(review, run\)/);
  assert.match(source, /compositeFloor: Math\.max\(75, Math\.min\(90, referenceComposite - 5\)\)/);
  assert.match(source, /targetFloor: referenceTargetScore === null \? null : Math\.max\(70, Math\.min\(85, referenceTargetScore - 5\)\)/);
  assert.match(source, /transferReviewId: retentionReview\?\.id \|\| ''/);
  assert.match(source, /transferKind: retentionReview \? 'retention' : transferCycle \? 'immediate' : ''/);
  assert.match(source, /data-action="transfer-review-start"/);
  assert.match(source, /<h3>Transfer retention<\/h3>/);
  assert.match(source, /DURABLE TRANSFER/);
  assert.match(source, /Repair decay/);
});

test('daily quest display clamps completed counts to their targets', () => {
  assert.match(source, /const displayValue = Math\.min\(quest\.value, quest\.target\)/);
  assert.match(source, /\$\{displayValue\} \/ \$\{quest\.target\}/);
});

test('review inbox uses explicit spaced-review state', () => {
  assert.match(source, /const REVIEW_INTERVALS = \[0, 1, 3, 7, 14, 30, 60\]/);
  assert.match(source, /function scheduleQuestionReview\(stats, resolution, grade = 'auto', advanceEvidence = true\)/);
  assert.match(source, /reason = advanceEvidence \? 'Clean recall' : 'Same-day clean rehearsal'/);
  assert.match(source, /function reviewQueueEntries\(limit = 8\)/);
  assert.match(source, /<h3>Review inbox<\/h3>/);
  assert.match(source, /stats\.reviewIntervalDays = interval/);
});

test('pre-answer confidence is required and persisted through resolution', () => {
  assert.match(source, /const CONFIDENCE_LEVELS = \['low', 'medium', 'high'\]/);
  assert.match(source, /function renderPreConfidence\(\)/);
  assert.match(source, /data-action="question-preconfidence"/);
  assert.match(source, /if \(!CONFIDENCE_LEVELS\.includes\(state\.quiz\.preConfidence\)\)/);
  assert.match(source, /preConfidence: calibration\.confidence, calibration: calibration\.outcome, calibrationResolved: true/);
});

test('calibration queue and misconception analytics stay actionable', () => {
  assert.match(source, /calibration: \{ name: 'Calibration Lab'/);
  assert.match(source, /function misconceptionForAttempt\(question, choiceIndex\)/);
  assert.match(source, /function calibrationQuestionPool\(count = 15\)/);
  assert.match(source, /function renderCalibrationProfile\(\)/);
  assert.match(source, /data-action="practice-misconception"/);
  assert.match(source, /High-confidence miss targeted/);
});

test('flashcard recall uses a transparent deterministic rubric', () => {
  assert.match(source, /const FLASH_RUBRIC_VERSION = 1/);
  assert.match(source, /const FLASH_RUBRIC_OVERRIDES = \{/);
  assert.match(source, /function fallbackFlashRubric\(card\)/);
  assert.match(source, /function evaluateFlashResponse\(card, answer, id = ''\)/);
  assert.match(source, /coverageScore = rules\.length \? Math\.round\(60 \* matched\.length \/ rules\.length\) : 0/);
  assert.match(source, /const structureScore = Math\.min\(25,/);
  assert.match(source, /const specificityScore = Math\.min\(15,/);
  assert.match(source, /return normalizeFlashAttempt\(\{/);
});

test('flashcard validation preserves the answer boundary and waits for the learner', () => {
  assert.match(source, /function validateFlashDraft\(\)/);
  assert.match(source, /state\.flashAttempts = \[\.\.\.state\.flashAttempts, attempt\]\.slice\(-FLASH_HISTORY_LIMIT\)/);
  assert.match(source, /data-action="flash-validate"/);
  assert.match(source, /data-action="flash-reveal"/);
  assert.match(source, /renderFlashAttempt\(attempt, draft\)/);
  const validator = source.slice(source.indexOf('function validateFlashDraft()'), source.indexOf('function answerQuestion('));
  assert.doesNotMatch(validator, /state\.flashRevealed\s*=\s*true/);
});

test('flashcard revisions retain an inspectable evidence history', () => {
  assert.match(source, /function selectedFlashAttempt\(cardId\)/);
  assert.match(source, /flashAttemptsFor\(card\.id\)\.slice\(-5\)\.reverse\(\)/);
  assert.match(source, /data-action="flash-attempt-select"/);
  assert.match(source, /state\.selectedFlashAttempt = attempt\.id/);
  assert.match(source, /Attempt history/);
});

test('flashcard evidence merges safely across revisions and browser tabs', () => {
  assert.match(source, /merged\.flashDrafts = \{\}/);
  assert.match(source, /localDraft\.updatedAt \|\| ''\) >= String\(remoteDraft\.updatedAt \|\| ''\)/);
  assert.match(source, /const flashAttemptMap = new Map\(\)/);
  assert.match(source, /flashAttemptMap\.set\(attempt\.id, attempt\)/);
  assert.match(source, /\.slice\(-FLASH_HISTORY_LIMIT\)/);
  assert.match(source, /merged\.selectedFlashAttempt = merged\.flashAttempts\.some/);
});

test('flashcard filters expose actionable evidence states without dead ends', () => {
  assert.match(source, /id="ops-flash-status"/);
  assert.match(source, /state\.flashStatus === 'unvalidated'/);
  assert.match(source, /state\.flashStatus === 'needs-review'/);
  assert.match(source, /state\.flashStatus === 'strong'/);
  assert.match(source, /data-action="flash-clear-filters"/);
  assert.match(source, /No cards match this evidence view/);
});

test('flashcard navigation waits for explicit next and avoids weak repeats', () => {
  assert.match(source, /flashActiveId: '', flashRecent: \[\]/);
  assert.match(source, /state\.flashActiveId = current\.card\.id/);
  assert.match(source, /data-action="flash-next"/);
  assert.match(source, /data-action="flash-shuffle"/);
  assert.match(source, /function advanceFlashCard\(mode = 'next'\)/);
  assert.match(source, /const belowStrong = candidates\.filter/);
  assert.match(source, /const notRecent = candidates\.filter/);
  const validator = source.slice(source.indexOf('function validateFlashDraft()'), source.indexOf('function answerQuestion('));
  assert.doesNotMatch(validator, /advanceFlashCard\(/);
});

test('typed recall rewards are bounded and share the manual grade award key', () => {
  assert.match(source, /const recallXp = attempt\.score >= 80 \? 10 : attempt\.score >= 60 \? 5 : 0/);
  assert.match(source, /award\('flash:' \+ current\.card\.id \+ ':' \+ todayKey\(\), recallXp/);
  assert.match(source, /award\('flash:' \+ card\.id \+ ':' \+ todayKey\(\), points/);
  assert.match(source, /state\.cardRatings\[current\.card\.id\] = attempt\.score >= 80 \? 'good'/);
  assert.match(source, /strengthen before XP/);
});

test('flashcard focus and keyboard controls remain explicit and accessible', () => {
  assert.match(source, /id="ops-flash-review" tabindex="-1" role="status" aria-live="polite"/);
  assert.match(source, /aria-keyshortcuts="Control\+Enter Meta\+Enter"/);
  assert.match(source, /aria-keyshortcuts="ArrowRight"/);
  assert.match(source, /state\.practiceView === 'flash'/);
  assert.match(source, /\(event\.ctrlKey \|\| event\.metaKey\) && event\.key === 'Enter'/);
  assert.match(source, /root\.querySelector\('#ops-flash-draft'\)\?\.focus/);
  assert.match(source, /@media \(max-width: 760px\)[\s\S]*?\.ops-flash-score-grid/);
});

test('typed recall evidence contributes to profile and readiness', () => {
  assert.match(source, /function flashEvidenceSummary\(\)/);
  assert.match(source, /function renderFlashEvidenceCenter\(\)/);
  assert.match(source, /Typed recall evidence/);
  assert.match(source, /data-action="flash-card-open"/);
  assert.match(source, /const flashEvidence = flashEvidenceSummary\(\)/);
  assert.match(source, /flashEvidence\.strong \/ flashcards\.length/);
  assert.match(source, /renderFlashEvidenceCenter\(\)/);
});

test('today surfaces a written recall evidence pulse', () => {
  assert.match(source, /function flashAttemptDay\(attempt\)/);
  assert.match(source, /function renderFlashRecallPulse\(\)/);
  assert.match(source, /Weakest branch:/);
  assert.match(source, /todayAttempts/);
  assert.match(source, /renderFlashRecallPulse\(\)/);
});

test('typed recall progression unlocks evidence-based achievements', () => {
  assert.match(source, /function flashImprovementCount\(minimum = 20\)/);
  assert.match(source, /id: 'written-signal'/);
  assert.match(source, /id: 'recall-repair'/);
  assert.match(source, /id: 'recall-vault'/);
  assert.match(source, /id: 'signal-foundation'/);
  assert.match(source, /@keyframes ops-flash-evidence-in/);
  assert.match(source, /prefers-reduced-motion: reduce[\s\S]*?\.ops-flash-review/);
});
