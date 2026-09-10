import type { GaltonSimulation } from "./galton-engine";

export type GaltonSpeed = "slow" | "normal" | "fast";
export const galtonSpeedProfiles: Record<GaltonSpeed, { rate: number; duration: number }> = {
  slow: { rate: 600, duration: 2_200 },
  normal: { rate: 3_500, duration: 1_350 },
  fast: { rate: 15_000, duration: 760 },
};

export interface ActiveParticle { index: number; startedAt: number; duration: number }
export interface GaltonProgress {
  released: number;
  processed: number;
  bins: number[];
  elapsedMs: number;
  activeParticles: number;
}

interface Cohort { start: number; end: number; landsAt: number }

/** Statistical trials all settle; only the animated traces are sampled. */
export class GaltonPlayback {
  time = 0;
  released = 0;
  processed = 0;
  particles: ActiveParticle[] = [];
  readonly bins: Uint32Array;
  private carry = 0;
  private sampleCarry = 0;
  private cohorts: Cohort[] = [];

  constructor(readonly simulation: GaltonSimulation) {
    this.bins = new Uint32Array(simulation.config.rows + 1);
  }

  get complete() { return this.processed === this.simulation.config.ballCount; }

  advance(deltaMs: number, speed: GaltonSpeed, reducedMotion: boolean) {
    if (this.complete || !Number.isFinite(deltaMs) || deltaMs <= 0) return;
    const delta = Math.min(deltaMs, 50);
    this.time += delta;
    const profile = galtonSpeedProfiles[speed];
    this.particles = reducedMotion ? [] : this.particles.filter(
      (particle) => this.time - particle.startedAt < particle.duration,
    );
    this.carry += profile.rate * delta / 1_000;
    const addition = Math.floor(this.carry);
    this.carry -= addition;
    const end = Math.min(this.simulation.config.ballCount, this.released + addition);
    if (end > this.released) {
      this.cohorts.push({ start: this.released, end, landsAt: this.time + profile.duration });
      this.sampleCarry += delta * 0.28;
      const count = reducedMotion ? 0 : Math.min(Math.floor(this.sampleCarry), end - this.released, 800 - this.particles.length);
      this.sampleCarry %= 1;
      for (let sample = 0; sample < count; sample += 1) {
        const index = this.released + Math.floor(sample * (end - this.released) / count);
        this.particles.push({ index, startedAt: this.time, duration: profile.duration });
      }
      this.released = end;
    }
    // A speed change can let newer cohorts land first; never assume FIFO timing.
    this.cohorts = this.cohorts.filter((cohort) => {
      if (cohort.landsAt > this.time) return true;
      for (let index = cohort.start; index < cohort.end; index += 1) {
        const bin = this.simulation.outcomes[index] ?? 0;
        this.bins[bin] = (this.bins[bin] ?? 0) + 1;
      }
      this.processed += cohort.end - cohort.start;
      return false;
    });
  }

  snapshot(): GaltonProgress {
    return { released: this.released, processed: this.processed, bins: Array.from(this.bins), elapsedMs: this.time, activeParticles: this.particles.length };
  }
}
