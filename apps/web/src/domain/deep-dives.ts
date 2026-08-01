import type { BranchId } from "@getops/contracts";

import { branchLearningMeta } from "./learning-path";

export interface SignalStage {
  label: string;
  inspect: string;
}

export interface MentalModel {
  title: string;
  explanation: string;
  operatorQuestion: string;
}

export interface RunbookStep {
  phase: string;
  action: string;
  evidence: string;
  escalation: string;
}

export interface FailurePattern {
  symptom: string;
  compare: string;
  interpretation: string;
}

export interface Checkpoint {
  question: string;
  answer: string;
}

export interface DeepDiveGuide {
  branchId: BranchId;
  level: string;
  durationMinutes: number;
  objective: string;
  anchor: string;
  signalPath: SignalStage[];
  mentalModels: MentalModel[];
  invariants: string[];
  runbook: RunbookStep[];
  failures: FailurePattern[];
  checkpoints: Checkpoint[];
}

export const deepDiveGuides: DeepDiveGuide[] = [
  {
    branchId: "market",
    ...branchLearningMeta.market,
    objective: "Read prices, liquidity, and executions without confusing displayed intent with completed activity.",
    anchor: "A market event only has meaning when instrument, venue, book scope, and session state are known.",
    signalPath: [
      { label: "Venue", inspect: "Trading phase, instrument status, native event semantics" },
      { label: "Book builder", inspect: "Snapshot baseline, ordered updates, price and size state" },
      { label: "Normalized view", inspect: "L1/L2 mapping, symbol identity, source venue" },
      { label: "Consumer", inspect: "Displayed quote, trade, and strategy-visible freshness" },
    ],
    mentalModels: [
      {
        title: "Intent versus execution",
        explanation: "A quote advertises buying or selling interest at a price and size. A trade records completed quantity; it does not prove what the entire visible book looked like before execution.",
        operatorQuestion: "Am I investigating available liquidity, an execution, or a relationship between both?",
      },
      {
        title: "Top of book versus depth",
        explanation: "L1 is the best displayed bid and ask with associated size. L2 adds price levels beyond the best prices, so its consistency depends on a correctly reconstructed book.",
        operatorQuestion: "Is the symptom limited to best-price calculation or does underlying depth disagree?",
      },
      {
        title: "Venue-local truth",
        explanation: "Prices can differ across venues because liquidity, fees, state, and update timing differ. A cross-venue difference is evidence to scope, not automatic proof of corruption.",
        operatorQuestion: "Which venue and market phase owns the value I am comparing?",
      },
    ],
    invariants: [
      "Price and size fields must be interpreted using the correct event type and instrument mapping.",
      "An unchanged price is not stale when time, sequence, and channel activity continue normally.",
      "Crossed or locked markets require venue and auction context before escalation.",
      "Trade direction is an inference unless the feed explicitly provides aggressor-side semantics.",
    ],
    runbook: [
      { phase: "Establish", action: "Name the instrument, venue, book level, and current session.", evidence: "Reference data, market-state event, expected venue calendar.", escalation: "Stop if instrument identity or state is unresolved." },
      { phase: "Compare", action: "Check quote, trade, and depth behavior against a related symbol or independent source.", evidence: "Best prices, sizes, event timestamps, trade progression.", escalation: "Escalate when the same semantic field diverges beyond an agreed boundary." },
      { phase: "Scope", action: "Determine whether the symptom is one symbol, channel, venue, region, or consumer.", evidence: "Peer instruments, partitions, consumer views, source counters.", escalation: "State the smallest verified blast radius." },
      { phase: "Close", action: "Confirm normal progression and correct state reconstruction.", evidence: "Fresh updates, coherent book, no unresolved sequence recovery.", escalation: "Do not close on a single healthy-looking quote." },
    ],
    failures: [
      { symptom: "Best bid is above best ask", compare: "Auction state, venue rules, depth levels, independent view", interpretation: "Could be a legitimate transient/state-specific condition or a corrupted book." },
      { symptom: "Trade prints outside displayed spread", compare: "Event ordering, hidden liquidity, stale quote age, trade condition", interpretation: "Not automatically invalid; quote and trade may reflect different timing or liquidity." },
      { symptom: "Price never changes", compare: "Sequences, heartbeats, size changes, peer activity, session", interpretation: "A quiet instrument and a stale feed require different evidence." },
    ],
    checkpoints: [
      { question: "What is the operational difference between a quote and a trade?", answer: "A quote represents available interest; a trade is a completed execution. I would monitor their progression separately and only infer causality with ordering, timestamps, and venue semantics." },
      { question: "Why can two healthy venues show different prices?", answer: "Each venue has its own liquidity, participants, fees, state, and update timing. I first confirm comparable instruments and states, then measure whether the difference is expected or anomalous." },
      { question: "What would make a top-of-book value untrustworthy?", answer: "Missing baseline state, a sequence break, incorrect symbol mapping, stale processing, or a bad aggregation can all invalidate the calculated best price." },
    ],
  },
  {
    branchId: "sessions",
    ...branchLearningMeta.sessions,
    objective: "Use market-state transitions as a first-line diagnostic and operational control input.",
    anchor: "Expected activity, allowed actions, and valid alert thresholds change with the trading phase.",
    signalPath: [
      { label: "Calendar", inspect: "Trading date, timezone, holiday, special schedule" },
      { label: "Venue state", inspect: "Pre-open, auction, continuous, halt, close" },
      { label: "Trading controls", inspect: "Allowed order actions, strategy enablement, risk mode" },
      { label: "Operations", inspect: "Checklists, handoff, reconciliation, audit timestamps" },
    ],
    mentalModels: [
      {
        title: "Market state is production data",
        explanation: "Session state is not decorative metadata. It changes whether silence, rejects, price formation, and order behavior are expected.",
        operatorQuestion: "What should this venue and instrument be doing at this exact trading phase?",
      },
      {
        title: "Schedule versus observed state",
        explanation: "A calendar predicts the phase, while authoritative venue messages describe observed state. Operations needs both because special sessions and halts can override the normal schedule.",
        operatorQuestion: "Do schedule, venue state, and downstream state agree?",
      },
      {
        title: "Transition risk",
        explanation: "Opens, closes, auctions, and reconnects concentrate message load and state changes. These are planned stress points for checks, capacity, and escalation readiness.",
        operatorQuestion: "Which invariant changes at the next transition and who owns the go/no-go decision?",
      },
    ],
    invariants: [
      "Session decisions use explicit venue timezones and daylight-saving rules.",
      "A halt is not equivalent to a disconnected feed; state messages and administrative traffic should remain observable.",
      "Pre-session checks verify configuration, connectivity, reference data, clocks, limits, and monitoring readiness.",
      "Post-session closure requires reconciliation and an audit trail, not merely a closed socket.",
    ],
    runbook: [
      { phase: "Pre-open", action: "Verify schedule, reference data, connectivity, clocks, controls, and expected subscriptions.", evidence: "Signed checklist with owner and timestamp.", escalation: "Block readiness when a mandatory control has no evidence." },
      { phase: "Transition", action: "Watch state messages, load, rejects, and first valid market/order events.", evidence: "Venue state, publishing rates, latency tails, acknowledgements.", escalation: "Escalate disagreement between authoritative state and trading behavior." },
      { phase: "Continuous", action: "Monitor invariants against the active session baseline.", evidence: "Freshness, order flow, risk, queue, and error telemetry.", escalation: "Use session-adjusted thresholds and verified impact." },
      { phase: "Close", action: "Confirm disablement, final positions, open orders, and reconciliation completion.", evidence: "Post-session control record and unresolved-item log.", escalation: "Carry exceptions into a named handoff owner." },
    ],
    failures: [
      { symptom: "No quotes at expected open", compare: "Calendar, venue-state channel, peer symbols, subscription readiness", interpretation: "Could be a delayed open, auction state, mapping issue, or feed failure." },
      { symptom: "Reject rate rises at transition", compare: "Reject codes, allowed order types, strategy mode, venue state", interpretation: "Often configuration or state mismatch rather than connectivity loss." },
      { symptom: "One region shows the wrong phase", compare: "Timezone data, state-event propagation, cache age", interpretation: "A downstream state distribution fault can create unsafe local decisions." },
    ],
    checkpoints: [
      { question: "Why check session state before declaring stale data?", answer: "The market may be closed, halted, or in an auction where update behavior differs. State establishes whether updates should reasonably be occurring." },
      { question: "What belongs in a pre-open readiness check?", answer: "Calendar and reference data, connectivity, subscriptions, time synchronization, risk limits, process health, capacity headroom, alerting, and an explicit owner for exceptions." },
      { question: "How do you close an operational session?", answer: "I verify order and position truth, reconcile independent records, capture exceptions, preserve the timestamped audit trail, and hand unresolved items to a named owner." },
    ],
  },
  {
    branchId: "feed",
    ...branchLearningMeta.feed,
    objective: "Prove continuity, freshness, ordering, and consumer usability across a market-data path.",
    anchor: "A connected socket is only transport evidence; healthy data must continue to progress coherently downstream.",
    signalPath: [
      { label: "Exchange feed", inspect: "Channel state, native sequence, exchange timestamp" },
      { label: "Handler", inspect: "Receive rate, decoder errors, recovery state" },
      { label: "Normalization", inspect: "Symbol mapping, event semantics, publish timestamp" },
      { label: "Distribution", inspect: "Queues, fanout rate, subscription pressure" },
      { label: "Consumer", inspect: "Last received event, processing lag, usable freshness" },
    ],
    mentalModels: [
      {
        title: "Snapshot plus incrementals",
        explanation: "A snapshot establishes a complete baseline. Incremental messages apply changes efficiently, but only while ordering and prior state remain valid.",
        operatorQuestion: "What baseline is this consumer applying updates to, and is sequence continuity proven?",
      },
      {
        title: "Three-clock latency",
        explanation: "Exchange, receive, and publish timestamps split venue/network delay from internal processing delay. A consumer timestamp adds the final delivery and processing boundary.",
        operatorQuestion: "At which timestamp interval does age begin to accumulate?",
      },
      {
        title: "Scope before cause",
        explanation: "One symbol, channel, venue, region, service, or consumer imply different fault domains. Scope with independent comparisons before changing infrastructure.",
        operatorQuestion: "What is the smallest shared component across every affected observation?",
      },
    ],
    invariants: [
      "Sequence rules are interpreted within the correct channel, partition, and reset boundary.",
      "Delayed data progresses behind real time by design; stale data unexpectedly stops or exceeds its freshness contract.",
      "Recovery is complete only after a valid baseline and continuous incrementals are restored.",
      "Downstream freshness must be measured at the consumer, not inferred from upstream health alone.",
    ],
    runbook: [
      { phase: "Expect", action: "Confirm active session and expected instrument/channel activity.", evidence: "Market state, peers, heartbeats, normal publication baseline.", escalation: "Avoid false incidents on legitimate silence." },
      { phase: "Measure", action: "Compare exchange, receive, publish, and consumer timestamps plus sequence progression.", evidence: "Age by boundary, gaps, duplicates, out-of-order counts.", escalation: "Escalate immediately when trading uses untrusted state." },
      { phase: "Scope", action: "Slice by symbol, channel, venue, region, service, and consumer.", evidence: "Independent source and adjacent-path comparisons.", escalation: "Communicate verified scope and unknowns separately." },
      { phase: "Recover", action: "Follow recovery controls and verify a clean snapshot-to-incremental transition.", evidence: "Recovery counters, queue drain, fresh consumer state.", escalation: "Do not declare recovery on reconnection alone." },
    ],
    failures: [
      { symptom: "Sequence jumps forward", compare: "Channel reset rules, redundant feed, recovery requests", interpretation: "Potential message loss; current incremental state may be invalid." },
      { symptom: "Receive is fresh but publish age grows", compare: "Processing latency, queue depth, CPU, decoder errors", interpretation: "Internal processing or backpressure is accumulating delay." },
      { symptom: "Venue feed healthy, one strategy stale", compare: "Subscription, entitlement, routing, symbol map, client queue", interpretation: "The fault is likely downstream or consumer-specific." },
    ],
    checkpoints: [
      { question: "What does a sequence gap imply?", answer: "One or more expected messages may be missing, so an incrementally maintained state can no longer be trusted until the feed-specific recovery process restores continuity." },
      { question: "Which timestamps do you compare for latency?", answer: "Exchange event, local receive, internal publish, and consumer processing timestamps. Their deltas identify where age enters the path." },
      { question: "How do you verify stale data?", answer: "I confirm the active session, compare time and sequence progression, check heartbeats and peers, scope the path, assess trading impact, then recover and verify resynchronization." },
    ],
  },
  {
    branchId: "monitoring",
    ...branchLearningMeta.monitoring,
    objective: "Design telemetry that explains operational state instead of merely drawing graphs.",
    anchor: "Every useful alert names its population, time window, threshold meaning, and operator action.",
    signalPath: [
      { label: "Event", inspect: "Precise operational fact and ownership boundary" },
      { label: "Metric", inspect: "Type, labels, units, reset behavior, population" },
      { label: "Aggregation", inspect: "Window, quantile, denominator, missing-data treatment" },
      { label: "Alert", inspect: "Threshold, duration, routing, suppression" },
      { label: "Response", inspect: "Runbook, evidence links, escalation owner" },
    ],
    mentalModels: [
      {
        title: "Metric contract",
        explanation: "A metric needs a stable definition: what is counted, at which boundary, with which labels, units, and reset semantics. Names alone are not contracts.",
        operatorQuestion: "Could two engineers calculate a different number from this metric description?",
      },
      {
        title: "Absence is a signal",
        explanation: "No samples can mean no activity, failed collection, dead process, or label drift. Monitoring must distinguish legitimate zero from missing telemetry.",
        operatorQuestion: "Would the alert still work if the producer stopped emitting entirely?",
      },
      {
        title: "Tail over average",
        explanation: "Averages can hide a small but trading-critical slow population. Latency and queue monitoring should expose tails, sustained windows, and affected populations.",
        operatorQuestion: "Which users or messages are invisible inside this aggregate?",
      },
    ],
    invariants: [
      "Rates account for counter resets and use compatible numerator/denominator populations.",
      "Labels remain bounded enough to preserve monitoring-system reliability.",
      "Alerts include context needed for the first safe action, not only a symptom name.",
      "Dashboards show freshness and collection health alongside the measured system.",
    ],
    runbook: [
      { phase: "Define", action: "Write the metric population, boundary, unit, labels, and expected states.", evidence: "Metric contract and representative raw events.", escalation: "Reject ambiguous metrics before alerting on them." },
      { phase: "Baseline", action: "Characterize normal ranges by session and transition.", evidence: "Historical distributions and known event annotations.", escalation: "Avoid one threshold across incompatible phases." },
      { phase: "Alert", action: "Bind sustained conditions to impact, route, and a first action.", evidence: "Alert payload, dashboard link, runbook, owner.", escalation: "Page only when timely human action changes risk." },
      { phase: "Improve", action: "Measure detection delay, noise, reaction time, and missed incidents.", evidence: "Alert review and incident timeline.", escalation: "Change the contract when operators cannot act from it." },
    ],
    failures: [
      { symptom: "Dashboard says zero after deploy", compare: "Raw samples, labels, counter reset, query window", interpretation: "Could be legitimate reset, query mismatch, or missing telemetry." },
      { symptom: "Average latency is normal but users complain", compare: "p95/p99, per-region and per-consumer slices, queue age", interpretation: "A tail or isolated population is hidden by aggregation." },
      { symptom: "Alert fires every open", compare: "Session baseline, duration, expected load transition", interpretation: "Threshold semantics do not model the operating phase." },
    ],
    checkpoints: [
      { question: "What makes an alert actionable?", answer: "It states the affected boundary and scope, gives evidence of impact, links the relevant telemetry and runbook, and routes to an owner who can take a bounded first action." },
      { question: "Why is missing data different from zero?", answer: "Zero is a valid measured value; missing data means the measurement path may be absent. Treating both alike can suppress evidence of a dead producer or collector." },
      { question: "How would you reduce noisy latency alerts?", answer: "I would validate metric semantics, segment by session and population, use sustained tail conditions, correlate impact signals, then review detection and false-positive history." },
    ],
  },
  {
    branchId: "orders",
    ...branchLearningMeta.orders,
    objective: "Reconstruct authoritative order state across asynchronous requests, acknowledgements, fills, rejects, and cancels.",
    anchor: "A local send event proves intent to transmit; it does not prove venue acceptance or final order state.",
    signalPath: [
      { label: "Strategy", inspect: "Decision, client order ID, requested quantity and price" },
      { label: "Gateway", inspect: "Validation, send state, session sequence, reject boundary" },
      { label: "Venue", inspect: "Acknowledgement, venue order ID, execution state" },
      { label: "Drop copy", inspect: "Independent order and fill evidence" },
      { label: "Position", inspect: "Applied fills, reconciliation, risk-visible quantity" },
    ],
    mentalModels: [
      {
        title: "Asynchronous lifecycle",
        explanation: "New, cancel, and replace requests overlap with acknowledgements and fills. The system must model pending and uncertain states rather than assume request order equals outcome order.",
        operatorQuestion: "Which component has acknowledged this transition, and what can still race with it?",
      },
      {
        title: "Identifier lineage",
        explanation: "Client and venue identifiers correlate lifecycle events across systems. Replacements and retries require explicit lineage to avoid duplicate or orphan interpretations.",
        operatorQuestion: "Can I reconstruct this order from intent through every authoritative response?",
      },
      {
        title: "Independent truth",
        explanation: "OMS state, venue responses, drop copy, and positions are related but distinct evidence sources. Reconciliation explains disagreement instead of choosing the most convenient screen.",
        operatorQuestion: "Which source is authoritative for this exact lifecycle fact?",
      },
    ],
    invariants: [
      "Executed quantity cannot exceed valid order quantity without an explicit lifecycle explanation.",
      "Retries never reuse identifiers until uncertain venue state is resolved by procedure.",
      "Reject metrics preserve reject code and boundary rather than collapsing all failures together.",
      "Order and position truth reconcile against an independent source after the session." ,
    ],
    runbook: [
      { phase: "Trace", action: "Collect client ID, venue ID, session, symbol, and timestamps.", evidence: "Strategy log, gateway event, venue response, drop copy.", escalation: "Protect trading if order state is uncertain and material." },
      { phase: "Reconstruct", action: "Order every acknowledgement, fill, cancel, replace, and reject by source time.", evidence: "Lifecycle timeline with source and sequence boundaries.", escalation: "Keep contradictory sources visible." },
      { phase: "Reconcile", action: "Compare open orders, executions, and applied positions.", evidence: "OMS, drop copy, venue query, risk position.", escalation: "Escalate unresolved economic exposure immediately." },
      { phase: "Close", action: "Document final state, impact, recovery, and any manual control.", evidence: "Timestamped incident and reconciliation record.", escalation: "Require owner and deadline for residual breaks." },
    ],
    failures: [
      { symptom: "Order sent, no acknowledgement", compare: "Session state, gateway queue, sequence, venue query, drop copy", interpretation: "State is uncertain; blind retry can create duplicate exposure." },
      { symptom: "Cancel rejected", compare: "Reject code, fill timing, order terminal state", interpretation: "The order may already be filled, canceled, unknown, or invalid for that action." },
      { symptom: "Position differs from fills", compare: "Applied fill stream, duplicate/missing events, account mapping", interpretation: "Execution truth and risk-visible state are not reconciled." },
    ],
    checkpoints: [
      { question: "What does sent versus acknowledged mean?", answer: "Sent proves a component emitted a request. Acknowledged means a downstream or venue response confirmed receipt or a state transition; the exact boundary must be named." },
      { question: "Why not immediately retry an unacknowledged order?", answer: "The venue may have accepted the first request even if the response was lost. I first resolve uncertain state using identifiers, session evidence, venue query, or independent drop copy." },
      { question: "How do you investigate a position mismatch?", answer: "I freeze the scope, compare fills across authoritative and independent sources, verify duplicates and mappings, trace application into positions, assess exposure, and preserve the reconciliation record." },
    ],
  },
  {
    branchId: "risk",
    ...branchLearningMeta.risk,
    objective: "Keep limits, positions, controls, and audit evidence authoritative during abnormal trading conditions.",
    anchor: "Risk controls are operational systems with dependencies, latency, state, and failure modes of their own.",
    signalPath: [
      { label: "Reference", inspect: "Account, instrument, currency, limit configuration" },
      { label: "Pre-trade", inspect: "Price, size, credit, fat-finger, rate checks" },
      { label: "Execution", inspect: "Fills, cancels, rejects, independent copy" },
      { label: "Position", inspect: "Applied quantity, P&L inputs, reconciliation state" },
      { label: "Control", inspect: "Throttle, disable, kill path, approval and audit" },
    ],
    mentalModels: [
      {
        title: "Preventive and detective controls",
        explanation: "Pre-trade limits block unsafe actions; monitoring and reconciliation detect drift or failures that preventive controls cannot cover alone.",
        operatorQuestion: "Which control prevents the event and which independent control detects its failure?",
      },
      {
        title: "Fail-safe authority",
        explanation: "A control path must have explicit ownership, scope, and verification. A kill command is incomplete until affected trading and residual orders are confirmed.",
        operatorQuestion: "Who can invoke this control, what exactly stops, and how is success proven?",
      },
      {
        title: "Audit-ready decisions",
        explanation: "Regulated operations needs reproducible timestamps, inputs, decisions, approvals, and outcomes. Good records support both investigation and continuous improvement.",
        operatorQuestion: "Could another operator reconstruct why this decision was made?",
      },
    ],
    invariants: [
      "Limit configuration has effective time, scope, owner, and change evidence.",
      "Position freshness and source are visible wherever risk decisions are made.",
      "Control actions preserve identity, timestamp, reason, scope, and outcome.",
      "MiFID awareness means disciplined controls and records, not improvised legal conclusions." ,
    ],
    runbook: [
      { phase: "Detect", action: "Identify the breached or unreliable control and affected trading scope.", evidence: "Limit event, position age, order flow, independent execution source.", escalation: "Treat unknown exposure as risk until reconciled." },
      { phase: "Contain", action: "Apply the approved throttle, disablement, or kill procedure.", evidence: "Control acknowledgement, order-state change, rate reduction.", escalation: "Escalate if control outcome cannot be verified." },
      { phase: "Reconcile", action: "Establish positions, open orders, and residual exposure.", evidence: "OMS, risk engine, venue/drop copy, account mapping.", escalation: "Keep trading restricted while material breaks remain." },
      { phase: "Record", action: "Capture decision inputs, owner, approvals, timestamps, and recovery criteria.", evidence: "Immutable operational log and follow-up action.", escalation: "Raise control-design gaps through governance." },
    ],
    failures: [
      { symptom: "Limit rejects spike", compare: "Limit version, account mapping, price source, session behavior", interpretation: "Could be genuine exposure or stale/misconfigured control inputs." },
      { symptom: "Kill command acknowledged but flow continues", compare: "Scope, downstream gateways, open orders, independent executions", interpretation: "Acknowledgement is not proof of complete containment." },
      { symptom: "Position is within limit but source is stale", compare: "Position timestamp, fill progression, drop copy", interpretation: "The numerical value is not decision-grade without freshness." },
    ],
    checkpoints: [
      { question: "What evidence proves a kill switch worked?", answer: "The control acknowledgement, stopped new flow at every scoped gateway, managed open orders, independent execution checks, and reconciled residual position together prove containment." },
      { question: "How does MiFID affect an operations role?", answer: "It reinforces controlled procedures, reliable systems, timestamped records, surveillance support, and reproducible escalation. I would follow firm policy and involve compliance for legal interpretation." },
      { question: "What do you do with a stale position feed?", answer: "I treat the exposure as uncertain, assess whether trading can continue safely, compare independent execution evidence, escalate, and restore and reconcile before trusting the position again." },
    ],
  },
  {
    branchId: "capacity",
    ...branchLearningMeta.capacity,
    objective: "Reason from arrival rate, service capacity, queues, and latency tails before load becomes trading impact.",
    anchor: "Utilization describes busyness; queue age and tail latency reveal whether the system is keeping up.",
    signalPath: [
      { label: "Ingress", inspect: "Message/order arrival rate, burst shape, session source" },
      { label: "Queue", inspect: "Depth, oldest age, drops, retry amplification" },
      { label: "Worker", inspect: "Service rate, CPU, scheduling, lock contention" },
      { label: "Egress", inspect: "Publish/send rate, downstream backpressure" },
      { label: "Consumer", inspect: "Freshness, timeout, rejected or delayed work" },
    ],
    mentalModels: [
      {
        title: "Rate balance",
        explanation: "When sustained arrival rate exceeds service rate, backlog grows. Short bursts are safe only when there is enough queue and recovery headroom to drain them within the freshness objective.",
        operatorQuestion: "Is backlog stable, growing, or draining, and how old is the oldest work?",
      },
      {
        title: "Saturation chain",
        explanation: "CPU, memory, network, locks, and downstream limits interact. The first saturated dependency may be far from the component showing stale output.",
        operatorQuestion: "Which resource or downstream contract first constrains service rate?",
      },
      {
        title: "Failover is a load event",
        explanation: "Failover shifts traffic and often adds recovery work. Capacity plans must test surviving components under combined normal, burst, and recovery load.",
        operatorQuestion: "Can the remaining path absorb both redirected traffic and resynchronization?",
      },
    ],
    invariants: [
      "Capacity plans use peak session transitions and realistic burst distributions, not daily averages.",
      "Queue age is monitored alongside depth because depth alone lacks work-cost and freshness context.",
      "Headroom is measured at every constrained dependency and under failover topology.",
      "Load tests preserve correctness checks for gaps, rejects, duplicates, and stale consumers." ,
    ],
    runbook: [
      { phase: "Baseline", action: "Measure arrival, service, queue, resource, and latency distributions by session.", evidence: "Peak and tail values with event annotations.", escalation: "Flag capacity with no reliable demand model." },
      { phase: "Project", action: "Model growth, open bursts, failover, and recovery amplification.", evidence: "Assumptions, safety margin, bottleneck and saturation point.", escalation: "Make uncertainty explicit rather than hiding it in one number." },
      { phase: "Stress", action: "Replay realistic load while checking data and order correctness.", evidence: "Throughput, queue age, tails, drops, rejects, recovery time.", escalation: "Stop when test risks shared environments or invalid data." },
      { phase: "Operate", action: "Trigger staged mitigation before freshness or control limits fail.", evidence: "Rate limit, scale, shed, or failover result with impact checks.", escalation: "Protect trading over preserving nonessential throughput." },
    ],
    failures: [
      { symptom: "CPU moderate, latency rising", compare: "Queue age, lock waits, network, downstream rate limits", interpretation: "CPU is not the bottleneck; serialized or blocked work may dominate." },
      { symptom: "Queue depth flat but age rises", compare: "Message cost distribution, worker throughput, sampling", interpretation: "A small number of expensive items or partial stall can age work." },
      { symptom: "Failover succeeds then feed becomes stale", compare: "Combined load, recovery traffic, surviving-node headroom", interpretation: "Functional failover passed but capacity under failover did not." },
    ],
    checkpoints: [
      { question: "What do you monitor for capacity planning?", answer: "Arrival and service rates, queue depth and age, latency tails, CPU, memory, network, errors, drops, and downstream limits by session and failover state." },
      { question: "Why is CPU below 100 percent not enough?", answer: "The bottleneck can be locks, a single core, network, storage, a downstream rate limit, or queue serialization. I correlate service rate and queue age with resource saturation." },
      { question: "How would you prepare for the market open?", answer: "I use historical open bursts and growth, validate failover headroom, stress the full path with correctness checks, and define staged mitigation and escalation before the session." },
    ],
  },
  {
    branchId: "incident",
    ...branchLearningMeta.incident,
    objective: "Make calm, risk-aware decisions while telemetry is incomplete and time matters.",
    anchor: "The first objective is safe trading and bounded impact; root cause can follow once control is restored.",
    signalPath: [
      { label: "Detect", inspect: "Symptom, first timestamp, confidence, affected invariant" },
      { label: "Assess", inspect: "Trading impact, scope, severity, uncertainty" },
      { label: "Contain", inspect: "Runbook control, owner, expected observable outcome" },
      { label: "Recover", inspect: "State resynchronization, backlog drain, reconciliation" },
      { label: "Improve", inspect: "Timeline, causal factors, control and detection actions" },
    ],
    mentalModels: [
      {
        title: "Severity follows impact",
        explanation: "A dramatic graph is not severity by itself. Severity reflects trading risk, affected scope, control availability, customer or regulatory impact, and time sensitivity.",
        operatorQuestion: "What unsafe decision or exposure can occur if this continues?",
      },
      {
        title: "Facts, hypotheses, actions",
        explanation: "Separate verified observations from suspected causes and chosen actions. This keeps communication accurate while investigation evolves.",
        operatorQuestion: "Which sentence is proven, which is inferred, and which is the next controlled action?",
      },
      {
        title: "Recovery versus resolution",
        explanation: "Service can appear healthy before queues drain, state resynchronizes, positions reconcile, and alerts remain stable. Recovery criteria must cover the operational invariant.",
        operatorQuestion: "What evidence proves the system is safe, not merely available?",
      },
    ],
    invariants: [
      "Every incident has a named commander, timestamped record, current impact, and next update time.",
      "Containment actions have explicit scope, rollback, and verification signals.",
      "Unknowns are communicated as unknowns; confidence is never implied by polished wording.",
      "Closure requires stable telemetry, reconciled state, and assigned follow-up actions." ,
    ],
    runbook: [
      { phase: "0-2 min", action: "Confirm time, scope, impact, and whether trading needs protection.", evidence: "Primary symptom plus one independent corroborating signal.", escalation: "Page the defined owner immediately when risk criteria are met." },
      { phase: "2-5 min", action: "Start incident command, preserve evidence, and choose a bounded containment action.", evidence: "Timeline, owner, action, expected result, rollback.", escalation: "Set a next update time even when cause is unknown." },
      { phase: "Recovery", action: "Verify service, queues, state continuity, positions, and downstream consumers.", evidence: "Freshness, sequence, backlog, reconciliation, alert stability.", escalation: "Reopen containment if any critical invariant remains broken." },
      { phase: "Follow-up", action: "Document causal factors and improve detection, procedure, capacity, or control.", evidence: "Owned action with priority and verification method.", escalation: "Track systemic risk beyond the incident meeting." },
    ],
    failures: [
      { symptom: "Connectivity alarm only", compare: "Data progression, order acknowledgements, redundant path, session", interpretation: "Transport alarm needs impact evidence before severity is clear." },
      { symptom: "Service restarted, charts green", compare: "Queue drain, state baseline, downstream freshness, positions", interpretation: "Availability may be restored while correctness is not." },
      { symptom: "Teams investigate different theories", compare: "Shared timeline, scoped facts, incident owner", interpretation: "Command and communication failure is increasing reaction time." },
    ],
    checkpoints: [
      { question: "What do you communicate in the first incident update?", answer: "Start time, verified symptom and scope, trading impact or risk, containment status, owners, unknowns, and the next update time." },
      { question: "When do you escalate?", answer: "When defined impact or risk thresholds are crossed, a critical control is unreliable, scope is expanding, or the current team cannot contain the issue within the expected window." },
      { question: "What proves recovery from stale market data?", answer: "A valid baseline, continuous sequences, drained queues, fresh downstream consumers, stable monitoring, and any affected trading state reconciled." },
    ],
  },
  {
    branchId: "interview",
    ...branchLearningMeta.interview,
    objective: "Deliver concise operational answers that reveal judgement, evidence discipline, and calm ownership.",
    anchor: "Lead with the decision, then show the evidence path, control action, communication, and recovery proof.",
    signalPath: [
      { label: "Question", inspect: "Scenario, role boundary, requested depth" },
      { label: "Decision", inspect: "First safe action and operational priority" },
      { label: "Evidence", inspect: "Signals, comparisons, scope, uncertainty" },
      { label: "Control", inspect: "Escalation, communication, audit record" },
      { label: "Outcome", inspect: "Recovery proof, measurable improvement, learning" },
    ],
    mentalModels: [
      {
        title: "Decision-first structure",
        explanation: "Begin with what you would do and why. Add diagnostic evidence in the order that changes the decision, then state escalation and recovery criteria.",
        operatorQuestion: "Could the interviewer identify my first action in the opening sentence?",
      },
      {
        title: "Transfer, not theatre",
        explanation: "Map real observability, market-data, capacity, and incident experience to trading operations without inflating ownership or exposing confidential details.",
        operatorQuestion: "Which proven behavior from my current role transfers directly to this scenario?",
      },
      {
        title: "Calibrated confidence",
        explanation: "Strong operators state what is known, what is inferred, and what needs verification. Precision is more credible than pretending every scenario has one certain cause.",
        operatorQuestion: "Have I separated verified facts from hypotheses?",
      },
    ],
    invariants: [
      "Answers name trading impact before diving into infrastructure detail.",
      "STAR stories quantify outcomes honestly and distinguish personal contribution from team work.",
      "Confidential architecture, thresholds, incidents, customers, and strategy details remain abstract.",
      "Every scenario answer includes escalation, communication, logging, and recovery verification." ,
    ],
    runbook: [
      { phase: "Frame", action: "Restate the operational risk and any assumption that changes the answer.", evidence: "Session, scope, affected workflow, expected behavior.", escalation: "Ask one clarifying question only when it materially changes the decision." },
      { phase: "Decide", action: "State the first safe action and immediate checks.", evidence: "Two or three discriminating signals, not a tool inventory.", escalation: "Name the threshold or condition for escalation." },
      { phase: "Operate", action: "Explain containment, communication, and timestamped records.", evidence: "Owner, audience, update cadence, runbook boundary.", escalation: "Be explicit about what you would not do blindly." },
      { phase: "Close", action: "Define recovery evidence and the improvement that follows.", evidence: "Reconciliation, stable telemetry, measurable outcome.", escalation: "Connect the answer to relevant personal experience." },
    ],
    failures: [
      { symptom: "Answer becomes a tool list", compare: "Decision, impact, evidence order, outcome", interpretation: "Technical familiarity is visible but operational judgement is not." },
      { symptom: "STAR story has no measurable result", compare: "Detection, reaction time, reliability, capacity risk, operator effort", interpretation: "Impact and personal contribution remain unclear." },
      { symptom: "Candidate jumps to restart", compare: "Risk, evidence preservation, uncertain state, runbook", interpretation: "Action bias is replacing controlled incident response." },
    ],
    checkpoints: [
      { question: "How do you position your background for this role?", answer: "My background is not generic support. I work close to market-data production systems, observability, telemetry, incidents, and capacity analysis, which maps directly to trading-system reliability and fast evidence-based escalation." },
      { question: "How would you answer a stale-data scenario in 60 seconds?", answer: "Confirm session and expected activity, compare sequence and timestamp boundaries, scope against peers and independent sources, protect trading if risk exists, escalate with facts, and verify clean resynchronization." },
      { question: "What makes an operations answer senior?", answer: "It prioritizes risk, chooses discriminating evidence, names uncertainty and ownership, follows controls, communicates clearly, and defines what proves recovery." },
    ],
  },
];

export const deepDiveByBranch = new Map(
  deepDiveGuides.map((guide) => [guide.branchId, guide]),
);
