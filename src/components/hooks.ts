"use client";

import { useEffect, useState } from "react";
import { todayIn } from "@/lib/engine/time";
import { createHistory, isHistoryFile, type FlightHistory } from "@/lib/providers/history";
import { createLoads, isLoadsFile, type FlightLoads } from "@/lib/providers/loads";

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
