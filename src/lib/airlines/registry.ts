import { americanAirlines } from "./american";
import type { AirlineAdapter } from "./types";

/** Register additional airlines here; nothing else in the app is carrier-specific. */
export const AIRLINES: Record<string, AirlineAdapter> = {
  [americanAirlines.code]: americanAirlines,
};

export const DEFAULT_AIRLINE = americanAirlines.code;

export function getAirline(code: string): AirlineAdapter {
  return AIRLINES[code] ?? americanAirlines;
}
