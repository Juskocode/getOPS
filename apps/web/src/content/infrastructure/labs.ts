import type { InfraLabId, InfraLessonId } from "@getops/contracts";
import type { InfraQuestion } from "./types";
import { advancedInfrastructureLabs } from "./advanced-labs";

export interface InfrastructureLab {
  id: InfraLabId;
  title: string;
  subtitle: string;
  minutes: number;
  boundary: "Network" | "Execution" | "Unix";
  level: "Core" | "Hard" | "HFT";
  lessons: InfraLessonId[];
  symptom: string;
  scope: string;
  trace: number[];
  evidence: { title: string; command: string; output: string; boundary: string }[];
  steps: (InfraQuestion & { phase: string; requires: number[] })[];
  handoff: string;
  source: { label: string; url: string };
}

const option = (label: string, reason: string) => ({ label, reason });

export const infrastructureLabs: InfrastructureLab[] = [
  {
    id: "rx-hotspot", title: "The quiet host, the hot queue", subtitle: "NIC / IRQ / UDP continuity", minutes: 12, boundary: "Network", level: "Core", lessons: ["nic", "sockets"],
    symptom: "At the simulated market open, one UDP feed develops sequence gaps. Host CPU is only 24%, but downstream freshness has degraded.",
    scope: "One receive channel on feed-a. Feed-b is a separately validated standby. No venue-wide outage is established.",
    trace: [1, 1, 2, 3, 8, 17, 29, 44, 65, 82, 103, 120],
    evidence: [
      { title: "Receive queues", command: "ethtool -S eth0  # two samples, 10 seconds apart", output: "driver-specific counters, delta over window\nrx_queue_3_packets      +980000\nrx_queue_3_drops        +2400\nrx_queue_0_drops        +0\nrx_queue_1_drops        +0\nrx_queue_2_drops        +0", boundary: "Names and drop semantics depend on the driver. A rising drop counter localizes loss; it does not alone prove why it occurred." },
      { title: "CPU and IRQ mapping", command: "mpstat -P ALL 1 3; cat /proc/interrupts  # synthetic excerpts", output: "CPU   %usr  %sys  %soft  %idle\nall    8     4     12      76\n3      2     3     93       2\nIRQ eth0-TxRx-3 -> CPU3\nflow channel-A -> RX queue 3", boundary: "The flow-to-queue mapping is separately observed in this exercise. Aggregate idle capacity does not show the busy receive CPU." },
      { title: "Application continuity", command: "feed integrity metrics  # simulated telemetry", output: "channel-A expected_seq=41021 received_seq=41046\nsequence_gap_count +17\nconsumer_age_p99_ms 120\nprocess_cpu_pct 7\nsession CONTINUOUS_TRADING", boundary: "The book cannot be assumed valid after missing increments. Low application CPU is not proof of adequate upstream receive capacity." },
      { title: "Independent path", command: "standby readiness record  # simulated evidence", output: "feed-b sequence_continuity PASS\nfeed-b consumer_age_p99_ms 1.4\nbook reconciliation PASS\nfailover authorization: incident lead\nlast recovery rehearsal: PASS", boundary: "A standby is usable only under the approved control path with continuity and state checks, not just because its connection is up." },
    ],
    steps: [
      { id: "rx-hotspot-1", phase: "Locate", requires: [0, 1], prompt: "Which boundary has the strongest evidence of pressure?", answer: 1, takeaway: "Per-queue loss and per-CPU pressure outweigh a reassuring host average.", options: [
        option("The decoder worker pool, because downstream age is high.", "Freshness is an end-to-end symptom. There is no worker backlog evidence here, while receive queue 3 has measured loss."),
        option("The mapped RX queue and its CPU; confirm the receive-path bottleneck.", "Queue 3 drops increase while its mapped CPU spends 93% in softirq. This supports a localized receive-path pressure hypothesis."),
        option("The entire venue, because sequence gaps originate in venue sequence numbers.", "The sequence identifies missing application events, not the location of loss. This one-host evidence does not establish a venue outage."),
        option("The whole server needs more cores because every UDP flow uses all queues.", "RSS commonly keeps a flow on a selected queue. More total cores do not automatically distribute a single hot flow."),
      ] },
      { id: "rx-hotspot-2", phase: "Act", requires: [2, 3], prompt: "What is the safest first operational response?", answer: 2, takeaway: "Protect trading from uncertain book state before tuning performance.", options: [
        option("Increase every RX ring immediately and keep trading on the existing book.", "A larger ring may change buffering but cannot restore lost market events. Live changes also need an approved scope and rollback."),
        option("Clear the drop counters so the incident dashboard reflects a fresh baseline.", "Resetting counters obscures evidence and does not recover the feed. Preserve the original samples and incident times."),
        option("Escalate affected trading risk and use the approved, validated standby/recovery path.", "Continuity is broken during active trading. Engage the incident lead, scope affected consumers and follow the verified failover or resynchronization procedure."),
        option("Add parser threads and defer escalation until aggregate CPU reaches 90%.", "The host average masks localized receive pressure, and parser threads cannot reconstruct missing UDP increments. Waiting prolongs exposure."),
      ] },
      { id: "rx-hotspot-3", phase: "Recover", requires: [0, 2, 3], prompt: "What evidence permits a recovery declaration?", answer: 0, takeaway: "Recovery requires valid market state and fresh consumers, not just a quiet alert.", options: [
        option("Validated book resynchronization, sequence continuity, fresh consumers and stable receive counters over a defined observation window.", "These checks cover correctness, freshness and the original bottleneck. Record which path is active and which tuning follow-up remains open."),
        option("No new gaps in the last message, even if the old book was never rebuilt.", "Absence of a new gap does not repair state corrupted by earlier missing increments. Recovery must prove a trustworthy baseline."),
        option("A green NIC link and a successful TCP ping to the host.", "Link reachability is not continuity or downstream book correctness. This is a UDP feed, and the affected data path needs direct checks."),
        option("Host CPU below its daily average and the standby process still running.", "Host averages and process existence omit per-queue health, validated state and the age of data actually consumed by trading."),
      ] },
    ],
    handoff: "Channel A lost increments at the host receive boundary; affected consumers were scoped and the incident lead engaged. Use the authorized validated path, rebuild/reconcile state, then observe continuity and freshness. Root-cause tuning remains separate from service restoration.",
    source: { label: "Linux kernel: receive-side scaling", url: "https://www.kernel.org/doc/html/latest/networking/scaling.html" },
  },
  {
    id: "cpu-quota", title: "Idle cores, late messages", subtitle: "cgroup / scheduling / backlog", minutes: 14, boundary: "Execution", level: "Core", lessons: ["threads", "capstone"],
    symptom: "The host has spare CPU, yet the decoder queue grows after a deployment. Input is continuous and consumer age rises each second.",
    scope: "The decoder service cgroup. The exchange feed is progressing; the whole host is not saturated.",
    trace: [1, 1, 2, 7, 15, 24, 37, 53, 72, 88, 105, 125],
    evidence: [
      { title: "CPU budget", command: "cat /sys/fs/cgroup/feed/cpu.max; cat /sys/fs/cgroup/feed/cpu.stat", output: "cpu.max: 100000 100000\n10-second deltas:\nnr_periods       +100\nnr_throttled     +85\nthrottled_usec   +6400000\nhost idle       62%", boundary: "cpu.max expresses a group CPU-time budget per period, not a pinned CPU. Throttled time alone is not end-to-end message delay." },
      { title: "Queue rates", command: "decoder metrics  # stable-rate synthetic interval", output: "arrival_rate     60000 events/s\nservice_rate     40000 events/s\nbacklog          120000 events\ninput seq        progressing\nreceive timestamp fresh\nconsumer age     increasing", boundary: "Drain calculations assume steady rates and no additional bursts. Timestamp comparability and sequence validity still need checking." },
      { title: "Change record", command: "deployment diff  # approved configuration history", output: "before cpu.max: 200000 100000\nafter  cpu.max: 100000 100000\nworker count: 4 (unchanged)\nincident onset follows rollout\nrollback: approved through incident lead", boundary: "Correlation supports a testable hypothesis. Confirm service identity, actual effective cgroup settings and the authorized rollback boundary." },
      { title: "Controlled recovery sample", command: "post-rollback observation  # simulated", output: "service_rate     90000 events/s\narrival_rate     60000 events/s\nbacklog at t0    120000 events\nthrottled periods 0/100\nsequence checks  PASS\nconsumer age     falling", boundary: "This is a hypothetical observation after authorized rollback, not a command executed by the training app." },
    ],
    steps: [
      { id: "cpu-quota-1", phase: "Locate", requires: [0, 1], prompt: "Why can this service fall behind while host CPU is idle?", answer: 2, takeaway: "Available host CPU and permitted cgroup CPU time are different constraints.", options: [
        option("Idle host cores prove the scheduler cannot be involved.", "A cgroup can exhaust its own quota even when other cores are idle. Check effective per-service constraints, not only host utilization."),
        option("The quota pins the service exclusively to physical CPU 1.", "The two numbers are quota and period in microseconds, not a CPU index. CPU placement is a separate affinity/cpuset concern."),
        option("The service exhausts its group CPU-time budget and is throttled, limiting processing capacity.", "The one-CPU-equivalent budget, frequent throttled periods and service rate below arrival rate support a quota-limited decoder."),
        option("Adding threads necessarily multiplies the cgroup CPU budget.", "Threads share the group budget. Extra runnable workers can consume it sooner and increase contention without increasing permitted CPU time."),
      ] },
      { id: "cpu-quota-2", phase: "Act", requires: [2], prompt: "Which change tests the strongest hypothesis with a bounded risk?", answer: 0, takeaway: "An authorized rollback with before/after evidence is stronger than arbitrary tuning.", options: [
        option("Escalate consumer freshness risk, then restore the approved previous CPU budget with rollback and monitoring.", "The observed configuration regression supports a scoped, reversible intervention. Confirm downstream correctness as well as queue drain after the change."),
        option("Disable CPU controls for every service sharing this host.", "That is broader than the evidence and changes isolation for unrelated workloads. Test the identified service boundary first under authorization."),
        option("Double the worker count while leaving the reduced quota unchanged.", "More workers do not increase the shared budget. This can change scheduling pressure while leaving the actual restriction in place."),
        option("Extend the stale-data alarm threshold until the release finishes.", "Changing the alarm does not reduce consumer age or protect trading. Treat the observed exposure and configuration issue directly."),
      ] },
      { id: "cpu-quota-3", phase: "Recover", requires: [3], prompt: "At the observed constant rates, what is the earliest ideal backlog drain time?", answer: 3, takeaway: "Backlog drains at service rate minus arrival rate: 120,000 / 30,000 = 4 seconds.", options: [
        option("1.33 seconds, because 120,000 / 90,000 ignores new arrivals.", "That calculation only works if arrivals stop. Here another 60,000 events arrive every second while the queue drains."),
        option("2 seconds, because 120,000 / 60,000 uses the incoming rate.", "Arrival rate adds work. The usable drain rate is the excess of processing capacity over incoming load."),
        option("The backlog cannot drain while any new events arrive.", "It can drain while service capacity exceeds arrivals. This interval has 30,000 events/s of net drain capacity."),
        option("4 seconds under steady rates, followed by freshness and continuity checks.", "90,000 - 60,000 leaves 30,000 events/s for backlog. Four seconds is an ideal estimate, not a guarantee or sufficient recovery proof."),
      ] },
    ],
    handoff: "The decoder's effective CPU budget halved after deployment, with throttling and backlog growth. After authorized rollback, processing exceeded arrivals by 30k events/s. Allow at least the estimated drain interval, verify consumer freshness and sequence state, and retain the configuration diff.",
    source: { label: "Linux kernel: cgroup v2 CPU controller", url: "https://docs.kernel.org/admin-guide/cgroup-v2.html" },
  },
  {
    id: "edge-trigger", title: "Connected, readable, not reading", subtitle: "epoll / nonblocking I/O / stream framing", minutes: 14, boundary: "Network", level: "Hard", lessons: ["sockets", "event-loop", "unix"],
    symptom: "One TCP feed stops publishing after a reader change. The socket remains established, heartbeats from the process continue, and its receive queue contains bytes.",
    scope: "A single nonblocking TCP reader with EPOLLET enabled. Source-side connectivity is not enough to establish application progress.",
    trace: [1, 1, 1, 5, 24, 60, 95, 130, 165, 200, 235, 270],
    evidence: [
      { title: "Socket and source", command: "ss -tinp  # synthetic excerpt", output: "ESTAB Recv-Q=98304 Send-Q=0\npeer send sequence advances\nretransmission delta=0\nNIC drop delta=0\nlast consumer publish age=270ms", boundary: "Recv-Q is unread socket data, not the application work queue. An established transport connection does not prove the reader consumed data." },
      { title: "Reader trace", command: "controlled reproduction trace  # not a live strace attach", output: "epoll_wait -> EPOLLIN\nrecv(fd, buffer, 4096, 0) -> 4096\nreturn to epoll_wait\n(no recv call reaching EAGAIN)\nsocket mode: O_NONBLOCK | EPOLLET", boundary: "Tracing a live low-latency process may perturb timing. This trace comes from a controlled reproduction with known reader settings." },
      { title: "Parser contract", command: "protocol contract and test sample", output: "TCP transport: byte stream\nmessage: length prefix + payload\nread #1: complete message A + first 12 bytes of B\nread #2: rest of B + message C\nparser must preserve incomplete frame bytes", boundary: "A TCP read can contain part of a message or several messages. TCP delivery order does not supply application framing." },
      { title: "Mitigation and validation", command: "change runbook  # simulated", output: "prior reader: verified rollback available\nnew handler: bounded drain / local ready queue\nreproduction: burst + partial reads + EAGAIN\nother channels: fairness checks required\ntrading data validity: resync and freshness checks", boundary: "If a handler deliberately yields before EAGAIN, it needs an explicit mechanism to resume draining; do not assume another edge arrives." },
    ],
    steps: [
      { id: "edge-trigger-1", phase: "Locate", requires: [0, 1], prompt: "Which explanation best matches the reader stall?", answer: 0, takeaway: "An edge-triggered reader must not rely on a new edge for data it left unread.", options: [
        option("The reader returned to waiting with unread bytes and no explicit continuation.", "The trace shows one read, not draining to EAGAIN. In edge-triggered mode, waiting for another notification can leave already-buffered data unprocessed."),
        option("TCP stopped acknowledging data because Recv-Q is nonzero.", "A nonzero Recv-Q means data is available to the application. It is not proof that acknowledgements stopped or the peer failed."),
        option("Every EPOLLIN notification guarantees exactly one complete protocol message.", "Readiness means an operation may make progress. It says neither how many application messages exist nor whether a complete frame is available."),
        option("The process heartbeat proves the market-data reader cannot be stalled.", "A heartbeat can run on another thread or path. It establishes process activity, not progress of this socket's reader and parser."),
      ] },
      { id: "edge-trigger-2", phase: "Act", requires: [2, 3], prompt: "Which mitigation respects transport and operational constraints?", answer: 3, takeaway: "Restore a known-good reader; validate draining, framing and fairness in controlled tests.", options: [
        option("Disable nonblocking mode so each recv waits for an entire application message.", "Blocking reads do not create message boundaries on TCP and can stall unrelated work on an event-loop thread."),
        option("Increase SO_RCVBUF and declare the reader bug resolved.", "More buffering can delay pressure but does not correct the missing drain/continuation logic. Consumer freshness can continue worsening."),
        option("Treat each returned buffer as one full message and discard trailing bytes.", "TCP can split or combine protocol messages. Discarding incomplete frames corrupts the feed and can conceal the original problem."),
        option("Follow the approved rollback while protecting affected consumers; test nonblocking drain, retained partial frames and fair continuation.", "A controlled rollback restores known behavior. A durable fix must handle EAGAIN and framing without starving other ready sockets."),
      ] },
      { id: "edge-trigger-3", phase: "Recover", requires: [0, 3], prompt: "Which verification is sufficient to support service recovery?", answer: 1, takeaway: "A healthy reader progresses at the socket, parser and consumer boundaries.", options: [
        option("The next epoll_wait returns a notification at least once.", "A single notification does not prove all buffered data is handled or that the reader remains fair under sustained load."),
        option("Burst/partial-read tests pass, unread data drains, parsed sequences remain valid, and all affected consumers are fresh over the agreed window.", "This joins reader correctness, protocol state and end-to-end freshness. Monitor other channels so the fix does not move the stall elsewhere."),
        option("The TCP session was never disconnected, so no recovery work is needed.", "The failure was application progress on an established socket. Connection continuity does not validate parsed state or consumer age."),
        option("The parser publishes one new event, even if its old partial-frame buffer was lost.", "One output event does not establish framing correctness or continuity across the incident. Lost parser state requires protocol-specific recovery."),
      ] },
    ],
    handoff: "The feed transport stayed connected, but an EPOLLET reader left buffered bytes without a continuation. Protect consumers and use the authorized rollback. Validate partial-frame retention, burst draining, EAGAIN handling, fairness and downstream state before closure.",
    source: { label: "Linux manual: epoll edge-triggered behavior", url: "https://man7.org/linux/man-pages/man7/epoll.7.html" },
  },
  {
    id: "audit-io", title: "When the audit path blocks trading", subtitle: "fsync / thread waits / durability", minutes: 12, boundary: "Unix", level: "Hard", lessons: ["storage", "threads", "unix"],
    symptom: "Market-data input stays fresh, but publish latency jumps after an audit-writer rollout. The main loop has low CPU and long waits.",
    scope: "A synchronous durability operation on the main event-loop thread. Audit requirements remain in force during the incident.",
    trace: [2, 2, 3, 9, 30, 58, 74, 95, 102, 115, 137, 160],
    evidence: [
      { title: "Boundary timings", command: "application spans  # synthetic same-clock timings", output: "receive -> parse p99     0.8ms\nparse -> audit p99       0.2ms\naudit durable p99        148ms\naudit -> publish p99     1.0ms\nconsumer age p99         160ms", boundary: "Spans use a comparable local clock in this exercise. Do not sum independently aggregated percentiles as if they were one trace." },
      { title: "Thread wait sample", command: "approved low-rate stack sample  # illustrative", output: "main-event-loop -> audit_commit -> fsync\nprocess CPU 6%\nblock I/O pressure increased\naudit writer rollout at onset\nNIC drops 0; receive sequences contiguous", boundary: "A sampled stack is evidence of a wait path, not a complete causal proof. Correlate latency and device health without intrusive unapproved tracing." },
      { title: "Durability policy", command: "audit control record  # synthetic policy", output: "required records may not be silently dropped\nwrite() success != power-loss durability\nfsync errors must propagate\nqueue capacity: bounded\noverload: approved trading control path", boundary: "This exercise's policy is illustrative. Real recording obligations and durability guarantees must come from the organization's documented controls." },
      { title: "Recovery constraints", command: "incident runbook  # synthetic", output: "rollback audit writer: available and authorized\naudit storage health: check latency + errors\nasynchronous redesign: separate reviewed change\nreconcile durable record sequence before closure\nvalidate downstream age + queue drain", boundary: "Decoupling a writer changes acknowledgement semantics. A buffered success must never be presented as a durable success unless the contract permits it." },
    ],
    steps: [
      { id: "audit-io-1", phase: "Locate", requires: [0, 1], prompt: "Which boundary should lead the investigation?", answer: 1, takeaway: "Low CPU can mean blocked progress, especially when durability work runs on the event loop.", options: [
        option("The NIC, because every latency incident begins at packet arrival.", "Receive and parse are timely, drops are absent, and the measured delay is at audit durability. Follow the boundary evidence rather than a fixed checklist order."),
        option("The synchronous audit/storage wait on the event loop.", "Timing and stack evidence agree on the fsync path. Check storage health and the rollout while preserving required audit behavior."),
        option("The CPU scheduler, because low utilization always implies throttling.", "Low utilization can result from I/O or lock waits. There is direct storage-wait evidence and no CPU quota evidence in this case."),
        option("The market session calendar, because a closed venue always raises publish latency.", "The supplied input is actively progressing. Session context matters, but it does not explain the measured audit wait here."),
      ] },
      { id: "audit-io-2", phase: "Act", requires: [2, 3], prompt: "What preserves operational safety while restoring service?", answer: 0, takeaway: "Restore service without silently weakening the audit contract.", options: [
        option("Escalate trading/audit risk, use the approved writer rollback or degraded-mode controls, and preserve required records.", "This addresses both service freshness and recording integrity. Any durability redesign belongs in a separately reviewed change with explicit overload behavior."),
        option("Remove fsync calls immediately and report each successful write as durable.", "write() acceptance and durable persistence are different guarantees. Silently changing the acknowledgement contract can create false audit evidence."),
        option("Send required records into an unlimited in-memory queue until the disk recovers.", "An unbounded queue risks memory exhaustion and loses buffered records on failure. Capacity, durability and overload behavior need explicit limits."),
        option("Drop the oldest audit records whenever consumer latency rises.", "The exercise's policy explicitly forbids silently dropping required records. A latency objective does not override the control boundary."),
      ] },
      { id: "audit-io-3", phase: "Recover", requires: [2, 3], prompt: "Which evidence supports closing the incident?", answer: 2, takeaway: "Audit integrity and timely application progress must both recover.", options: [
        option("The process restarted successfully and CPU is under 10%.", "A restart and low CPU do not establish audit durability, error-free storage or fresh downstream consumers."),
        option("The queue is empty, even if it was cleared by discarding required records.", "An empty queue is ambiguous without accounting for its contents. Reconcile required records and ensure errors were not hidden."),
        option("Required audit records reconcile durably, storage errors are resolved, and queues plus consumer freshness remain healthy over a defined window.", "Recovery spans correctness, durability and latency. Preserve the incident timeline and separate remaining design work from the restored service."),
        option("write() latency is low after moving every record into user-space buffering.", "Fast buffering measures a different boundary from persistence. It does not prove the original durability requirement is met."),
      ] },
    ],
    handoff: "The main loop waited on audit durability after a writer rollout. Escalate both trading freshness and recording risk, follow the authorized rollback, and reconcile durable records. Recovery must prove bounded queues, resolved I/O errors and fresh downstream data.",
    source: { label: "Linux manual: fsync and durability", url: "https://man7.org/linux/man-pages/man2/fsync.2.html" },
  },
  ...advancedInfrastructureLabs,
];

export const infrastructureLabById = new Map(infrastructureLabs.map((lab) => [lab.id as string, lab]));
