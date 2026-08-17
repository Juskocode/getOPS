import { useEffect, useRef } from "react";

import type { GaltonSimulation } from "./galton-engine";

export type GaltonSpeed = "slow" | "normal" | "fast";

export interface GaltonProgress {
  processed: number;
  bins: number[];
  elapsedMs: number;
  activeParticles: number;
}

export const galtonSpeedProfiles: Record<GaltonSpeed, { rate: number; duration: number }> = {
  slow: { rate: 600, duration: 2_200 },
  normal: { rate: 3_500, duration: 1_350 },
  fast: { rate: 15_000, duration: 760 },
};

interface GaltonCanvasProps {
  simulation: GaltonSimulation;
  runId: number;
  running: boolean;
  speed: GaltonSpeed;
  onProgress: (progress: GaltonProgress) => void;
  onComplete: () => void;
}

interface ActiveParticle {
  index: number;
  startedAt: number;
  duration: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function particlePosition(
  path: number,
  progress: number,
  rows: number,
  centerX: number,
  gapX: number,
  top: number,
  gapY: number,
): { x: number; y: number } {
  const scaled = clamp(progress, 0, 1) * rows;
  const completedRows = Math.min(rows, Math.floor(scaled));
  const fraction = Math.min(1, scaled - completedRows);
  let rights = 0;
  for (let row = 0; row < completedRows; row += 1) {
    rights += (path >>> row) & 1;
  }
  let x = centerX + (rights - completedRows / 2) * gapX;
  if (completedRows < rows) {
    const right = (path >>> completedRows) & 1;
    x += (right ? 0.5 : -0.5) * gapX * fraction;
  }
  const bounce = completedRows < rows ? Math.sin(fraction * Math.PI) * gapY * 0.12 : 0;
  return { x, y: top + scaled * gapY - bounce };
}

function drawBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  simulation: GaltonSimulation,
  bins: Uint32Array,
  processed: number,
  particles: ActiveParticle[],
  visualTime: number,
  reducedMotion: boolean,
) {
  const { rows } = simulation.config;
  const marginX = clamp(width * 0.055, 22, 72);
  const histogramHeight = clamp(height * 0.24, 88, 168);
  const top = clamp(height * 0.07, 30, 54);
  const boardBottom = height - histogramHeight - 34;
  const gapY = (boardBottom - top) / rows;
  const gapX = Math.min((width - marginX * 2) / (rows + 1), gapY * 1.52);
  const centerX = width / 2;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#0c0f0e";
  context.fillRect(0, 0, width, height);

  const background = context.createLinearGradient(0, top, 0, boardBottom);
  background.addColorStop(0, "rgba(114, 183, 255, 0.025)");
  background.addColorStop(0.55, "rgba(241, 202, 97, 0.025)");
  background.addColorStop(1, "rgba(99, 214, 160, 0.018)");
  context.fillStyle = background;
  context.fillRect(marginX, top, width - marginX * 2, boardBottom - top);

  context.strokeStyle = "rgba(222, 190, 103, 0.055)";
  context.lineWidth = 1;
  context.beginPath();
  for (let row = 0; row < rows; row += 1) {
    const y = top + row * gapY;
    for (let node = 0; node <= row; node += 1) {
      const x = centerX + (node - row / 2) * gapX;
      context.moveTo(x, y);
      context.lineTo(x - gapX / 2, y + gapY);
      context.moveTo(x, y);
      context.lineTo(x + gapX / 2, y + gapY);
    }
  }
  context.stroke();

  if (!reducedMotion) {
    const scanProgress = (visualTime % 5_000) / 5_000;
    const scanY = top + scanProgress * (boardBottom - top);
    const scan = context.createLinearGradient(0, scanY - 18, 0, scanY + 18);
    scan.addColorStop(0, "rgba(241, 202, 97, 0)");
    scan.addColorStop(0.5, "rgba(241, 202, 97, 0.07)");
    scan.addColorStop(1, "rgba(241, 202, 97, 0)");
    context.fillStyle = scan;
    context.fillRect(marginX, scanY - 18, width - marginX * 2, 36);
  }

  const pegRadius = clamp(gapX * 0.105, 1.7, 3.2);
  context.save();
  context.shadowColor = "rgba(241, 202, 97, 0.48)";
  context.shadowBlur = 5;
  for (let row = 0; row < rows; row += 1) {
    const y = top + row * gapY;
    context.beginPath();
    for (let node = 0; node <= row; node += 1) {
      const x = centerX + (node - row / 2) * gapX;
      context.moveTo(x + pegRadius, y);
      context.arc(x, y, pegRadius, 0, Math.PI * 2);
    }
    context.fillStyle = row % 2 === 0 ? "#f0cb69" : "#c99a3b";
    context.fill();
  }
  context.restore();

  context.save();
  context.fillStyle = "#fff0b8";
  context.shadowColor = "rgba(255, 225, 132, 0.9)";
  context.shadowBlur = 9;
  context.beginPath();
  context.arc(centerX, Math.max(13, top - 18), clamp(pegRadius * 1.4, 3, 4.5), 0, Math.PI * 2);
  context.fill();
  context.restore();

  const baseline = height - 26;
  const chartTop = boardBottom + 21;
  const chartHeight = Math.max(44, baseline - chartTop);
  const observed = Array.from(bins, (count) => (processed ? count / processed : 0));
  const maximumProbability = Math.max(0.001, ...observed, ...simulation.expected);
  const barWidth = Math.max(3, gapX * 0.72);
  const barGradient = context.createLinearGradient(0, chartTop, 0, baseline);
  barGradient.addColorStop(0, "#ffe399");
  barGradient.addColorStop(0.45, "#e3ac43");
  barGradient.addColorStop(1, "#7d541c");

  context.strokeStyle = "rgba(156, 165, 159, 0.2)";
  context.beginPath();
  context.moveTo(marginX, baseline + 0.5);
  context.lineTo(width - marginX, baseline + 0.5);
  context.stroke();

  for (let bin = 0; bin <= rows; bin += 1) {
    const x = centerX + (bin - rows / 2) * gapX;
    const probability = observed[bin] ?? 0;
    const barHeight = (probability / maximumProbability) * chartHeight;
    context.fillStyle = processed ? barGradient : "rgba(241, 202, 97, 0.08)";
    context.fillRect(x - barWidth / 2, baseline - barHeight, barWidth, Math.max(processed ? 1 : 0, barHeight));
  }

  context.strokeStyle = "#72b7ff";
  context.lineWidth = 1.7;
  context.beginPath();
  for (let bin = 0; bin <= rows; bin += 1) {
    const x = centerX + (bin - rows / 2) * gapX;
    const y = baseline - ((simulation.expected[bin] ?? 0) / maximumProbability) * chartHeight;
    if (bin === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();

  const labelStep = rows > 16 ? 4 : rows > 10 ? 2 : 1;
  context.fillStyle = "rgba(156, 165, 159, 0.72)";
  context.font = "10px ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  for (let bin = 0; bin <= rows; bin += labelStep) {
    const x = centerX + (bin - rows / 2) * gapX;
    context.fillText(String(bin), x, height - 8);
  }

  if (!reducedMotion && particles.length) {
    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = "rgba(255, 229, 153, 0.88)";
    context.shadowColor = "rgba(255, 205, 94, 0.8)";
    context.shadowBlur = 6;
    context.beginPath();
    for (const particle of particles) {
      const progress = (visualTime - particle.startedAt) / particle.duration;
      const path = simulation.paths[particle.index] ?? 0;
      const position = particlePosition(path, progress, rows, centerX, gapX, top, gapY);
      const jitter = ((((particle.index * 2_654_435_761) >>> 0) % 101) / 100 - 0.5) * 1.2;
      const radius = clamp(pegRadius * 0.86, 1.6, 2.8);
      context.moveTo(position.x + jitter + radius, position.y);
      context.arc(position.x + jitter, position.y, radius, 0, Math.PI * 2);
    }
    context.fill();
    context.restore();
  }
}

export function GaltonCanvas({
  simulation,
  runId,
  running,
  speed,
  onProgress,
  onComplete,
}: GaltonCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const progressRef = useRef(onProgress);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    progressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let frame = 0;
    let previousTimestamp = performance.now();
    let visualTime = 0;
    let elapsedMs = 0;
    let carry = 0;
    let processed = 0;
    let lastReport = 0;
    let completionNotified = false;
    let pausedDrawn = false;
    let activeParticles: ActiveParticle[] = [];
    const bins = new Uint32Array(simulation.config.rows + 1);
    const reducedMotionQuery = globalThis.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(320, bounds.width);
      height = Math.max(360, bounds.height);
      pixelRatio = Math.min(2, globalThis.devicePixelRatio || 1);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      pausedDrawn = false;
    };

    const report = () => {
      progressRef.current({
        processed,
        bins: Array.from(bins),
        elapsedMs,
        activeParticles: activeParticles.length,
      });
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    report();

    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      if (reducedMotion) activeParticles = [];
      pausedDrawn = false;
    };
    reducedMotionQuery.addEventListener("change", handleMotionPreference);

    const animate = (timestamp: number) => {
      const delta = Math.min(50, Math.max(0, timestamp - previousTimestamp));
      previousTimestamp = timestamp;
      const profile = galtonSpeedProfiles[speedRef.current];

      if (runningRef.current) {
        pausedDrawn = false;
        visualTime += delta;
        if (processed < simulation.config.ballCount) {
          elapsedMs += delta;
          const exactAddition = carry + (profile.rate * delta) / 1_000;
          const addition = Math.floor(exactAddition);
          carry = exactAddition - addition;
          const nextProcessed = Math.min(simulation.config.ballCount, processed + addition);

          if (nextProcessed > processed) {
            const newCount = nextProcessed - processed;
            const sampleCount = reducedMotion ? 0 : Math.min(18, newCount);
            const sampleStride = sampleCount ? newCount / sampleCount : 0;
            for (let sample = 0; sample < sampleCount; sample += 1) {
              const index = Math.min(nextProcessed - 1, processed + Math.floor(sample * sampleStride));
              activeParticles.push({ index, startedAt: visualTime, duration: profile.duration });
            }
            for (let index = processed; index < nextProcessed; index += 1) {
              const bin = simulation.outcomes[index] ?? 0;
              bins[bin] = (bins[bin] ?? 0) + 1;
            }
            processed = nextProcessed;
          }
        }

        if (activeParticles.length) {
          activeParticles = activeParticles.filter(
            (particle) => visualTime - particle.startedAt < particle.duration,
          );
          if (activeParticles.length > 900) activeParticles.splice(0, activeParticles.length - 900);
        }
      }

      if (!runningRef.current && pausedDrawn) {
        frame = globalThis.requestAnimationFrame(animate);
        return;
      }

      drawBoard(
        context,
        width,
        height,
        simulation,
        bins,
        processed,
        activeParticles,
        visualTime,
        reducedMotion,
      );
      if (!runningRef.current) pausedDrawn = true;

      if (timestamp - lastReport >= 100 || processed === simulation.config.ballCount) {
        report();
        lastReport = timestamp;
      }
      if (
        !completionNotified &&
        processed === simulation.config.ballCount &&
        activeParticles.length === 0
      ) {
        completionNotified = true;
        completeRef.current();
        return;
      }

      frame = globalThis.requestAnimationFrame(animate);
    };

    frame = globalThis.requestAnimationFrame(animate);
    return () => {
      globalThis.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      reducedMotionQuery.removeEventListener("change", handleMotionPreference);
    };
  }, [runId, simulation]);

  return (
    <canvas
      ref={canvasRef}
      className="galton-canvas"
      role="img"
      aria-label="Animated Galton board with live observed histogram and expected distribution curve"
    />
  );
}
