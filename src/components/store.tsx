"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_AIRLINE } from "@/lib/airlines/registry";
import type { AirportCode, Budget, RiskTolerance, TripRequest } from "@/lib/domain/types";
import type { Party } from "@/lib/eligibility/party";

/**
 * Preferences live only in this browser (localStorage). STANDBY deliberately has no
 * accounts in this phase: nothing here needs a server, and keeping traveler details
 * on-device keeps employee-related information out of servers and logs.
 */

export interface Profile {
  homeAirports: AirportCode[];
  useNearbyAirports: boolean;
  party: Party;
  defaultNights: number;
  risk: RiskTolerance;
  budget?: Budget;
  onboarded: boolean;
}

export interface SavedTrip {
  id: string;
  destinationId: string;
  query: string;
  date: string;
  savedAt: string;
}

const DEFAULT_PROFILE: Profile = {
  homeAirports: ["DFW"],
  useNearbyAirports: false,
  party: {
    airline: DEFAULT_AIRLINE,
    mustTravelTogether: true,
    travelers: [
      { id: "t1", name: "You", relationship: "other", priority: { status: "unknown" } },
      { id: "t2", name: "Spouse", relationship: "spouse", priority: { status: "unknown" } },
    ],
  },
  defaultNights: 4,
  risk: "balanced",
  onboarded: false,
};

interface Store {
  ready: boolean;
  profile: Profile;
  setProfile: (p: Profile) => void;
  lastRequest?: TripRequest;
  setLastRequest: (r: TripRequest) => void;
  saved: SavedTrip[];
  toggleSaved: (t: Omit<SavedTrip, "savedAt">) => void;
  isSaved: (id: string) => boolean;
}

const Ctx = createContext<Store | null>(null);
const KEY = "standby:v1";

function read<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(`${KEY}:${key}`);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(`${KEY}:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — keep working in memory */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfileState] = useState<Profile>(DEFAULT_PROFILE);
  const [lastRequest, setLastRequestState] = useState<TripRequest | undefined>();
  const [saved, setSaved] = useState<SavedTrip[]>([]);

  useEffect(() => {
    const p = read<Profile>("profile");
    if (p) setProfileState({ ...DEFAULT_PROFILE, ...p, party: { ...DEFAULT_PROFILE.party, ...p.party } });
    setLastRequestState(read<TripRequest>("request"));
    setSaved(read<SavedTrip[]>("saved") ?? []);
    setReady(true);
  }, []);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    write("profile", p);
    // New defaults should apply to the next search rather than a stale remembered one.
    setLastRequestState(undefined);
    try {
      window.localStorage.removeItem(`${KEY}:request`);
    } catch {
      /* ignore */
    }
  }, []);
  const setLastRequest = useCallback((r: TripRequest) => {
    setLastRequestState(r);
    write("request", r);
  }, []);
  const toggleSaved = useCallback((t: Omit<SavedTrip, "savedAt">) => {
    setSaved((cur) => {
      const next = cur.some((x) => x.id === t.id) ? cur.filter((x) => x.id !== t.id) : [{ ...t, savedAt: new Date().toISOString() }, ...cur];
      write("saved", next);
      return next;
    });
  }, []);
  const isSaved = useCallback((id: string) => saved.some((s) => s.id === id), [saved]);

  const value = useMemo(
    () => ({ ready, profile, setProfile, lastRequest, setLastRequest, saved, toggleSaved, isSaved }),
    [ready, profile, setProfile, lastRequest, setLastRequest, saved, toggleSaved, isSaved],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
