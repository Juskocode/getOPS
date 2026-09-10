import type { BranchId } from "@getops/contracts";

export interface ScenarioSignal {
  time: string;
  source: string;
  reading: string;
  tone: "normal" | "warning" | "critical";
}

export interface ScenarioBriefing {
  id: string;
  title: string;
  branchId: BranchId;
  severity: "SEV-1" | "SEV-2" | "SEV-3";
  symptom: string;
  decision: string;
  openingMove: string;
  controlBoundary: string;
  signals: ScenarioSignal[];
}

export const scenarioBriefings: ScenarioBriefing[] = [
  {
    id: "silent-connected-feed",
    title: "Silent but connected",
    branchId: "feed",
    severity: "SEV-1",
    symptom: "The primary market-data session is connected, but strategy-visible quote age is increasing during continuous trading.",
    decision: "Is this a venue problem, an internal processing stall, or an isolated consumer path, and when must trading be protected?",
    openingMove: "Confirm session activity, compare timestamp boundaries and sequence progression, then scope against a peer channel and independent consumer.",
    controlBoundary: "Escalate and follow the trading-protection path when live decisions rely on data that is no longer trustworthy.",
    signals: [
      { time: "09:14:02", source: "Transport", reading: "Session connected; heartbeat current", tone: "normal" },
      { time: "09:14:04", source: "Handler", reading: "Receive rate normal; native sequence advancing", tone: "normal" },
      { time: "09:14:06", source: "Distribution", reading: "Oldest queue age 2.8 s and rising", tone: "critical" },
      { time: "09:14:08", source: "Consumer", reading: "Published quote age 4.1 s", tone: "critical" },
    ],
  },
  {
    id: "sequence-recovery-loop",
    title: "Sequence recovery loop",
    branchId: "feed",
    severity: "SEV-2",
    symptom: "One multicast partition repeatedly detects a gap, requests recovery, and returns to recovery before the book becomes current.",
    decision: "Can the affected state be trusted, and is recovery failing because of source loss, baseline mismatch, or processing pressure?",
    openingMove: "Identify the partition reset boundary, preserve the first missing sequence, and compare recovery responses with queue and decoder health.",
    controlBoundary: "Recovery is not complete until a valid baseline and continuous incrementals produce fresh downstream state.",
    signals: [
      { time: "11:02:11", source: "Channel B", reading: "Expected 481220; received 481224", tone: "critical" },
      { time: "11:02:12", source: "Recovery", reading: "Snapshot accepted at sequence 481230", tone: "warning" },
      { time: "11:02:13", source: "Decoder", reading: "Incremental 481229 arrived after baseline", tone: "critical" },
      { time: "11:02:15", source: "Consumer", reading: "Book marked unavailable", tone: "warning" },
    ],
  },
  {
    id: "open-reject-burst",
    title: "Open reject burst",
    branchId: "sessions",
    severity: "SEV-2",
    symptom: "Order rejects rise sharply during an expected auction-to-continuous transition while connectivity remains healthy.",
    decision: "Is the strategy sending an action that is invalid for the venue state, or has configuration drift reached the gateway?",
    openingMove: "Confirm authoritative market state and group rejects by code, order type, account, strategy, and gateway boundary.",
    controlBoundary: "Pause the affected flow when rejects indicate a state or control mismatch that could create unsafe retries or missed exposure.",
    signals: [
      { time: "08:00:00", source: "Venue state", reading: "Continuous trading expected", tone: "normal" },
      { time: "08:00:01", source: "Gateway", reading: "Reject rate 14x session baseline", tone: "critical" },
      { time: "08:00:02", source: "Reject code", reading: "Order type not allowed in current state", tone: "warning" },
      { time: "08:00:03", source: "Region peer", reading: "Normal acknowledgements", tone: "normal" },
    ],
  },
  {
    id: "latency-queue-pressure",
    title: "Tail latency pressure",
    branchId: "capacity",
    severity: "SEV-2",
    symptom: "Average processing latency is stable, but p99 and oldest queue age rise during a scheduled high-volume session.",
    decision: "Which dependency is reducing service rate, and how much safe headroom remains before data freshness or order control degrades?",
    openingMove: "Compare arrival and service rates, queue age, per-worker utilization, lock waits, network pressure, and downstream limits.",
    controlBoundary: "Apply staged load mitigation before critical freshness or acknowledgement objectives are crossed.",
    signals: [
      { time: "15:29:48", source: "Ingress", reading: "Arrival rate +38% versus open baseline", tone: "warning" },
      { time: "15:29:50", source: "CPU", reading: "Aggregate utilization 61%", tone: "normal" },
      { time: "15:29:52", source: "Queue", reading: "Oldest age 780 ms and accelerating", tone: "critical" },
      { time: "15:29:54", source: "Latency", reading: "p50 4 ms; p99 920 ms", tone: "critical" },
    ],
  },
  {
    id: "position-reconciliation-break",
    title: "Position reconciliation break",
    branchId: "orders",
    severity: "SEV-1",
    symptom: "The OMS shows a partially filled order while the risk position is missing the latest execution and the strategy continues to quote.",
    decision: "What is the current economic exposure, which source is authoritative, and can new trading safely continue?",
    openingMove: "Protect the affected trading scope, trace client and venue IDs, and compare OMS, execution reports, drop copy, and applied position events.",
    controlBoundary: "Treat exposure as uncertain until independent execution evidence and risk-visible positions reconcile.",
    signals: [
      { time: "13:41:20", source: "OMS", reading: "Order 60% filled", tone: "warning" },
      { time: "13:41:20", source: "Drop copy", reading: "Two fills totaling 80%", tone: "critical" },
      { time: "13:41:21", source: "Risk", reading: "Position reflects first fill only", tone: "critical" },
      { time: "13:41:22", source: "Strategy", reading: "New orders still active", tone: "warning" },
    ],
  },
  {
    id: "halt-state-disagreement",
    title: "Halt state disagreement",
    branchId: "risk",
    severity: "SEV-1",
    symptom: "The venue reports an instrument halt, but one regional trading component still marks the instrument as continuously tradable.",
    decision: "Has the state event failed to propagate, and which control guarantees that no unsafe action reaches the venue?",
    openingMove: "Verify the authoritative halt, compare state propagation by region, and invoke the approved instrument-level trading control.",
    controlBoundary: "A control acknowledgement is insufficient; verify stopped flow, open-order handling, and consistent downstream state.",
    signals: [
      { time: "10:26:05", source: "Venue", reading: "Instrument state HALTED", tone: "critical" },
      { time: "10:26:06", source: "Region A", reading: "State HALTED; strategy disabled", tone: "normal" },
      { time: "10:26:06", source: "Region B", reading: "State CONTINUOUS; strategy enabled", tone: "critical" },
      { time: "10:26:07", source: "Control bus", reading: "Disable request pending", tone: "warning" },
    ],
  },
];
