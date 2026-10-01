import { ArrowRight, Network } from "lucide-react";
import { Link } from "react-router";

import { infrastructureProgress, lessonStudyPath } from "../../domain/infrastructure";
import { infrastructureLabProgress } from "../../domain/infrastructure-labs";
import { useProfileState } from "../../state/profile-state";

export function InfrastructureProgress() {
  const { state } = useProfileState();
  const progress = infrastructureProgress(state);
  const labs = infrastructureLabProgress(state);
  return (
    <section className="infra-progress-band" aria-label="Infrastructure progress">
      <Network size={24} aria-hidden="true" />
      <div><span className="eyebrow">SYSTEMS & INFRASTRUCTURE</span><h2>From packet to production decision</h2>
        <p>Linux receive paths, threads, I/O and Unix operations.</p><Link className="infra-band-labs" to="/simulate/infrastructure">{labs.completed} / {labs.total} investigations reviewed<ArrowRight size={13} /></Link></div>
      <div className="infra-band-count"><strong>{progress.completed}<span> / {progress.total}</span></strong><small>checkpoints reviewed</small></div>
      <Link className="button" to={lessonStudyPath(state, progress.next)}>
        {progress.completed ? "Continue" : "Start path"} <ArrowRight size={16} />
      </Link>
    </section>
  );
}
