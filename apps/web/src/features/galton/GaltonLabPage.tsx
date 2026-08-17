import {
  Activity,
  Dices,
  FastForward,
  Gauge,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  SlidersHorizontal,
  Snail,
  Sparkles,
  Sigma,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  GaltonCanvas,
  galtonSpeedProfiles,
  type GaltonProgress,
  type GaltonSpeed,
} from "./GaltonCanvas";
import {
  defaultGaltonConfig,
  formatGaltonEquation,
  sanitizeGaltonConfig,
  simulateGalton,
  summarizeDistribution,
  type GaltonConfig,
  type GaltonEquation,
} from "./galton-engine";

const equationLabels: Record<GaltonEquation, string> = {
  constant: "Constant probability",
  linear: "Linear field",
  wave: "Oscillating field",
  attractor: "Center attractor",
};

const speedLabels: Record<GaltonSpeed, { label: string; icon: typeof Snail }> = {
  slow: { label: "Slow", icon: Snail },
  normal: { label: "Normal", icon: Gauge },
  fast: { label: "Fast", icon: FastForward },
};

interface RangeControlProps {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
  format?: ((value: number) => string) | undefined;
}

function RangeControl({
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
  format = (current) => current.toFixed(2),
}: RangeControlProps) {
  return (
    <label className="galton-range">
      <span>{label}<output>{format(value)}</output></span>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function emptyProgress(rows: number): GaltonProgress {
  return { processed: 0, bins: Array.from({ length: rows + 1 }, () => 0), elapsedMs: 0, activeParticles: 0 };
}

function formatRate(rate: number): string {
  if (rate >= 10_000) return `${(rate / 1_000).toFixed(1)}k/s`;
  if (rate >= 1_000) return `${(rate / 1_000).toFixed(2)}k/s`;
  return `${Math.round(rate)}/s`;
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto.getRandomValues(values);
  return values[0] ?? (Date.now() >>> 0);
}

export function GaltonLabPage() {
  const [draft, setDraft] = useState<GaltonConfig>({ ...defaultGaltonConfig });
  const [applied, setApplied] = useState<GaltonConfig>({ ...defaultGaltonConfig });
  const [runId, setRunId] = useState(1);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<GaltonSpeed>("normal");
  const [progress, setProgress] = useState<GaltonProgress>(() => emptyProgress(defaultGaltonConfig.rows));
  const simulation = useMemo(() => simulateGalton(applied), [applied]);
  const observed = useMemo(
    () => summarizeDistribution(progress.bins, progress.processed),
    [progress.bins, progress.processed],
  );
  const fit = useMemo(() => {
    if (!progress.processed) return 0;
    const distance = simulation.expected.reduce((sum, expected, index) => {
      const actual = (progress.bins[index] ?? 0) / progress.processed;
      return sum + Math.abs(actual - expected);
    }, 0) / 2;
    return Math.max(0, (1 - distance) * 100);
  }, [progress.bins, progress.processed, simulation.expected]);
  const throughput = progress.elapsedMs ? progress.processed / (progress.elapsedMs / 1_000) : 0;
  const completion = (progress.processed / simulation.config.ballCount) * 100;
  const isComplete = progress.processed >= simulation.config.ballCount;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied);

  function patchDraft(patch: Partial<GaltonConfig>) {
    setDraft((current) => sanitizeGaltonConfig({ ...current, ...patch }));
  }

  function startRun(config: GaltonConfig) {
    const sanitized = sanitizeGaltonConfig(config);
    setApplied(sanitized);
    setDraft(sanitized);
    setProgress(emptyProgress(sanitized.rows));
    setRunId((current) => current + 1);
    setRunning(true);
  }

  function replay() {
    setProgress(emptyProgress(simulation.config.rows));
    setRunId((current) => current + 1);
    setRunning(true);
  }

  function reseed() {
    startRun({ ...draft, seed: randomSeed() });
  }

  function toggleRunning() {
    if (isComplete) replay();
    else setRunning((current) => !current);
  }

  return (
    <div className="page galton-page">
      <header className="page-header galton-page-header">
        <div>
          <span className="eyebrow">LAB / STOCHASTIC SYSTEMS</span>
          <h1>Galton field</h1>
          <p>Microscopic routing decisions converge into a macroscopic distribution.</p>
        </div>
        <div className="galton-header-signal">
          <span><Sparkles size={14} /> GOLDEN RUN</span>
          <strong>{simulation.config.ballCount.toLocaleString()}</strong>
          <small>deterministic trials</small>
        </div>
      </header>

      <div className="galton-layout">
        <section className="galton-board-panel" aria-label="Galton simulation board">
          <header className="galton-board-toolbar">
            <div className="galton-run-state" data-state={isComplete ? "complete" : running ? "running" : "paused"}>
              <span />
              <div>
                <strong>{isComplete ? "Population settled" : running ? "Sampling field" : "Run paused"}</strong>
                <small>{progress.processed.toLocaleString()} / {simulation.config.ballCount.toLocaleString()} outcomes</small>
              </div>
            </div>

            <div className="galton-speed" aria-label="Animation speed">
              {(Object.keys(speedLabels) as GaltonSpeed[]).map((value) => {
                const SpeedIcon = speedLabels[value].icon;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={speed === value}
                    title={`${speedLabels[value].label} animation`}
                    onClick={() => setSpeed(value)}
                  >
                    <SpeedIcon size={15} />
                    <span>{speedLabels[value].label}</span>
                  </button>
                );
              })}
            </div>

            <div className="galton-playback">
              <button type="button" className="button icon-button" title="Replay run" aria-label="Replay run" onClick={replay}>
                <RotateCcw size={17} />
              </button>
              <button type="button" className="button button-primary" onClick={toggleRunning}>
                {isComplete ? <RefreshCcw size={17} /> : running ? <Pause size={17} /> : <Play size={17} />}
                {isComplete ? "Replay" : running ? "Pause" : "Resume"}
              </button>
            </div>
          </header>

          <div className="galton-canvas-wrap">
            <GaltonCanvas
              simulation={simulation}
              runId={runId}
              running={running}
              speed={speed}
              onProgress={setProgress}
              onComplete={() => setRunning(false)}
            />
          </div>

          <footer className="galton-board-footer">
            <div className="galton-progress-track" aria-label={`${completion.toFixed(1)} percent complete`}>
              <span style={{ width: `${completion}%` }} />
            </div>
            <div className="galton-legend">
              <span data-series="particle">Active particles</span>
              <span data-series="observed">Observed mass</span>
              <span data-series="expected">Expected curve</span>
            </div>
          </footer>
        </section>

        <aside className="galton-controls" aria-label="Probability field controls">
          <header>
            <span className="eyebrow">FIELD MODEL</span>
            <SlidersHorizontal size={18} />
          </header>

          <label className="galton-select">
            <span>Equation</span>
            <select
              value={draft.equation}
              onChange={(event) => patchDraft({ equation: event.target.value as GaltonEquation })}
            >
              {(Object.keys(equationLabels) as GaltonEquation[]).map((equation) => (
                <option key={equation} value={equation}>{equationLabels[equation]}</option>
              ))}
            </select>
          </label>

          <code className="galton-equation">{formatGaltonEquation(draft)}</code>
          <div className="galton-variable-key">
            <span><i>x</i> normalized node position</span>
            <span><i>r/R</i> normalized row depth</span>
          </div>

          <div className="galton-control-group">
            <RangeControl
              label="Rows"
              value={draft.rows}
              minimum={6}
              maximum={22}
              step={1}
              format={(value) => String(value)}
              onChange={(rows) => patchDraft({ rows })}
            />
            <RangeControl
              label="Population"
              value={draft.ballCount}
              minimum={1_000}
              maximum={50_000}
              step={1_000}
              format={(value) => value.toLocaleString()}
              onChange={(ballCount) => patchDraft({ ballCount })}
            />
            <RangeControl
              label="Base probability"
              value={draft.baseProbability}
              minimum={0.1}
              maximum={0.9}
              step={0.01}
              onChange={(baseProbability) => patchDraft({ baseProbability })}
            />

            {draft.equation === "linear" || draft.equation === "wave" ? (
              <RangeControl
                label="Spatial drift"
                value={draft.spatialDrift}
                minimum={-0.35}
                maximum={0.35}
                step={0.01}
                onChange={(spatialDrift) => patchDraft({ spatialDrift })}
              />
            ) : null}
            {draft.equation === "linear" ? (
              <RangeControl
                label="Row drift"
                value={draft.rowDrift}
                minimum={-0.3}
                maximum={0.3}
                step={0.01}
                onChange={(rowDrift) => patchDraft({ rowDrift })}
              />
            ) : null}
            {draft.equation === "wave" || draft.equation === "attractor" ? (
              <>
                <RangeControl
                  label="Wave amplitude"
                  value={draft.waveAmplitude}
                  minimum={0}
                  maximum={0.3}
                  step={0.01}
                  onChange={(waveAmplitude) => patchDraft({ waveAmplitude })}
                />
                <RangeControl
                  label="Frequency"
                  value={draft.frequency}
                  minimum={0.25}
                  maximum={4}
                  step={0.25}
                  onChange={(frequency) => patchDraft({ frequency })}
                />
                <RangeControl
                  label="Phase"
                  value={draft.phase}
                  minimum={0}
                  maximum={Math.PI * 2}
                  step={0.05}
                  onChange={(phase) => patchDraft({ phase })}
                />
              </>
            ) : null}
            {draft.equation === "attractor" ? (
              <RangeControl
                label="Center pull"
                value={draft.centerPull}
                minimum={0}
                maximum={0.4}
                step={0.01}
                onChange={(centerPull) => patchDraft({ centerPull })}
              />
            ) : null}
          </div>

          <label className="galton-seed">
            <span>Deterministic seed</span>
            <input
              type="number"
              min={0}
              max={4_294_967_295}
              value={draft.seed}
              onChange={(event) => patchDraft({ seed: Number(event.target.value) })}
            />
          </label>

          <div className="galton-control-actions">
            <button type="button" className="button" title="Generate a new seed" onClick={reseed}>
              <Dices size={16} /> Reseed
            </button>
            <button
              type="button"
              className="button"
              title="Restore the default field"
              onClick={() => setDraft({ ...defaultGaltonConfig })}
            >
              <RotateCcw size={16} /> Defaults
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={!isDirty}
              onClick={() => startRun(draft)}
            >
              <Activity size={16} /> Apply field
            </button>
          </div>
        </aside>
      </div>

      <section className="galton-metrics" aria-label="Distribution metrics">
        <article>
          <span>Observed mean</span>
          <strong>{progress.processed ? observed.mean.toFixed(3) : "--"}</strong>
          <small>expected {simulation.expectedMean.toFixed(3)}</small>
        </article>
        <article>
          <span>Observed sigma</span>
          <strong>{progress.processed ? observed.sigma.toFixed(3) : "--"}</strong>
          <small>expected {simulation.expectedSigma.toFixed(3)}</small>
        </article>
        <article>
          <span>Distribution fit</span>
          <strong>{progress.processed ? `${fit.toFixed(2)}%` : "--"}</strong>
          <small>total variation convergence</small>
        </article>
        <article>
          <span>Throughput</span>
          <strong>{progress.processed ? formatRate(throughput) : formatRate(galtonSpeedProfiles[speed].rate)}</strong>
          <small>{progress.activeParticles.toLocaleString()} visible particles</small>
        </article>
        <article>
          <span>Decision depth</span>
          <strong>{simulation.config.rows}</strong>
          <small>{simulation.config.rows + 1} terminal bins</small>
        </article>
        <article>
          <span>Random seed</span>
          <strong>{simulation.config.seed.toString(16).toUpperCase().padStart(8, "0")}</strong>
          <small>replayable field state</small>
        </article>
      </section>

      <section className="galton-bin-tape" aria-label="Terminal bin probabilities">
        <header>
          <div>
            <span className="eyebrow">TERMINAL STATES</span>
            <h2>Distribution tape</h2>
          </div>
          <span><Sigma size={15} /> {simulation.config.rows + 1} bins</span>
        </header>
        <div>
          {Array.from({ length: simulation.config.rows + 1 }, (_, bin) => {
            const actual = progress.processed ? (progress.bins[bin] ?? 0) / progress.processed : 0;
            const expected = simulation.expected[bin] ?? 0;
            return (
              <article key={bin}>
                <span>BIN {String(bin).padStart(2, "0")}</span>
                <strong>{progress.processed ? `${(actual * 100).toFixed(2)}%` : "--"}</strong>
                <div><span style={{ height: `${progress.processed ? Math.min(100, Math.max(2, actual * 500)) : 0}%` }} /></div>
                <small>exp {(expected * 100).toFixed(2)}%</small>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
