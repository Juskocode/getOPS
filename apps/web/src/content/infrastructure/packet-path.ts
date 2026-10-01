export const packetStages = [
  { id: "nic", label: "NIC / RX ring", layer: "Hardware", lesson: "nic", signal: "Driver counters, per-queue drops, ring occupancy", caution: "Link-up is not proof of delivery. Counter semantics are driver-specific." },
  { id: "kernel", label: "NAPI / stack", layer: "Kernel", lesson: "nic", signal: "Softirq CPU, polling budget, protocol errors", caution: "An idle host can still have one overloaded receive CPU." },
  { id: "socket", label: "Socket queue", layer: "Transport", lesson: "sockets", signal: "Recv-Q, buffer errors, transport state", caution: "ESTAB says nothing about decoded-event freshness." },
  { id: "thread", label: "Thread / I/O", layer: "Execution", lesson: "threads", signal: "Runnable delay, cgroup throttle, event-loop lag", caution: "Low CPU can coexist with blocked I/O or lock waits." },
  { id: "decode", label: "Decode / book", layer: "Application", lesson: "event-loop", signal: "Sequence validity, framing errors, work-queue age", caution: "Ordered bytes do not guarantee a correctly reconstructed book." },
  { id: "consumer", label: "Publish / use", layer: "Trading", lesson: "capstone", signal: "Publish age, consumer freshness, usable state", caution: "Recovery is not complete until the consumer has valid fresh state." },
] as const;

export const packetCases = [
  { id: "baseline", label: "Baseline", tone: "healthy", delays: [12, 18, 8, 20, 25, 17], suspect: -1,
    symptom: "Continuous sequence. Consumer age stays within this scenario's baseline.",
    evidence: "RX drops +0 | socket queue stable | decode backlog 0",
    decision: "Preserve this per-boundary baseline; it is a comparison point, not a universal HFT latency target." },
  { id: "hot-queue", label: "Hot RX queue", tone: "warning", delays: [1500, 900, 10, 20, 25, 17], suspect: 0,
    symptom: "One feed has sequence gaps. One queue drops packets; host CPU is only 18%.",
    evidence: "RX queue 3 drops +140/s | CPU 3 softirq 88% | other queues stable",
    decision: "Correlate channel, RX queue and IRQ CPU. Treat book validity as uncertain under the feed's recovery policy." },
  { id: "throttled", label: "Throttled decoder", tone: "warning", delays: [12, 18, 8, 82000, 250, 170], suspect: 3,
    symptom: "Input is continuous, but consumer age increases while the service exhausts its CPU budget.",
    evidence: "NIC drops +0 | cgroup throttled periods 85/100 | receive-to-decode p99 82 ms",
    decision: "Inspect the process cgroup and critical thread. Protect consumers from stale input and test a scoped scheduling hypothesis." },
  { id: "audit-stall", label: "Blocking audit I/O", tone: "warning", delays: [12, 18, 8, 120000, 25, 17], suspect: 3,
    symptom: "Multiple sockets fall behind together when a synchronous audit flush blocks their event loop.",
    evidence: "Audit fsync p99 120 ms | loop lag correlated | Recv-Q rising",
    decision: "Trace the shared I/O boundary. Preserve audit guarantees; offloading needs a bounded queue and approved overload policy." },
] as const;
