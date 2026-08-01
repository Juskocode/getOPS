export interface OperatorRank {
  name: string;
  threshold: number;
}

export const operatorRanks: OperatorRank[] = [
  { name: "Market Observer", threshold: 0 },
  { name: "Quote Cadet", threshold: 100 },
  { name: "Book Mapper", threshold: 250 },
  { name: "Feed Sentinel", threshold: 500 },
  { name: "Session Controller", threshold: 900 },
  { name: "Execution Keeper", threshold: 1_400 },
  { name: "Latency Hunter", threshold: 2_200 },
  { name: "Incident Commander", threshold: 3_200 },
  { name: "Market Ops Specialist", threshold: 4_500 },
  { name: "Reliability Lead", threshold: 6_000 },
  { name: "Trading Ops Vanguard", threshold: 8_000 },
];

export function rankProgress(xpInput: number) {
  const xp = Math.max(0, Math.floor(xpInput));
  const currentIndex = operatorRanks.findLastIndex((rank) => xp >= rank.threshold);
  const current = operatorRanks[Math.max(0, currentIndex)] ?? operatorRanks[0]!;
  const next = operatorRanks[currentIndex + 1] ?? null;
  const earnedWithinRank = xp - current.threshold;
  const rankSpan = next ? next.threshold - current.threshold : 0;
  return {
    xp,
    current,
    next,
    rankNumber: currentIndex + 1,
    totalRanks: operatorRanks.length,
    xpToNext: next ? Math.max(0, next.threshold - xp) : 0,
    progress: next ? Math.round((earnedWithinRank / rankSpan) * 100) : 100,
  };
}
