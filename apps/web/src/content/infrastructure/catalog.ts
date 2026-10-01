import type { InfraLesson } from "./types";

export const infrastructureLessons: InfraLesson[] = [
  {
    id: "nic", title: "From wire to kernel", subtitle: "NIC queues, DMA, interrupts and NAPI",
    stage: "Ingress", minutes: 25, prerequisite: null, connectsTo: "feed",
    objectives: ["Locate loss before a socket receives data", "Distinguish RSS from software steering", "Explain burst pressure without blaming average CPU"],
    concepts: [
      { title: "Packets enter a queue, not your callback", body: "On a conventional Linux receive path, the NIC places received data into host memory through DMA and uses receive descriptors to track buffers. Driver processing and protocol work still precede the application. A link-up indicator establishes neither buffer availability nor successful delivery.", operational: "Correlate driver-specific per-queue counters with application sequence gaps over the same interval. A counter name alone does not establish exactly where a packet was lost." },
      { title: "RSS chooses a receive queue", body: "Receive-side scaling commonly hashes flow headers into hardware queues. One hot flow can concentrate work on one queue even when the host has many idle cores. RPS is software steering later in the receive path; it is not another name for RSS.", operational: "Compare per-queue rates and per-CPU softirq load before proposing more workers. Changing flow placement can trade load balance for locality." },
      { title: "NAPI balances notifications and polling", body: "In a typical interrupt-driven NAPI path, an interrupt schedules bounded polling work. The driver drains work under a budget rather than requiring a fresh interrupt for every packet. Busy-polling and kernel-bypass deployments have different execution paths and must be identified explicitly.", operational: "Map the actual driver, queue and processing CPU. Interrupt coalescing can trade batching efficiency against latency; a universal low-latency setting does not exist." },
    ],
    commands: [
      { command: "ethtool -S eth0", output: "# Selected counters, two samples 1 second apart\nrx_queue_3_packets    840000 -> 920000\nrx_queue_3_drops          0 -> 140\nrx_queue_4_drops          0 -> 0", interpretation: "Queue 3 records 140 additional drops while receiving 80,000 packets. This localizes evidence to the NIC/driver queue boundary, not an exchange outage.", boundary: "Interface names and statistics vary by driver. Confirm the driver's counter meaning, reset time and matching feed path. This read-only query may require privileges." },
      { command: "mpstat -P ALL 1 3", output: "# Simplified interval sample\nCPU   %usr  %sys  %soft  %idle\n  3    3.0   5.0   88.0    4.0\n  4    5.0   2.0    1.0   92.0", interpretation: "CPU 3 is dominated by softirq work; CPU 4 is mostly idle. Host-average utilization conceals the imbalance.", boundary: "Correlate with /proc/interrupts and queue mapping. Softirq load is not proof of one specific flow; preserve evidence before any affinity change." },
    ],
    questions: [
      { id: "nic-1", prompt: "One feed has gaps. Link is up, average CPU is 18%, queue 3 drops rise and CPU 3 softirq is 88%. What is the best next check?", options: [
        { label: "Increase every application worker pool because the host has spare CPU.", reason: "The evidence points upstream of the worker pool. More workers may not drain the constrained receive queue." },
        { label: "Map the feed to RX queue and CPU, then correlate queue-drop deltas with gaps.", reason: "This tests the suspected receive bottleneck at the same time and scope as the symptom." },
        { label: "Ask the exchange to resend all symbols because TCP should prevent gaps.", reason: "Transport is not specified, and feed sequence gaps are not equivalent to TCP byte loss." },
        { label: "Disable interrupt coalescing immediately to eliminate batching.", reason: "This is an untested live change that may increase CPU pressure. Establish the bottleneck first." },
      ], answer: 1, takeaway: "Measure per queue and per CPU. Aggregate headroom is not path headroom." },
      { id: "nic-2", prompt: "Why can one large flow remain a bottleneck after enabling RSS on eight RX queues?", options: [
        { label: "RSS normally distributes each consecutive packet to a different CPU.", reason: "Common RSS hashing is flow-oriented; it is not per-packet round robin." },
        { label: "RSS performs application decoding, which must be single-threaded.", reason: "RSS selects receive queues; it does not decode the application's market-data protocol." },
        { label: "A stable flow hash can keep the hot flow on one queue.", reason: "More queues can spread many flows without splitting a single elephant flow." },
        { label: "RSS only changes transmit queues and cannot affect receive traffic.", reason: "RSS is receive-side scaling; transmit steering is a separate concern." },
      ], answer: 2, takeaway: "Flow distribution and flow parallelism are different problems." },
      { id: "nic-3", prompt: "Which statement about a conventional NAPI receive path is most accurate?", options: [
        { label: "An interrupt can schedule budgeted polling that processes multiple packets.", reason: "NAPI combines event notification with bounded polling; one interrupt need not mean one packet." },
        { label: "Every packet must trigger exactly one hardware interrupt.", reason: "Batching and polling break that one-to-one assumption." },
        { label: "NAPI bypasses both the kernel and the NIC driver.", reason: "NAPI is a kernel networking mechanism, not a kernel-bypass stack." },
        { label: "NAPI guarantees that socket buffers can never overflow.", reason: "Downstream queues can still fill when producers exceed service capacity." },
      ], answer: 0, takeaway: "Understand the deployed receive mode before interpreting interrupt counts." },
      { id: "nic-4", prompt: "You see rx_dropped=900 after an incident. What is still missing before attributing loss?", options: [
        { label: "Nothing; the total proves 900 incident packets were lost at the NIC.", reason: "An accumulated count may include old events and may have driver-specific semantics." },
        { label: "Only a simultaneous zero value in the switch's discard counter.", reason: "An upstream observation does not date or attribute a local accumulated counter." },
        { label: "Only the application's total gap count since process startup.", reason: "Two lifetime totals can cover different intervals, resets and feed scopes." },
        { label: "Counter semantics, interval delta, resets and correlation with the affected channel.", reason: "These checks convert a historical total into scoped evidence without overstating causality." },
      ], answer: 3, takeaway: "Counters need scope, time and semantics." },
    ],
    interview: { prompt: "Walk me from the NIC to a feed handler.", answer: "For a conventional Linux path, I trace the receive queue and DMA buffers, driver/NAPI processing, IP and transport handling, the socket queue, then the application's reads and decoder. I compare loss and age at each boundary. RSS, affinity and NUMA can affect placement; kernel bypass changes the path, so I confirm the architecture first." },
    sources: [{ label: "Kernel: networking scaling / RSS / RPS", url: "https://docs.kernel.org/networking/scaling.html" }, { label: "Kernel: NAPI", url: "https://docs.kernel.org/networking/napi.html" }],
  },
  {
    id: "sockets", title: "Transport is not data truth", subtitle: "TCP, UDP, socket queues and framing",
    stage: "Ingress", minutes: 25, prerequisite: "nic", connectsTo: "feed",
    objectives: ["Distinguish stream and datagram semantics", "Interpret receive queues without overclaiming", "Separate transport acknowledgements from order acknowledgements"],
    concepts: [
      { title: "A TCP stream has no market-message boundaries", body: "TCP delivers an ordered byte stream, not application records. One read can contain half a message or several messages. The parser needs explicit framing and must retain incomplete bytes. Successful send or TCP acknowledgement is not proof that a venue accepted an order.", operational: "Track bytes received separately from complete events decoded and orders acknowledged. A healthy connection may carry unusable or incompletely processed state." },
      { title: "UDP preserves datagrams, not reliability", body: "UDP is message-oriented, but loss, duplication and reordering must be handled by the application protocol when required. A market-data sequence number belongs to its documented feed scope. Truncating a datagram because the receive buffer is too small is not normal stream reassembly.", operational: "Inspect receive errors, sequence continuity and recovery state. Neither a multicast membership nor visible packets proves that the consumer has a valid book." },
      { title: "Backpressure can hide behind a green socket", body: "For an established TCP socket, accumulated receive bytes can mean the process is not draining input quickly enough. Flow control can slow the peer. Listening-socket queue fields have different semantics, and a Send-Q backlog has a different interpretation from Recv-Q.", operational: "Compare queue trend, process scheduling, parser throughput and downstream queue age. Increasing buffers alone can turn loss into longer delay." },
    ],
    commands: [
      { command: "ss -tinp", output: "# Established connection, simplified\nState Recv-Q Send-Q Local            Peer\nESTAB 262144      0 10.0.0.5:41000   192.0.2.10:9000\n rtt:0.25/0.03 retrans:0/0", interpretation: "Bytes are waiting to be read locally on this established connection. Low RTT and no observed retransmits do not make the application current.", boundary: "Sample again, identify the owning process and compare its read rate. Process metadata may require privilege; peer addresses here are fictional." },
      { command: "nstat -az UdpInErrors UdpRcvbufErrors", output: "# Absolute counters; compare a later sample\nUdpInErrors       410\nUdpRcvbufErrors   410", interpretation: "Receive-buffer errors are one possible cause of UDP loss on this host/network namespace.", boundary: "These are not per-symbol counters and may overlap semantically. Do not add them together as independent losses; compare deltas with socket and feed evidence." },
    ],
    questions: [
      { id: "sockets-1", prompt: "Two market messages are written to a TCP connection. What may a receiver's next read return?", options: [
        { label: "Exactly one complete message, because each write defines a record.", reason: "TCP does not preserve write boundaries." },
        { label: "Both messages only when TCP_NODELAY is enabled.", reason: "TCP_NODELAY affects Nagle behavior, not message framing guarantees." },
        { label: "A partial message, one message or bytes from multiple messages.", reason: "The application must frame the byte stream and handle partial reads." },
        { label: "Only the newest message, because TCP conflates updates.", reason: "TCP is an ordered stream and does not apply market-data conflation." },
      ], answer: 2, takeaway: "Byte progress and decoded-event progress need different metrics." },
      { id: "sockets-2", prompt: "A socket is ESTAB, RTT is low and Recv-Q keeps growing. Which conclusion is best supported?", options: [
        { label: "The exchange has confirmed all orders and market data is current.", reason: "Socket state and RTT say nothing about business-level acknowledgements or decoder freshness." },
        { label: "Local input is accumulating; check scheduling, read rate and downstream blocking.", reason: "This follows the observable queue boundary without prematurely naming a cause." },
        { label: "The physical link must be down despite the socket state.", reason: "The given evidence does not establish a link failure." },
        { label: "A larger receive buffer will necessarily lower latency.", reason: "A larger queue can hold more old work while leaving the service bottleneck intact." },
      ], answer: 1, takeaway: "Connection availability does not imply consumption." },
      { id: "sockets-3", prompt: "A UDP feed jumps from sequence 800 to 803. What is the safe interpretation?", options: [
        { label: "The book is valid because UDP automatically retransmits 801 and 802.", reason: "UDP itself does not provide retransmission." },
        { label: "Two exchange trades are definitely missing.", reason: "Sequence scope and event semantics are unknown; a gap need not correspond to two trades." },
        { label: "Close the whole venue immediately without checking scope.", reason: "Containment must follow the relevant control policy and verified affected scope." },
        { label: "Continuity may be broken; apply feed-specific gap/reorder rules and recovery controls.", reason: "State validity depends on the protocol, baseline and scoped sequence continuity." },
      ], answer: 3, takeaway: "Transport and market-data recovery are different layers." },
      { id: "sockets-4", prompt: "send() succeeds for a new order, then the connection fails before an application response. What do you know?", options: [
        { label: "The local stack accepted bytes; venue order state is still uncertain.", reason: "A successful send is not an exchange acceptance. Reconcile before any policy-controlled retry." },
        { label: "The order is definitely live because send returned success.", reason: "That return value does not prove remote business processing." },
        { label: "The order is definitely absent because the connection failed.", reason: "The venue could have processed the request before the failure." },
        { label: "Retrying with a fresh identifier cannot duplicate exposure.", reason: "A new ID can create a second live order if the first was accepted." },
      ], answer: 0, takeaway: "Unknown order state is a risk-control problem, not just a networking retry." },
    ],
    interview: { prompt: "Why can TCP be healthy while the trading application is stale?", answer: "The transport may be delivering bytes while the process is unscheduled, blocked, unable to frame a message, or waiting behind a downstream queue. I compare socket receive backlog, decoded-event rate, timestamps and sequence validity. For orders, only the application lifecycle establishes acceptance or execution." },
    sources: [{ label: "Linux man-pages: tcp(7)", url: "https://man7.org/linux/man-pages/man7/tcp.7.html" }, { label: "Linux man-pages: udp(7)", url: "https://man7.org/linux/man-pages/man7/udp.7.html" }, { label: "Linux man-pages: read(2)", url: "https://man7.org/linux/man-pages/man2/read.2.html" }],
  },
  {
    id: "event-loop", title: "I/O without illusions", subtitle: "Blocking, readiness, epoll and completions",
    stage: "Execution", minutes: 30, prerequisite: "sockets", connectsTo: "capacity",
    objectives: ["Explain readiness versus completion", "Reason about partial reads and EAGAIN", "Recognize event-loop starvation"],
    concepts: [
      { title: "Readiness is permission to try", body: "epoll reports readiness on file descriptors. It does not mean that a full application message is ready or that a read has completed. Nonblocking reads can return available bytes, EOF or an error. Edge-triggered designs normally drain available work until EAGAIN, with a deliberate fairness strategy.", operational: "A decoder that consumes one frame and waits for another edge can leave readable bytes stranded. Capture the ready/read/rearm sequence, not only the connection state." },
      { title: "Async submission is not successful completion", body: "Completion-based interfaces such as io_uring separate submission from the operation's result. Completion entries still need inspection for errors and short results. Buffer lifetimes, cancellation and backpressure remain application responsibilities; using an asynchronous API does not make every operation nonblocking internally.", operational: "Measure pending operations and completion age. Investigate whether the consumer of completions is itself being starved." },
      { title: "One slow callback can hold a whole loop", body: "An event loop serializes work on its execution thread. A synchronous disk write, long parser batch or contended lock can delay unrelated sockets even with idle host cores. Queueing accumulates when arrival exceeds service; bounded work and offloading require explicit ordering and overload rules.", operational: "Compare loop lag with callback duration and oldest pending work. Moving work to a pool must not silently reorder a sequenced feed." },
    ],
    commands: [
      { command: "strace -c -p 4242", output: "# Synthetic summary after a bounded capture\n% time   calls   errors   syscall\n 82.0       40        0   fsync\n 12.0      400        0   epoll_wait\n  6.0      700       12   recvfrom", interpretation: "Synchronous durability calls consume much of the observed syscall time. This motivates tracing whether they run on the receive-loop thread.", boundary: "Attaching a tracer can perturb a latency-sensitive process and may need privilege. Obtain approval, bound collection, and prefer existing low-overhead telemetry first." },
      { command: "# Recorded event-loop trace (illustrative)", output: "12:00:00.001 EPOLLIN fd=7\n12:00:00.002 recv=128 bytes (one frame)\n12:00:00.003 pending socket bytes=256\n12:00:00.004 epoll_wait entered; mode=ET", interpretation: "The edge-triggered loop returns to waiting while input remains. Inspect its drain or explicit rescheduling policy.", boundary: "This is a training trace, not an executable command. Confirm actual trigger mode, concurrent readers and application scheduling before diagnosing a lost-edge bug." },
    ],
    questions: [
      { id: "event-loop-1", prompt: "An edge-triggered epoll consumer reads one frame, leaves bytes queued and waits again. What should you inspect?", options: [
        { label: "Whether the TCP keepalive interval is shorter than a millisecond.", reason: "Keepalive does not fix the application's readiness consumption policy." },
        { label: "Whether receive processing drains to EAGAIN or explicitly schedules remaining work.", reason: "A new readiness edge may not arrive for bytes already available." },
        { label: "Whether the sender uses one write per application frame.", reason: "Sender write boundaries do not define receiver read boundaries." },
        { label: "Whether epoll has already decoded the application frame.", reason: "epoll has no knowledge of application message formats." },
      ], answer: 1, takeaway: "Readiness, consumption and rearming form one correctness contract." },
      { id: "event-loop-2", prompt: "What does EAGAIN normally mean after draining a nonblocking socket?", options: [
        { label: "The peer has permanently closed the stream.", reason: "EOF on a stream read is represented by a zero-byte result, not EAGAIN." },
        { label: "The market-data sequence is invalid.", reason: "EAGAIN is an I/O availability result, not a feed-level sequence verdict." },
        { label: "The operation cannot currently make progress without blocking.", reason: "Wait or reschedule according to the event-loop policy instead of treating this as a fatal feed error." },
        { label: "The kernel has guaranteed another full message is ready.", reason: "The result means no progress is available now, not that a full frame exists." },
      ], answer: 2, takeaway: "Expected nonblocking control flow is not an incident by itself." },
      { id: "event-loop-3", prompt: "All sockets lag together when a logging callback runs. CPU is mostly idle. What is the strongest next hypothesis?", options: [
        { label: "A blocking operation on the shared loop is delaying independent sockets.", reason: "Correlated loop lag with the callback suggests serialization; verify thread-level timing." },
        { label: "Every peer independently became slow at precisely the same time.", reason: "The shared local execution boundary is a more discriminating first check." },
        { label: "Low CPU proves the event loop is healthy.", reason: "A thread blocked on I/O or a lock can produce low CPU and high latency." },
        { label: "Add event-loop threads without preserving per-feed ordering.", reason: "Blind parallelism risks breaking application state ordering." },
      ], answer: 0, takeaway: "A wait can dominate latency while consuming little CPU." },
      { id: "event-loop-4", prompt: "An io_uring request was submitted successfully. Which step remains necessary?", options: [
        { label: "Assume all requested bytes reached stable storage.", reason: "Submission is neither completion nor a durability guarantee." },
        { label: "Free the buffer immediately because submission transfers every lifetime obligation.", reason: "Buffer lifetimes depend on the operation and registration semantics." },
        { label: "Ignore completion errors because the submission succeeded.", reason: "The actual operation can still fail or return a short result." },
        { label: "Consume the completion and check its result before applying operation-specific success rules.", reason: "Submission and completion are separate events; result semantics still matter." },
      ], answer: 3, takeaway: "Asynchronous does not mean infallible or already complete." },
    ],
    interview: { prompt: "Would you solve latency by making everything asynchronous?", answer: "I would first identify the blocking boundary. Async I/O can improve concurrency, but correctness still requires completion handling, bounded queues, buffer lifetime management and ordered state updates. I would compare tail latency and overload recovery under representative bursts, not just average throughput." },
    sources: [{ label: "Linux man-pages: epoll(7)", url: "https://man7.org/linux/man-pages/man7/epoll.7.html" }, { label: "Linux man-pages: io_uring_enter(2)", url: "https://man7.org/linux/man-pages/man2/io_uring_enter.2.html" }],
  },
  {
    id: "threads", title: "Threads, scheduling and contention", subtitle: "Run queues, locks, affinity and CPU budgets",
    stage: "Execution", minutes: 30, prerequisite: "event-loop", connectsTo: "capacity",
    objectives: ["Separate runnable from running and blocked", "Distinguish parallelism from contention", "Diagnose throttling despite host headroom"],
    concepts: [
      { title: "A thread is a scheduled execution context", body: "Threads in one process share address space and many process resources, including open file descriptors. Each has its own execution state and stack. A runnable thread still needs CPU time; a blocked thread is waiting for something else. More threads do not imply more useful parallelism.", operational: "Identify the specific latency-critical TID and its waits rather than trusting aggregate process CPU. Shared state needs synchronization even if every thread has its own stack." },
      { title: "Contention turns concurrency into a queue", body: "Workers competing for a mutex may serialize behind one owner. Busy spinning spends CPU; sleeping waits may not. A futex wait is evidence of a synchronization path, not proof of deadlock. Cache-line sharing can also hurt scaling even when threads touch different variables.", operational: "Correlate lock hold time, off-CPU time, run delay and completed work. A thread dump is a sample of state, not a complete causal timeline." },
      { title: "The available CPU budget may be smaller than the host", body: "CPU affinity restricts placement; cgroup limits can restrict the group's available runtime. A container may be throttled while other host CPUs are idle. NUMA placement and IRQ work complicate pinning: putting every important thread on one CPU may create competition instead of isolation.", operational: "Compare cgroup throttling deltas and per-thread scheduling with tails before changing limits. Capacity means the constrained execution path, not total machine CPU." },
    ],
    commands: [
      { command: "ps -L -p 4242 -o pid,tid,psr,stat,pcpu,wchan:24,comm", output: " PID   TID PSR STAT %CPU WCHAN                    COMMAND\n4242  4242   3 Sl    0.1 do_epoll_wait            receiver\n4242  4243   4 Sl    0.0 futex_wait_queue         decoder\n4242  4244   4 Rl   99.0 -                        publisher", interpretation: "Threads have different execution states. A hot publisher and waiting decoder invite inspection of their shared queue and synchronization.", boundary: "WCHAN availability depends on privileges and kernel configuration. CPU percentages have sampling semantics; a single row cannot establish deadlock." },
      { command: "cat /sys/fs/cgroup/feed.service/cpu.stat", output: "# Deltas across the incident interval\nnr_periods       +100\nnr_throttled      +85\nthrottled_usec +650000", interpretation: "The group was throttled in many periods. Compare its cpu.max, demand and scheduling delay with application latency.", boundary: "Use the process's actual cgroup path and cgroup version. These values are group-level and do not prove which thread lost time." },
    ],
    questions: [
      { id: "threads-1", prompt: "Which resource is ordinarily shared by POSIX threads within one process?", options: [
        { label: "The same call stack and instruction pointer.", reason: "Execution state and stacks are per thread." },
        { label: "One immutable copy of all application memory.", reason: "The address space is shared and mutable; synchronization is required." },
        { label: "Exactly the same scheduling state at every instant.", reason: "Different threads can be runnable, blocked or executing independently." },
        { label: "The process address space and open file descriptor table.", reason: "These shared resources make communication cheap but also create concurrency hazards." },
      ], answer: 3, takeaway: "Shared memory enables coordination and requires discipline." },
      { id: "threads-2", prompt: "Host CPU is 25%, but a feed container's throttled time rises with p99 latency. What should you check?", options: [
        { label: "Its CPU quota, period, actual cgroup and per-thread runnable delay.", reason: "The container can exhaust its own budget while the host has spare capacity." },
        { label: "Only free RAM, since low CPU excludes scheduling problems.", reason: "A budget limit is independent of total host CPU utilization." },
        { label: "The exchange calendar only, because throttling cannot delay threads.", reason: "Throttling prevents execution and can directly increase processing age." },
        { label: "Disable all limits globally before collecting any evidence.", reason: "A broad change can harm other workloads and erases the chance to verify a scoped hypothesis." },
      ], answer: 0, takeaway: "Measure capacity at the enforced resource boundary." },
      { id: "threads-3", prompt: "Adding decoder workers makes throughput flat and p99 worse; lock waits rise. Which interpretation fits?", options: [
        { label: "The network must now be slower because threads cannot affect p99.", reason: "Shared-state contention can worsen latency locally." },
        { label: "More threads always improve throughput after sufficient warmup.", reason: "Serialization and coordination overhead can dominate." },
        { label: "A serialized critical section may dominate; profile ownership and hold time.", reason: "The evidence suggests contention, but the critical section still needs identification." },
        { label: "A futex syscall alone proves permanent deadlock.", reason: "Normal lock contention also uses futex waits." },
      ], answer: 2, takeaway: "Concurrency is not the same as independent progress." },
      { id: "threads-4", prompt: "What is the main risk of pinning both the receiver and all its IRQ processing to one busy CPU?", options: [
        { label: "Thread affinity automatically prevents that CPU from processing NIC interrupts.", reason: "Thread placement alone does not isolate interrupt processing." },
        { label: "Locality may improve, but both paths may compete for the same execution capacity.", reason: "Placement is a measured trade-off between locality and contention." },
        { label: "Pinning both paths guarantees lower tail latency under every burst size.", reason: "Locality can help, but shared capacity and burst demand can worsen queueing." },
        { label: "The NIC's DMA buffers are automatically migrated to the pinned CPU's NUMA node.", reason: "CPU affinity alone does not establish driver buffer allocation or memory placement." },
      ], answer: 1, takeaway: "Pinning needs a tested topology, not a slogan." },
    ],
    interview: { prompt: "The server is idle but latency is high. How can that happen?", answer: "I inspect the critical thread, not just the host average. It could be blocked on a lock or I/O, runnable but delayed, or restricted by affinity or cgroup quota. I compare thread state, runnable delay, throttling and queue age, then test a scoped mitigation with correctness and tail-latency checks." },
    sources: [{ label: "Linux man-pages: pthreads(7)", url: "https://man7.org/linux/man-pages/man7/pthreads.7.html" }, { label: "Kernel: cgroup v2 CPU controls", url: "https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html" }, { label: "Linux man-pages: ps(1)", url: "https://man7.org/linux/man-pages/man1/ps.1.html" }],
  },
  {
    id: "memory", title: "Memory is part of the latency path", subtitle: "Page faults, reclaim, NUMA and pressure",
    stage: "System", minutes: 25, prerequisite: "threads", connectsTo: "monitoring",
    objectives: ["Separate virtual size, resident memory and pressure", "Interpret faults without calling every fault disk I/O", "Connect locality and reclaim to tail latency"],
    concepts: [
      { title: "Memory size is not memory pressure", body: "Virtual address space, resident pages, file cache and actively working data measure different things. A large virtual size is not proof of resident consumption. Reclaim, page faults and allocator behavior can introduce latency even before a process is killed for running out of memory.", operational: "Correlate fault rates, reclaim and pressure with queue age. Do not infer an OOM event from a falling RSS chart without lifecycle and kernel evidence." },
      { title: "NUMA makes placement matter", body: "On NUMA systems, access cost can depend on where memory resides relative to the executing CPU. Pinning a thread does not automatically relocate its existing pages. NIC locality, allocation policy, page placement and workload access patterns all contribute to the result.", operational: "Compare process memory placement and CPU placement before changing either. Run a representative benchmark with the same burst and failover behavior." },
      { title: "PSI measures time stalled by resource pressure", body: "Linux pressure-stall information adds a time-based view to CPU, memory and I/O saturation. The some and full measures describe different stall scopes. Host and cgroup views answer different questions; availability and details depend on kernel configuration and version.", operational: "A simultaneous rise in memory pressure and decode age is a useful lead, not proof of causality. Compare reclaim, faults and a scoped intervention." },
    ],
    commands: [
      { command: "cat /proc/pressure/memory", output: "some avg10=8.20 avg60=2.14 avg300=0.52 total=682004\nfull avg10=1.30 avg60=0.25 avg300=0.08 total=106820", interpretation: "Recent memory-related stalls are present. The percentages summarize time pressure, not percent of RAM used.", boundary: "This is a system view. A cgroup-specific pressure file can better match the affected service; collect a time series." },
      { command: "numastat -p 4242", output: "# Simplified per-process memory, MiB\n                 Node 0  Node 1\nPrivate              64    2048\n# Receiver's affinity currently favors Node 0 CPUs", interpretation: "CPU and memory placement differ. This suggests measuring remote-memory impact before proposing a locality change.", boundary: "Placement is not measured access latency, and the process may intentionally share data across nodes. Tool availability varies by distribution." },
    ],
    questions: [
      { id: "memory-1", prompt: "A process reserves 40 GB of virtual space but has 800 MB RSS. What can you safely conclude?", options: [
        { label: "It physically occupies all 40 GB of RAM.", reason: "Virtual address space is not the same as resident pages." },
        { label: "It has a much smaller resident footprint than its virtual mapping size.", reason: "This is supported by the measurements; pressure and working set still require investigation." },
        { label: "It cannot ever experience page faults.", reason: "Resident size does not exclude future faults or reclaim." },
        { label: "Its memory use is definitely harmless in every cgroup.", reason: "Limits, growth and pressure at the service boundary still matter." },
      ], answer: 1, takeaway: "Name the memory metric before interpreting it." },
      { id: "memory-2", prompt: "A minor page fault count rises. Does every such fault require a disk read?", options: [
        { label: "Yes; page fault and storage I/O are synonyms.", reason: "Minor faults can be resolved without reading from storage." },
        { label: "Yes; first access always loads a page from the executable file.", reason: "Faults also occur for anonymous mappings and other cases that need no storage read." },
        { label: "No; minor faults can be resolved without storage I/O, but still cost work.", reason: "Fault class and timing matter when interpreting latency." },
        { label: "No; therefore all page faults are free.", reason: "Mapping and fault handling still consume time even without disk access." },
      ], answer: 2, takeaway: "Different fault classes imply different mechanisms." },
      { id: "memory-3", prompt: "You pin a decoder to Node 0 CPUs. Why might NUMA latency remain high?", options: [
        { label: "Its existing pages may still be on another node.", reason: "Execution placement and memory placement are separate concerns." },
        { label: "Affinity guarantees immediate migration of every page.", reason: "That guarantee does not follow from CPU affinity." },
        { label: "The pin guarantees local memory, so any remaining latency must be network RTT.", reason: "Execution affinity alone establishes neither page placement nor the delayed boundary." },
        { label: "Pinning necessarily locks every page in physical RAM.", reason: "CPU placement and locking pages against paging are separate operations." },
      ], answer: 0, takeaway: "Co-locate based on measured access patterns, not CPU labels alone." },
      { id: "memory-4", prompt: "memory PSI avg10 rises during feed delay. What does this most directly describe?", options: [
        { label: "The fraction of market packets dropped by the NIC.", reason: "PSI is resource stall accounting, not packet loss." },
        { label: "The exact number of megabytes leaked by the application.", reason: "PSI is time-based and does not identify an allocation leak." },
        { label: "A proven exchange incident.", reason: "Local resource stalls cannot establish an exchange fault." },
        { label: "Recent time stalled under memory pressure, requiring scope and causal checks.", reason: "Pressure telemetry identifies a resource condition, not its complete causal chain." },
      ], answer: 3, takeaway: "Use pressure as a discriminating signal, not a root-cause label." },
    ],
    interview: { prompt: "How would you investigate memory-related jitter?", answer: "I distinguish RSS and address-space size from actual pressure. I compare faults, reclaim, allocation pauses and PSI against tail latency, then inspect CPU and NUMA page placement. I avoid assuming every fault means disk I/O or that a memory graph alone proves a leak." },
    sources: [{ label: "Kernel: pressure stall information", url: "https://docs.kernel.org/accounting/psi.html" }, { label: "Linux man-pages: numa(7)", url: "https://man7.org/linux/man-pages/man7/numa.7.html" }, { label: "Linux man-pages: getrusage(2)", url: "https://man7.org/linux/man-pages/man2/getrusage.2.html" }],
  },
  {
    id: "storage", title: "I/O, queues and durable evidence", subtitle: "Page cache, fsync and audit integrity",
    stage: "System", minutes: 25, prerequisite: "event-loop", connectsTo: "incident",
    objectives: ["Separate write acceptance from durability", "Identify storage wait on a trading path", "Protect audit integrity during overload"],
    concepts: [
      { title: "Written is not necessarily durable", body: "A successful buffered write can leave data in memory awaiting persistence. fsync requests synchronization of file data and required metadata; a newly created or renamed directory entry can need its own directory synchronization. Durability remains a contract with the filesystem and storage stack, not a screenshot of a successful write.", operational: "State whether an audit acknowledgement means queued, written or durable. Do not silently weaken that contract during a latency incident." },
      { title: "Storage has queues too", body: "I/O waits can delay event handling with very little CPU consumption. Device, filesystem, writeback and application batching add separate boundaries. Device utilization and average latency can conceal request-size effects and rare long stalls.", operational: "Compare service-level durable-write latency, pending writes and oldest audit record with device metrics. The useful measure is the evidence delay experienced by the application." },
      { title: "Offloading needs a failure contract", body: "An asynchronous audit worker removes disk waits from a producer only while its queue can absorb demand. A full queue requires an explicit policy: block, reject new work, shed only permitted data, or enter a protective mode. Restarting must account for unsynchronized records and replay duplicates.", operational: "Trading and compliance owners must define acceptable evidence loss and recovery behavior. Training examples are not permission to discard production records." },
    ],
    commands: [
      { command: "iostat -xz 1 3", output: "# Simplified interval\nDevice   r/s   w/s  await  aqu-sz  %util\nnvme0n1    2   820   18.4    15.1   97.0\n# Application audit durable-write p99: 120 ms", interpretation: "Storage delay and queueing accompany a much higher application tail. Trace the synchronous path and competing workload.", boundary: "Units and fields vary by version. High %util alone is not a universal saturation verdict for parallel devices; averages do not describe p99." },
      { command: "ls -l /proc/4242/fd", output: "7 -> socket:[12345]\n8 -> /var/log/feed/audit.log (deleted)", interpretation: "An open descriptor can still refer to an unlinked file. Removing its pathname does not immediately release the file's storage while it remains open.", boundary: "Read-only inspection can expose sensitive filenames. Do not truncate the descriptor or kill the process blindly; follow the approved log-rotation and audit-retention procedure." },
    ],
    questions: [
      { id: "storage-1", prompt: "write() returns success for a buffered audit record. What should the application avoid claiming?", options: [
        { label: "The system accepted the reported bytes.", reason: "That is consistent with a successful write result, subject to its byte count." },
        { label: "The write returned without this call reporting an error.", reason: "That is a narrow description of the observed result." },
        { label: "The record is guaranteed durable across a power failure.", reason: "Buffered write acceptance alone does not establish persistence." },
        { label: "Further persistence confirmation may be required.", reason: "This correctly distinguishes buffering from durability." },
      ], answer: 2, takeaway: "Acknowledge only the durability boundary actually crossed." },
      { id: "storage-2", prompt: "Audit fsync latency rises; loop lag follows. Which mitigation needs an explicit bounded-queue policy?", options: [
        { label: "Moving audit writes to a separate worker.", reason: "Offloading does not remove slow storage; the intervening queue needs overload and durability semantics." },
        { label: "Documenting the current durability contract.", reason: "Documentation does not introduce a new queue." },
        { label: "Comparing latency before and after the incident.", reason: "Observation does not move work into a buffering boundary." },
        { label: "Identifying the event-loop thread.", reason: "This diagnostic action does not introduce asynchronous audit persistence." },
      ], answer: 0, takeaway: "Async boundaries move risk unless their overload behavior is defined." },
      { id: "storage-3", prompt: "A log file was deleted but disk usage remains high and /proc/PID/fd shows '(deleted)'. Why?", options: [
        { label: "Directory permissions prevent storage reclamation even after the last reference closes.", reason: "The given evidence is an open reference, not a permission-based reclamation rule." },
        { label: "The data must have been copied into a new pathname by unlink itself.", reason: "Unlink removes a name; it does not create a replacement copy." },
        { label: "A regular filesystem cache flush is guaranteed to release the open file.", reason: "Flushing cached data does not close the process's descriptor." },
        { label: "A process still holds an open reference to the unlinked file.", reason: "The file persists through open references; use the approved rotation/reopen procedure." },
      ], answer: 3, takeaway: "Pathnames, descriptors and underlying objects are distinct." },
      { id: "storage-4", prompt: "The audit queue holds 4,000 records and grows by 800/s. What is missing before claiming it is safe?", options: [
        { label: "Only proof that the process has a green uptime check.", reason: "Uptime does not establish queue headroom or record durability." },
        { label: "Queue capacity, oldest-record age, service rate and the approved full-queue policy.", reason: "Together these determine time to exhaustion, freshness and controlled behavior." },
        { label: "Only the number of CPU cores in the host.", reason: "The limiting dependency may be storage and the queue already has positive growth." },
        { label: "Nothing; 4,000 is always a safe queue depth.", reason: "Depth has no universal safe interpretation without workload and service contracts." },
      ], answer: 1, takeaway: "Backlog size needs age, rate and policy." },
    ],
    interview: { prompt: "Would you disable audit writes to restore latency?", answer: "Not without the defined control policy and authorization. I would separate input backlog from durable evidence backlog, identify the blocking operation, and escalate the trading and audit risk. Any offload or protective mode needs bounded queues, explicit failure behavior and reconciliation before closure." },
    sources: [{ label: "Linux man-pages: fsync(2)", url: "https://man7.org/linux/man-pages/man2/fsync.2.html" }, { label: "Linux man-pages: open(2)", url: "https://man7.org/linux/man-pages/man2/open.2.html" }, { label: "Linux man-pages: unlink(2)", url: "https://man7.org/linux/man-pages/man2/unlink.2.html" }],
  },
  {
    id: "unix", title: "Unix operations under pressure", subtitle: "Descriptors, signals, processes and namespaces",
    stage: "System", minutes: 30, prerequisite: "threads", connectsTo: "incident",
    objectives: ["Interpret file-descriptor exhaustion and process states", "Choose evidence-preserving lifecycle actions", "Respect namespaces, permissions and diagnostic overhead"],
    concepts: [
      { title: "Everything with a descriptor is not a regular file", body: "A process's descriptor table can refer to files, sockets, pipes and other kernel objects. Descriptors can be duplicated or inherited, so count and lifetime matter. Per-process exhaustion differs from a system-wide file-table limit. Pipes carry bytes and impose their own buffering and reader/writer lifecycle.", operational: "Compare descriptor counts, types, limits and growth across a deployment. Do not respond to a leak only by increasing the limit." },
      { title: "Signals and process states constrain recovery", body: "SIGTERM permits a process to handle termination; SIGKILL cannot be caught. Neither guarantees an audit flush or an orderly trading shutdown. A zombie has already exited and needs its status collected by a parent. An uninterruptible sleep may not end just because a signal was sent.", operational: "Use the service's approved shutdown and restart path. Verify process identity, ownership and outstanding work; a PID can be reused." },
      { title: "The observation namespace is part of the evidence", body: "A container can see different process IDs, network interfaces and mounts than the host. Permissions and capabilities affect what a diagnostic command can observe. A missing socket in one namespace is not proof that no socket exists elsewhere.", operational: "Record host, namespace, PID/TID, service and interval with each observation. Use a narrow approved diagnostic context rather than escalating privileges broadly." },
    ],
    commands: [
      { command: "cat /proc/4242/limits", output: "Limit                 Soft Limit  Hard Limit\nMax open files        1024        65536\n# Descriptor sample: 1021 open; count rising since deploy", interpretation: "The process is near its soft descriptor limit. Inspect ownership and lifetime of new descriptors and application error codes.", boundary: "A limit increase can buy time but does not repair a leak. PID 4242 is fictional; verify the service before inspecting a real process." },
      { command: "journalctl -u feed.service --since '10 min ago' --no-pager -n 50", output: "12:00:03 feed[4242]: accept failed: Too many open files\n12:00:04 feed[4242]: health endpoint OK\n12:00:05 feed[4242]: subscriptions pending=240", interpretation: "A simple health endpoint is green while new client admission is impaired. Scope existing versus new sessions separately.", boundary: "Logs may contain customer or credential material. Restrict access and redact before sharing; systemd tools are not universal across Unix systems." },
    ],
    questions: [
      { id: "unix-1", prompt: "New connections fail with EMFILE while existing sessions continue. What should you inspect first?", options: [
        { label: "The process descriptor count, types, soft limit and growth.", reason: "EMFILE indicates a per-process descriptor limit condition; existing descriptors may still operate." },
        { label: "Only the listen backlog and TCP SYN retransmissions.", reason: "Admission can fail at descriptor allocation even when handshake and backlog conditions are otherwise normal." },
        { label: "The system-wide limit only, ignoring the process limit.", reason: "Per-process and system-wide exhaustion have different boundaries." },
        { label: "Raise limits permanently without checking descriptor lifetime.", reason: "A leak can recur at a larger limit while retaining the root cause." },
      ], answer: 0, takeaway: "Existing-session health can coexist with broken admission." },
      { id: "unix-2", prompt: "Why is kill -9 not an orderly trading-system shutdown procedure?", options: [
        { label: "It always waits for all market-data queues to drain first.", reason: "SIGKILL does not run the application's queue-drain or shutdown procedure." },
        { label: "The target can always catch SIGKILL and reconcile positions.", reason: "SIGKILL cannot be caught, so a reconciliation handler cannot run in response to it." },
        { label: "It bypasses application cleanup and does not establish external order or audit state.", reason: "Stopping execution is distinct from safely reconciling business state." },
        { label: "It can only be used on processes that have no sockets.", reason: "Socket ownership does not impose that rule." },
      ], answer: 2, takeaway: "Lifecycle control must preserve external-state certainty." },
      { id: "unix-3", prompt: "ps shows a process in Z state. What does that normally mean?", options: [
        { label: "It is using all CPUs in a busy loop.", reason: "A zombie is not executing application work." },
        { label: "It has exited and its parent has not yet collected its status.", reason: "Investigate parent reaping rather than trying to kill already-exited work." },
        { label: "It is a TCP socket waiting for FIN.", reason: "Z is a process state, not a TCP lifecycle state." },
        { label: "Its RSS is definitely growing from a memory leak.", reason: "The state indicates an exited process, not active allocation." },
      ], answer: 1, takeaway: "Process-state vocabulary changes the correct operational action." },
      { id: "unix-4", prompt: "A socket is missing from ss inside a diagnostic container. What must you establish before declaring it gone?", options: [
        { label: "That the container has a visually similar hostname.", reason: "Hostnames alone do not prove a shared network namespace." },
        { label: "That the query ran twice with exactly the same output.", reason: "Repeated observation of the wrong scope remains the wrong scope." },
        { label: "That DNS resolution succeeds for an unrelated site.", reason: "DNS reachability does not establish socket visibility." },
        { label: "That the query uses the service's network namespace and sufficient visibility.", reason: "The observation scope determines what sockets can be seen." },
      ], answer: 3, takeaway: "Absence is evidence only within a known observation boundary." },
    ],
    interview: { prompt: "What Unix checks would you use during a trading incident?", answer: "I first establish service identity and namespace. I inspect per-thread state, descriptor limits, socket queues, resource pressure and bounded service logs. I avoid broad tracing or forceful restarts without approval, preserve timestamps, and judge recovery by downstream correctness rather than a green process check." },
    sources: [{ label: "Linux man-pages: signal(7)", url: "https://man7.org/linux/man-pages/man7/signal.7.html" }, { label: "Linux man-pages: open(2)", url: "https://man7.org/linux/man-pages/man2/open.2.html" }, { label: "Linux man-pages: namespaces(7)", url: "https://man7.org/linux/man-pages/man7/namespaces.7.html" }, { label: "Linux man-pages: wait(2)", url: "https://man7.org/linux/man-pages/man2/wait.2.html" }],
  },
  {
    id: "capstone", title: "The stale-feed investigation", subtitle: "Turn cross-layer evidence into a safe decision",
    stage: "Synthesis", minutes: 35, prerequisite: "unix", connectsTo: "incident",
    objectives: ["Locate the first delayed boundary", "Separate hypothesis from verified impact", "Define recovery beyond an empty queue"],
    concepts: [
      { title: "Decompose age at named boundaries", body: "Receive, decode, publish and consumer timestamps split a symptom into intervals. Compare like clock domains: an apparent negative network delay may indicate skew or a timestamp-semantic mismatch. Use monotonic clocks for local elapsed intervals and synchronized wall time for cross-host correlation.", operational: "A low network RTT does not explain application age. Identify the first interval that worsened, and annotate missing or incomparable measurements." },
      { title: "Backlog is work that has not been completed", body: "If arrival is 120,000 events/s and service is 100,000, backlog grows by 20,000 events/s under those assumptions. A recovery service rate of 150,000 with the same arrivals drains at 30,000/s. This simple conservation model assumes constant rates and homogeneous work; real workloads need measured distributions.", operational: "Track oldest-event age with depth. A shrinking queue is encouraging but can still contain data too old for safe trading." },
      { title: "Recovery needs valid state and fresh consumers", body: "Clearing a queue or restarting a process can remove the visible symptom without restoring the correct book. Sequence continuity, a valid recovery baseline, fresh downstream state and any affected order reconciliation remain necessary. Root cause can remain open after controlled service recovery.", operational: "Communicate verified scope, trading risk, owner, action and next update time. Do not promote a plausible CPU or storage correlation into a proven exchange failure." },
    ],
    commands: [
      { command: "# Correlated incident timeline (synthetic, UTC)", output: "12:00:00 RX drops delta=0; feed sequence continuous\n12:00:02 receive->decode p99: 0.4 -> 82 ms\n12:00:02 cgroup throttled periods: 85 / 100\n12:00:03 consumer quote age: 110 ms\n12:00:03 upstream peer age: 2 ms", interpretation: "The earliest measured degradation is between local receipt and decode. Scheduling budget is a plausible contributor, and the downstream consumer is affected.", boundary: "This timeline supports a scoped hypothesis, not proof of causality. Confirm clock comparability, service identity and temporal alignment." },
      { command: "# Recovery worksheet", output: "Backlog:              600,000 events\nArrival:              120,000 events/s\nRecovery service:     150,000 events/s\nNet drain:             30,000 events/s\nEstimated drain time:      20 seconds", interpretation: "The estimate uses backlog / (service - arrival). Backlog / service would wrongly assume no new arrivals.", boundary: "The estimate is invalid if rates change materially, event costs differ or another queue bottlenecks. Verify actual oldest-event age and continuity throughout." },
    ],
    questions: [
      { id: "capstone-1", prompt: "Where would you focus first, given this correlated evidence?", evidence: "NIC drop delta: 0 | sequence: continuous\nReceive-to-decode p99: 82 ms (baseline 0.4 ms)\nDecode-to-publish p99: 0.3 ms\nCPU throttled periods: 85/100", options: [
        { label: "The exchange matching engine is proven broken.", reason: "Local interval and throttling evidence do not establish an exchange fault." },
        { label: "Local scheduling and decode execution, while protecting consumers from stale data.", reason: "The earliest measured delayed boundary is local receive-to-decode; throttling is a testable lead." },
        { label: "Only the publish-to-consumer network, ignoring decode delay.", reason: "The strongest supplied evidence points earlier in the local path." },
        { label: "No incident exists because the sequence remains continuous.", reason: "Correctly ordered data can still be too old for safe decisions." },
      ], answer: 1, takeaway: "Continuity and freshness are independent invariants." },
      { id: "capstone-2", prompt: "A 600,000-event backlog receives 120,000/s and processes 150,000/s. With constant rates, how long to drain?", options: [
        { label: "4 seconds, dividing backlog by service rate.", reason: "That ignores the 120,000 new events arriving each second." },
        { label: "5 seconds, dividing backlog by arrival rate.", reason: "Arrival rate is not net recovery capacity." },
        { label: "20 seconds, dividing by the 30,000/s net drain.", reason: "Conservation of queued work requires subtracting arrivals from service." },
        { label: "It never drains because arrivals are nonzero.", reason: "The service rate exceeds arrivals, so backlog decreases under the stated assumptions." },
      ], answer: 2, takeaway: "Recovery headroom is service minus continuing demand." },
      { id: "capstone-3", prompt: "The queue is empty after a restart. Which closure criterion is strongest?", options: [
        { label: "A valid baseline, continuous sequences, fresh consumers and reconciled affected trading state.", reason: "Recovery must restore correctness as well as processing availability." },
        { label: "The process exists and its TCP socket is ESTAB.", reason: "Availability alone does not prove coherent market or order state." },
        { label: "The error log stopped growing for one second.", reason: "Absence of recent errors is too narrow to establish recovery." },
        { label: "The queue chart was reset to zero by the restart.", reason: "A reset can discard evidence or work rather than complete it." },
      ], answer: 0, takeaway: "Restore invariants, not just green indicators." },
      { id: "capstone-4", prompt: "Which first update best separates fact from hypothesis?", options: [
        { label: "The exchange is broken; our server looks green so we are waiting.", reason: "This overstates an unproven cause and omits local evidence and risk." },
        { label: "Everything is fixed because we plan to restart shortly.", reason: "A planned action is not a verified outcome." },
        { label: "There is latency somewhere; no next update until root cause is known.", reason: "This lacks scope, ownership, risk and communication cadence." },
        { label: "Consumer age rose to 110 ms; local decode delay is verified, throttling is suspected; owner paged and next update in 5 minutes.", reason: "It separates observations from hypotheses and makes ownership and communication concrete." },
      ], answer: 3, takeaway: "Uncertainty can be communicated precisely." },
    ],
    interview: { prompt: "Give a 60-second answer for this incident.", answer: "I confirm the active session and stale consumer scope, then follow the approved trading protection path. The measured delay begins between receipt and decode, with continuous sequences and no observed NIC drop delta. Throttling is a hypothesis I would test against the actual cgroup and thread timing. I escalate with timestamps, owner and next update; closure needs fresh, valid state, drained work and affected trading reconciliation." },
    sources: [{ label: "Linux man-pages: clock_gettime(2)", url: "https://man7.org/linux/man-pages/man2/clock_gettime.2.html" }, { label: "Kernel: pressure stall information", url: "https://docs.kernel.org/accounting/psi.html" }],
  },
];

export const infraLessonById = new Map<string, InfraLesson>(infrastructureLessons.map((lesson) => [lesson.id, lesson]));
export const infraQuestions = infrastructureLessons.flatMap((lesson) => lesson.questions);
export const infraQuestionById = new Map(infraQuestions.map((question) => [question.id, question]));
