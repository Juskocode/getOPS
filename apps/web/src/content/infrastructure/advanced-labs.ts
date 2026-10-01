import type { InfrastructureLab } from "./labs";

const option = (label: string, reason: string) => ({ label, reason });

export const advancedInfrastructureLabs: InfrastructureLab[] = [
  {
    id: "fd-exhaustion", title: "The reconnect that never completes", subtitle: "File descriptors / process limits / resource ownership",
    minutes: 16, boundary: "Unix", level: "Hard", lessons: ["unix", "sockets"],
    symptom: "An existing feed still publishes, but its recovery session cannot reconnect. New log files also fail to open after repeated reconnect attempts.",
    scope: "One feed-handler process. A separate collector can inspect its state; host-wide file-table exhaustion has not been established.",
    trace: [2, 2, 3, 12, 40, 80, 140, 220, 310, 400, 510, 620],
    evidence: [
      { title: "Failure boundary", command: "application error record  # synthetic", output: "socket(AF_INET, SOCK_STREAM, 0) -> -1 EMFILE\nopen(audit-rollover.log) -> -1 EMFILE\nexisting feed socket: still receiving\nnew recovery connection: never created\nprocess CPU: 9%", boundary: "EMFILE points to the calling process's descriptor limit. It is not the same as host-wide ENFILE or proof of a remote connection refusal." },
      { title: "Effective limits", command: "cat /proc/4321/limits  # external collector excerpt", output: "Max open files     soft=1024  hard=4096\n/proc/4321/fd count: 1024\nallocated descriptor numbers: 0..1023\ninteractive shell ulimit -n: 65536\nhost file-table capacity: available", boundary: "Inspect the target process, not the operator's shell. In this dense allocation, all descriptor slots below the effective soft limit are occupied." },
      { title: "Resource lifecycle", command: "controlled reconnect test  # synthetic counters", output: "baseline descriptors: 84\n100 failed reconnect cycles: 384 descriptors\n300 descriptors remain after connections close\nopen descriptors: sockets + timer/event handles\nrollback candidate: ownership cleanup fix", boundary: "This test supports a lifecycle leak. Increasing a limit can buy time but does not establish correct cleanup or bound future resource growth." },
      { title: "Containment runbook", command: "approved recovery constraints  # illustrative", output: "incident lead: engaged\nprotect affected trading from stale recovery data\nstandby readiness: reconcile before transfer\nbounded process restart/rollback: authorized\nretain descriptor samples and reconnect counters\nno arbitrary close(fd) against live process", boundary: "A restart can discard subscriptions, buffered events and session state. Follow the control path and re-establish continuity before trusting outputs." },
    ],
    steps: [
      { id: "fd-exhaustion-1", phase: "Locate", requires: [0, 1], prompt: "Which conclusion is justified by the failed calls and effective limits?", answer: 2, takeaway: "An established socket can remain useful while descriptor exhaustion prevents new resources.", options: [
        option("The exchange rejected the TCP connection because the host file table is full.", "The local socket creation failed before a connection attempt. EMFILE and the process limit localize the constraint without proving a venue or host-wide failure."),
        option("The process can open 65,536 descriptors because that is the current shell setting.", "The shell is a different process. An already-running service retains its own effective resource limits, which must be inspected directly."),
        option("The process exhausted descriptor slots below its soft limit; the existing connection is not proof that reconnect works.", "The dense 0..1023 allocation and EMFILE agree. Already-open descriptors can still operate even though socket and file creation now fail."),
        option("The hard limit of 4,096 is immediately enforced, so 1,024 open descriptors cannot explain the error.", "The soft limit is the current enforced ceiling. The hard limit bounds how that limit may be raised; it does not automatically grant extra slots."),
      ] },
      { id: "fd-exhaustion-2", phase: "Act", requires: [2, 3], prompt: "What is the safest response to the reconnect loop and resource growth?", answer: 0, takeaway: "Contain the trading impact and restore a bounded resource lifecycle.", options: [
        option("Escalate affected consumers and use the authorized standby/restart or rollback, retaining evidence and validating state recovery.", "This addresses the immediate exposure and known lifecycle regression. Any temporary limit increase needs an explicit time bound, approval and leak follow-up."),
        option("Raise all host limits permanently and treat the absence of the next EMFILE as a fix.", "The controlled test still leaks resources. A broader limit hides the symptom temporarily and changes unrelated capacity boundaries without resolving ownership."),
        option("Close arbitrary descriptors from a debugger until the count falls below 1,024.", "Descriptor numbers may represent critical sockets, files or synchronization handles. Uncontrolled closure can corrupt live service behavior and the recovery path."),
        option("Restart repeatedly without restoring subscriptions because existing TCP traffic proves data integrity.", "A restart resets process state. Transport reachability does not establish subscriptions, sequence recovery or the correctness of downstream market state."),
      ] },
      { id: "fd-exhaustion-3", phase: "Recover", requires: [2, 3], prompt: "What demonstrates that the failure is resolved rather than postponed?", answer: 1, takeaway: "Prove resource cleanup under repeated reconnects and correct downstream recovery.", options: [
        option("Descriptor count is below the new limit immediately after restart.", "A clean starting count is expected after restart and does not establish cleanup over repeated failures. Reproduce the reconnect lifecycle before closure."),
        option("Repeated failed and successful reconnects return to a bounded baseline; new sockets/files work, and consumer continuity and freshness recover.", "Lifecycle tests address the leak while data checks address trading consequences. Observe the effective limits and resource slope over a defined window."),
        option("The process is alive and its original TCP socket still receives bytes.", "Those were also true during the incident. Recovery must include creation of new resources and successful reconstruction of the affected session."),
        option("The interactive shell shows a high ulimit after editing a configuration file.", "That does not prove the running service adopted the setting, nor that descriptor ownership or consumer state has recovered."),
      ] },
    ],
    handoff: "Local descriptor exhaustion prevented recovery socket creation and log rollover. Controlled reconnects showed leaked handles. Use the authorized bounded recovery path, preserve lifecycle evidence, and verify cleanup across repeated cycles alongside resubscription, continuity and freshness.",
    source: { label: "Linux manual: process resource limits", url: "https://man7.org/linux/man-pages/man2/getrlimit.2.html" },
  },
  {
    id: "lock-convoy", title: "More threads, less progress", subtitle: "Mutex contention / off-CPU time / critical sections",
    minutes: 18, boundary: "Execution", level: "HFT", lessons: ["threads", "storage", "capstone"],
    symptom: "Doubling decoder workers from four to eight made tail latency worse. The host is mostly idle and many workers appear in futex waits.",
    scope: "A shared decoder queue protected by one mutex. Futex waiting alone does not identify a deadlock or prove a faulty mutex implementation.",
    trace: [1, 2, 4, 8, 15, 28, 46, 70, 98, 135, 180, 230],
    evidence: [
      { title: "Thread states", command: "approved off-CPU sample  # synthetic, not a live attach", output: "workers 701..707: waiting on queue mutex\nowner thread 700: inside diagnostic log flush\nowner still releases lock intermittently\nprocess CPU 12%; cgroup throttling 0\nno circular wait established", boundary: "Futexes support several synchronization mechanisms. Attribute waits to a specific lock and owner before labeling contention, starvation or deadlock." },
      { title: "Critical-section timing", command: "controlled instrumentation  # paired observations", output: "before rollout mutex hold p99: 0.04ms\nafter rollout mutex hold p99: 45ms\nnew behavior: synchronous log flush under mutex\nqueue growth: +12000 events/s\ninput continuity: valid; consumer age rising", boundary: "The test links a longer critical section to serialized progress. Percentiles describe a distribution, not a duration experienced by every message." },
      { title: "Change options", command: "reviewed rollback record  # illustrative", output: "prior worker count: 4\nnew worker count: 8\nlogging-under-lock change: same release\nknown-good rollback: approved\nlock removal: not approved\ndiagnostic logging: distinct from mandatory audit", boundary: "Changing worker count alone does not isolate the logging change. Removing synchronization without a correctness design can introduce data races." },
      { title: "Validation plan", command: "controlled workload plan  # synthetic", output: "same input distribution and burst profile\ncompare lock hold + wait distributions\nmeasure throughput, consumer age and sequence state\nverify shared-state invariants under concurrency\ncheck bounded logging and backpressure\nretain required audit records", boundary: "A lower average latency can hide worse tails or broken ordering. A faster run with corrupt shared state is not a successful optimization." },
    ],
    steps: [
      { id: "lock-convoy-1", phase: "Locate", requires: [0, 1], prompt: "What does this evidence support, and what remains unproven?", answer: 2, takeaway: "A slow lock owner can serialize many workers while total CPU stays low.", options: [
        option("A permanent deadlock is proven because any futex wait means no thread can progress.", "The owner still releases the lock, and no wait cycle is established. Futex waits can be normal; here paired ownership evidence supports contention."),
        option("The exchange must be slow because idle host CPU excludes a local bottleneck.", "Input is progressing while workers wait behind a long critical section. Idle CPU does not exclude blocking or serialization inside the application."),
        option("Logging extended a shared critical section and produced contention; a permanent deadlock is not established.", "Owner attribution, hold-time growth and continuing lock releases support a serialization bottleneck. They do not establish a circular wait or permanent deadlock."),
        option("The CPU quota is the strongest cause because eight threads always exhaust one shared budget.", "There is no throttling evidence in this case. More threads can amplify lock contention without changing the service's CPU-time budget."),
      ] },
      { id: "lock-convoy-2", phase: "Act", requires: [2, 3], prompt: "Which intervention preserves correctness and tests the supported hypothesis?", answer: 1, takeaway: "Use a bounded rollback; redesign work inside the critical section with explicit ownership.", options: [
        option("Remove the mutex and rely on low observed CPU to avoid concurrent access.", "Utilization does not provide synchronization. Removing the lock without another ownership design risks data races and invalid market state."),
        option("Escalate freshness risk, apply the approved known-good rollback, then validate a design that removes blocking diagnostics from the critical section.", "The rollback restores known behavior. Follow-up work should preserve shared-state correctness, bound logging and measure both lock waits and consumer freshness."),
        option("Add sixteen more workers without changing the shared critical section.", "Additional workers still serialize on the same mutex and may add wakeups and contention. They do not shorten the owner's blocking work."),
        option("Disable all diagnostic and mandatory audit output without recording the change.", "Diagnostic performance and required audit retention are different control boundaries. A broad undocumented disablement introduces correctness and audit risk."),
      ] },
      { id: "lock-convoy-3", phase: "Recover", requires: [1, 3], prompt: "Which result would support declaring recovery?", answer: 3, takeaway: "Concurrency improvements must preserve invariants while reducing the measured contention.", options: [
        option("Average mutex wait falls, even though consumer p99 and sequence violations increase.", "A better average at one boundary is not recovery if tails or correctness worsen. Check the consumers and shared-state invariants under the same workload."),
        option("The worker count returns to four, without observing the logging path.", "Restoring a count does not prove the extended critical section is gone. Validate effective behavior and downstream outcomes, not only configuration."),
        option("No futex calls appear in one brief sample, so all synchronization is correct.", "Sampling absence is weak negative evidence. Some uncontended synchronization does not enter the kernel, and one short interval can miss contention."),
        option("Comparable load shows bounded lock waits and queues, valid shared-state/sequence checks, and fresh consumers over the observation window.", "This links the changed mechanism to both performance and correctness. Keep logging capacity and audit checks in the follow-up evidence."),
      ] },
    ],
    handoff: "Workers queued behind a mutex whose owner performed synchronous diagnostic flushing. The evidence supports contention, not a proven deadlock. Restore the known-good path and validate bounded logging, critical-section duration, shared-state invariants and consumer tails under comparable load.",
    source: { label: "Linux manual: futex synchronization", url: "https://man7.org/linux/man-pages/man2/futex.2.html" },
  },
];
