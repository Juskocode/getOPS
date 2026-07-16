import { ArrowUpRight, RadioTower, ShieldCheck, Siren } from "lucide-react";

const systems = [
  { name: "Telemetry triage", status: "Legacy fallback", icon: RadioTower },
  { name: "Incident labs", status: "Legacy fallback", icon: Siren },
  { name: "Shift Desk", status: "Legacy fallback", icon: ShieldCheck },
];

export function SimulatePage() {
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">SIMULATE</span>
          <h1>Pressure systems</h1>
          <p>Specialist simulations remain available while typed migrations land.</p>
        </div>
        <a className="button button-primary" href="/legacy/">
          Open legacy workspace <ArrowUpRight size={17} />
        </a>
      </header>
      <section className="migration-list">
        {systems.map(({ name, status, icon: Icon }) => (
          <article key={name}>
            <Icon size={20} />
            <strong>{name}</strong>
            <span>{status}</span>
            <a href="/legacy/">Launch <ArrowUpRight size={15} /></a>
          </article>
        ))}
      </section>
    </div>
  );
}
