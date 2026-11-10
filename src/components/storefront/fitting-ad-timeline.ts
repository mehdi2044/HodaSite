export const FITTING_FLIGHT_MS = 1500;
export const fittingDeparture = (index: number) => 700 + index * 1250;
export function fittingTiming(count: number) {
  const scan = fittingDeparture(count - 1) + 1850;
  const reveal = scan + 1100;
  return { scan, reveal, end: reveal + 3600 };
}
export function fittingPhase(time: number, count: number) {
  const { scan, reveal } = fittingTiming(count);
  if (time >= reveal) return { phase: "look", number: count + 2 } as const;
  if (time >= scan) return { phase: "style", number: count + 1 } as const;
  if (time >= fittingDeparture(0))
    return {
      phase: "dress",
      number: Math.min(
        count,
        1 + Math.floor((time - fittingDeparture(0)) / 1250),
      ),
    } as const;
  return { phase: "pick", number: 1 } as const;
}
