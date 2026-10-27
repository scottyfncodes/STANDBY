import type { Airport } from "@/lib/domain/types";
import type { ClimateResult, MonthlyClimate } from "./types";

/**
 * Open-Meteo historical weather (ERA5-based archive). Free, no API key, CC BY 4.0.
 * We average five full years of daily highs and count days with ≥1 mm precipitation.
 * Runs server-side; responses are cached for 30 days.
 */
export const CLIMATE_YEARS = { start: "2021-01-01", end: "2025-12-31" };

export function openMeteoUrl(a: Pick<Airport, "lat" | "lon">): string {
  const p = new URLSearchParams({
    latitude: a.lat.toFixed(3),
    longitude: a.lon.toFixed(3),
    start_date: CLIMATE_YEARS.start,
    end_date: CLIMATE_YEARS.end,
    daily: "temperature_2m_max,precipitation_sum",
    temperature_unit: "fahrenheit",
    timezone: "UTC",
  });
  return `https://archive-api.open-meteo.com/v1/archive?${p}`;
}

interface OpenMeteoDaily {
  daily?: { time?: string[]; temperature_2m_max?: (number | null)[]; precipitation_sum?: (number | null)[] };
}

/** Aggregate Open-Meteo daily series into monthly averages. Pure; unit-tested. */
export function aggregateMonthly(json: OpenMeteoDaily): MonthlyClimate[] {
  const time = json.daily?.time ?? [];
  const tmax = json.daily?.temperature_2m_max ?? [];
  const prcp = json.daily?.precipitation_sum ?? [];
  const acc = Array.from({ length: 12 }, () => ({ sum: 0, n: 0, wet: 0, years: new Set<string>() }));
  time.forEach((t, i) => {
    const m = Number(t.slice(5, 7)) - 1;
    const bucket = acc[m];
    if (!bucket) return;
    const hi = tmax[i];
    if (typeof hi === "number") {
      bucket.sum += hi;
      bucket.n++;
    }
    const p = prcp[i];
    if (typeof p === "number" && p >= 1) bucket.wet++;
    bucket.years.add(t.slice(0, 4));
  });
  return acc
    .map((b, i) => ({ month: i + 1, avgHighF: b.n ? Math.round((b.sum / b.n) * 10) / 10 : NaN, wetDays: b.years.size ? Math.round((b.wet / b.years.size) * 10) / 10 : undefined }))
    .filter((m) => Number.isFinite(m.avgHighF));
}

export async function fetchClimate(a: Airport, fetcher: typeof fetch = fetch): Promise<ClimateResult> {
  const res = await fetcher(openMeteoUrl(a), { next: { revalidate: 60 * 60 * 24 * 30 } } as RequestInit);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const months = aggregateMonthly((await res.json()) as OpenMeteoDaily);
  if (months.length < 12) throw new Error("Incomplete climate data");
  return {
    months,
    provenance: {
      kind: "live",
      source: "Open-Meteo Historical Weather API (CC BY 4.0)",
      asOf: new Date().toISOString(),
      note: `Averages of daily data ${CLIMATE_YEARS.start.slice(0, 4)}–${CLIMATE_YEARS.end.slice(0, 4)}`,
    },
  };
}
