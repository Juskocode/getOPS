import type { BranchId } from "@getops/contracts";
import {
  Activity,
  BookOpen,
  Gauge,
  Gavel,
  RadioTower,
  Route,
  ShieldCheck,
  Siren,
  Waypoints,
  type LucideIcon,
} from "lucide-react";

export interface BranchDefinition {
  id: BranchId;
  name: string;
  shortName: string;
  description: string;
  color: string;
  icon: LucideIcon;
}

export const branches: BranchDefinition[] = [
  {
    id: "market",
    name: "Market Mechanics",
    shortName: "Market",
    description: "Books, liquidity, matching, auctions, and execution semantics.",
    color: "#72b7ff",
    icon: BookOpen,
  },
  {
    id: "feed",
    name: "Market Data Integrity",
    shortName: "Feed",
    description: "Sequence, freshness, timestamps, recovery, and consumer truth.",
    color: "#63d6a0",
    icon: RadioTower,
  },
  {
    id: "orders",
    name: "Order Lifecycle",
    shortName: "Orders",
    description: "Acknowledgements, fills, rejects, cancel races, and reconciliation.",
    color: "#f1ca61",
    icon: Route,
  },
  {
    id: "sessions",
    name: "Session Operations",
    shortName: "Sessions",
    description: "Pre-open, auctions, halts, transitions, closeout, and handoff.",
    color: "#c7a7ff",
    icon: Waypoints,
  },
  {
    id: "monitoring",
    name: "Monitoring Design",
    shortName: "Monitoring",
    description: "Metric contracts, alerting, baselines, tails, and missing data.",
    color: "#67d9df",
    icon: Activity,
  },
  {
    id: "incident",
    name: "Incident Command",
    shortName: "Incident",
    description: "Severity, containment, evidence, communication, and recovery.",
    color: "#ff8b72",
    icon: Siren,
  },
  {
    id: "capacity",
    name: "Capacity and Latency",
    shortName: "Capacity",
    description: "Headroom, queues, backpressure, failover, and load correctness.",
    color: "#ef9d5b",
    icon: Gauge,
  },
  {
    id: "risk",
    name: "Risk and Regulation",
    shortName: "Risk",
    description: "Limits, positions, controls, auditability, and MiFID discipline.",
    color: "#ff6f78",
    icon: ShieldCheck,
  },
  {
    id: "interview",
    name: "Next-Round Performance",
    shortName: "Interview",
    description: "Decision-first answers, confidentiality, STAR evidence, and transfer.",
    color: "#b5c7d8",
    icon: Gavel,
  },
];

export const branchById = new Map(branches.map((branch) => [branch.id, branch]));
