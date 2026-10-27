"use client";

import { useEffect, useState } from "react";
import { todayIn } from "@/lib/engine/time";
import { createHistory, isHistoryFile, type FlightHistory } from "@/lib/providers/history";
import { createLoads, isLoadsFile, type FlightLoads } from "@/lib/providers/loads";
import type { LiveDay } from "@/lib/providers/live";

/** Today's date in the device's zone, resolved after mount to avoid hydration mismatch. */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayIn()), []);
  return today;
}

export type DataState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "unavailable" };
export type HistoryState = DataState<FlightHistory>;

const cache = new Map<string, Promise<DataState<unknown>>>();

/** Load a static data file once per page load; never blocks longer than a few seconds. */
function loadOnce<T>(url: string, accept: (json: unknown) => T | undefined): Promise<DataState<T>> {
  let p = cache.get(url) as Promise<DataState<T>> | undefined;
  if (!p) {
    p = Promise.race([
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((json: unknown): DataState<T> => {
          const data = accept(json);
          return data ? { status: "ready", data } : { status: "unavailable" };
        }),
      new Promise<DataState<T>>((resolve) => setTimeout(() => resolve({ status: "unavailable" }), 6000)),
    ]).catch((): DataState<T> => ({ status: "unavailable" }));
    cache.set(url, p as Promise<DataState<unknown>>);
  }
  return p;
}

function useStaticData<T>(url: string, accept: (json: unknown) => T | undefined): DataState<T> {
  const [state, setState] = useState<DataState<T>>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadOnce(url, accept).then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [url, accept]);
  return state;
}

const acceptHistory = (json: unknown) => (isHistoryFile(json) ? createHistory(json) : undefined);
const acceptLoads = (json: unknown) => (isLoadsFile(json) ? createLoads(json) : undefined);

/** Historical schedules & reliability, or `unavailable` (the app then uses reference estimates). */
export function useFlightHistory(): DataState<FlightHistory> {
  return useStaticData("/data/aa-history.json", acceptHistory);
}

/** Historical load factors (BTS T-100), or `unavailable` (the factor is then omitted). */
export function useFlightLoads(): DataState<FlightLoads> {
  return useStaticData("/data/aa-loads.json", acceptLoads);
}

export type LiveState = { status: "idle" } | { status: "loading" } | { status: "ready"; day: LiveDay } | { status: "unavailable"; reason: string; detail: string };

const liveCache = new Map<string, Promise<LiveState>>();

/**
 * Live departures for one airport-day, via the server (the provider key never reaches the
 * browser). Resolves to `unavailable` with the server's reason when no provider is connected,
 * the date is outside the live horizon, or the provider fails, so the plan falls back cleanly.
 */
export function useLiveDay(airport: string | undefined, date: string | undefined, carrier = "AA"): LiveState {
  const [state, setState] = useState<LiveState>({ status: "idle" });
  useEffect(() => {
    if (!airport || !date) {
      setState({ status: "idle" });
      return;
    }
    const key = `${carrier}|${airport}|${date}`;
    let p = liveCache.get(key);
    if (!p) {
      p = fetch(`/api/flights/departures?${new URLSearchParams({ airport, date, carrier })}`)
        .then(async (r): Promise<LiveState> => {
          const body = (await r.json()) as { ok: boolean; data?: LiveDay["flights"]; provenance?: LiveDay["provenance"]; reason?: string; detail?: string };
          if (body.ok && body.data && body.provenance) return { status: "ready", day: { airport, date, flights: body.data, provenance: body.provenance } };
          return { status: "unavailable", reason: body.reason ?? "unavailable", detail: body.detail ?? "" };
        })
        .catch((): LiveState => ({ status: "unavailable", reason: "unavailable", detail: "Live schedule request failed." }));
      liveCache.set(key, p);
    }
    let alive = true;
    setState({ status: "loading" });
    p.then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, [airport, date, carrier]);
  return state;
}
