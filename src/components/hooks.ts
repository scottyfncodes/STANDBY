"use client";

import { useEffect, useState } from "react";
import { todayIn } from "@/lib/engine/time";
import { createHistory, isHistoryFile, type FlightHistory } from "@/lib/providers/history";

/** Today's date in the device's zone, resolved after mount to avoid hydration mismatch. */
export function useToday(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayIn()), []);
  return today;
}


export type HistoryState = { status: "loading" } | { status: "ready"; history: FlightHistory } | { status: "unavailable" };

let historyPromise: Promise<HistoryState> | undefined;

/** Load the static BTS history file once per page load; never blocks longer than a few seconds. */
function loadHistory(): Promise<HistoryState> {
  historyPromise ??= Promise.race([
    fetch("/data/aa-history.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: unknown): HistoryState => (isHistoryFile(json) ? { status: "ready", history: createHistory(json) } : { status: "unavailable" })),
    new Promise<HistoryState>((resolve) => setTimeout(() => resolve({ status: "unavailable" }), 6000)),
  ]).catch((): HistoryState => ({ status: "unavailable" }));
  return historyPromise;
}

/** Historical schedules & reliability, or `unavailable` (the app then uses reference estimates). */
export function useFlightHistory(): HistoryState {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadHistory().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
