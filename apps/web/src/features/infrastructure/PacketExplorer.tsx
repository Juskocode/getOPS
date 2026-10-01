import { ArrowRight, CircleAlert, Pause, Play, ScanLine } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { packetCases, packetStages } from "../../content/infrastructure/packet-path";

function duration(microseconds: number) {
  return microseconds >= 1000 ? `${(microseconds / 1000).toFixed(2)} ms` : `${microseconds} us`;
}

export function PacketExplorer() {
  const [caseId, setCaseId] = useState<string>("baseline");
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(true);
  const scenario = packetCases.find((item) => item.id === caseId) ?? packetCases[0]!;
  const stage = packetStages[selected]!;
  const total = scenario.delays.reduce((sum: number, value: number) => sum + value, 0);
  return (
    <section className="packet-explorer" aria-label="Packet path explorer">
      <header className="section-heading">
        <div><span className="eyebrow">01 / TRACE THE PATH</span><h2>Where does freshness disappear?</h2></div>
        <div className="packet-controls">
          <label>Scenario<select aria-label="Packet scenario" value={caseId} onChange={(event) => {
            const next = packetCases.find((item) => item.id === event.target.value)!;
            setCaseId(next.id); setSelected(Math.max(0, next.suspect));
          }}>{packetCases.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <button type="button" className="icon-button" aria-label={playing ? "Pause packet animation" : "Resume packet animation"} title={playing ? "Pause animation" : "Resume animation"} onClick={() => setPlaying(!playing)}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
      </header>
      <div className="packet-scenario-heading"><span className="status-label">SYNTHETIC TRACE</span><p>{scenario.symptom}</p></div>
      <div className="packet-path" data-playing={playing} aria-label="Receive path boundaries">
        {packetStages.map((item, index) => (
          <button type="button" key={item.id} aria-pressed={selected === index} onClick={() => setSelected(index)}
            className={`packet-node${scenario.suspect === index ? " packet-suspect" : ""}`}>
            <span className="packet-node-index">0{index + 1}<span className="packet-pulse" style={{ animationDelay: `${index * 260}ms` }} /></span>
            <small>{item.layer}</small><strong>{item.label}</strong><span className="packet-time">{duration(scenario.delays[index]!)}</span>
          </button>
        ))}
      </div>
      <div className="packet-inspection">
        <div className="packet-boundary">
          <span className="eyebrow"><ScanLine size={14} /> INSPECT / {stage.layer.toUpperCase()}</span>
          <h3>{stage.label}</h3><p>{stage.signal}</p>
          <p className="boundary-caution"><CircleAlert size={15} />{stage.caution}</p>
          <Link to={`/learn/infrastructure/${stage.lesson}`}>Study this boundary <ArrowRight size={15} /></Link>
        </div>
        <div className="packet-evidence" aria-live="polite">
          <div><span>Illustrative path time</span><strong>{duration(total)}</strong></div>
          <div className="packet-time-bar" role="img" aria-label={`Selected boundary accounts for ${Math.round(scenario.delays[selected]! / total * 100)} percent of illustrative path time`}>
            {scenario.delays.map((delay, index) => <span key={index} data-selected={selected === index} style={{ flexGrow: delay }} />)}
          </div>
          <code>{scenario.evidence}</code><p>{scenario.decision}</p>
        </div>
      </div>
    </section>
  );
}
