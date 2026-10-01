import { ArrowRight, Network } from "lucide-react";
import { Link } from "react-router";

import { infrastructureProgress } from "../../domain/infrastructure";
import { useProfileState } from "../../state/profile-state";

export function InfrastructureProgress() {
  const { state } = useProfileState();
  const progress = infrastructureProgress(state);
  return (
    <section className="infra-progress-band" aria-label="Infrastructure progress">
      <Network size={24} aria-hidden="true" />
      <div><span className="eyebrow">SYSTEMS & INFRASTRUCTURE</span><h2>From packet to production decision</h2>
        <p>Linux receive paths, threads, I/O and Unix operations.</p></div>
      <div className="infra-band-count"><strong>{progress.completed}<span> / {progress.total}</span></strong><small>checkpoints reviewed</small></div>
      <Link className="button" to={`/learn/infrastructure/${progress.next.id}`}>
        {progress.completed ? "Continue" : "Start path"} <ArrowRight size={16} />
      </Link>
    </section>
  );
}
