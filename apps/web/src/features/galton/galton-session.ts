import { defaultGaltonConfig, sanitizeGaltonConfig, type GaltonConfig, type GaltonSimulation } from "./galton-engine";
import type { GaltonProgress } from "./galton-playback";

export const GALTON_SETTINGS_KEY = "getops.galton.settings.v1";

export function parseGaltonSettings(raw: string | null): GaltonConfig {
  try {
    const parsed: unknown = JSON.parse(raw ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...defaultGaltonConfig };
    const config = { ...defaultGaltonConfig };
    for (const key of Object.keys(config) as (keyof GaltonConfig)[]) {
      const value = (parsed as Record<string, unknown>)[key];
      if (key === "equation") {
        if (["constant", "linear", "wave", "attractor"].includes(String(value))) config.equation = value as GaltonConfig["equation"];
      } else if (typeof value === "number" && Number.isFinite(value)) config[key] = value;
    }
    return sanitizeGaltonConfig(config);
  } catch { return { ...defaultGaltonConfig }; }
}

export function readGaltonSettings(): GaltonConfig {
  try { return parseGaltonSettings(localStorage.getItem(GALTON_SETTINGS_KEY)); }
  catch { return { ...defaultGaltonConfig }; }
}

export function galtonResultsCsv(simulation: GaltonSimulation, progress: GaltonProgress): string {
  const config = simulation.config;
  const fields = Object.keys(config) as (keyof GaltonConfig)[];
  const header = ["bin", "settled_count", "observed_probability", "expected_probability", "total_settled", "total_released", ...fields];
  const rows = Array.from(simulation.expected, (expected, bin) => [bin, progress.bins[bin] ?? 0,
    progress.processed ? (progress.bins[bin] ?? 0) / progress.processed : 0,
    expected, progress.processed, progress.released, ...fields.map((key) => config[key])].join(","));
  return [header.join(","), ...rows].join("\n") + "\n";
}
