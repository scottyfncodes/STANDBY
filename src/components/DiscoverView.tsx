"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { getAirline } from "@/lib/airlines/registry";
import { decodeRequest, encodeRequest } from "@/lib/domain/query";
import type { TripRequest } from "@/lib/domain/types";
import { defaultRequest, discover } from "@/lib/engine/discover";
import { formatShortDate } from "@/lib/engine/time";
import { DestinationCard } from "./DestinationCard";
import { useToday } from "./hooks";
import { Icon } from "./icons";
import { useStore } from "./store";
import { TopBar } from "./TopBar";
import { TripSetup, validate } from "./TripSetup";
import { Sheet } from "./ui";

const PAGE = 12;

function TripSummary({ request, onEdit }: { request: TripRequest; onEdit: () => void }) {
  const scope = request.scope === "any" ? "Anywhere" : request.scope === "domestic" ? "Within the US" : "Abroad";
  const extras = request.climates.length + request.interests.length + (request.budget ? 1 : 0) + (request.complexity === "nonstop" ? 1 : 0);
  return (
    <button type="button" className="card" onClick={onEdit} style={{ width: "100%", textAlign: "left", padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 17 }}>
          {request.origins.join(" / ")} · {formatShortDate(request.windowStart)} – {formatShortDate(request.windowEnd)}
        </span>
        <span className="small" style={{ display: "block", marginTop: 2 }}>
          {request.nights} nights · {request.travelers} traveler{request.travelers === 1 ? "" : "s"} · {scope}
          {request.homeBy ? ` · home by ${formatShortDate(request.homeBy)}` : ""}
          {extras ? ` · ${extras} filter${extras === 1 ? "" : "s"}` : ""}
        </span>
      </span>
      <span className="chip" style={{ pointerEvents: "none" }}>
        <Icon name="sliders" size={16} /> Edit
      </span>
    </button>
  );
}

export function DiscoverView() {
  const today = useToday();
  const { ready, profile, lastRequest, setLastRequest } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [request, setRequest] = useState<TripRequest | null>(null);
  const [editing, setEditing] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  // Resolve the initial search: URL → last search (if still in the future) → profile defaults.
  useEffect(() => {
    if (!ready || !today || request) return;
    const defaults: TripRequest = {
      ...defaultRequest(today, profile.homeAirports[0]),
      origins: profile.homeAirports.length ? profile.homeAirports : ["DFW"],
      useAlternateOrigins: profile.useNearbyAirports,
      nights: profile.defaultNights,
      travelers: Math.max(1, profile.party.travelers.length),
      risk: profile.risk,
      budget: profile.budget,
    };
    if (params.get("o")) setRequest(decodeRequest(params, defaults));
    else if (lastRequest && lastRequest.windowStart >= today) setRequest(lastRequest);
    else setRequest(defaults);
  }, [ready, today, request, params, profile, lastRequest]);

  // Keep the URL shareable and remember the search, without spamming history.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!request) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      router.replace(`/?${encodeRequest(request).toString()}`, { scroll: false });
      setLastRequest(request);
    }, 400);
    return () => clearTimeout(timer.current);
  }, [request, router, setLastRequest]);

  const deferred = useDeferredValue(request);
  const errors = deferred ? validate(deferred) : [];
  const output = useMemo(() => {
    if (!deferred || validate(deferred).length) return null;
    return discover(getAirline(profile.party.airline), deferred, profile.party);
  }, [deferred, profile.party]);
  const stale = deferred !== request;
  const query = deferred ? encodeRequest(deferred).toString() : "";

  return (
    <>
      <TopBar
        right={
          <Link href="/how-it-works" className="prov" style={{ textDecoration: "none" }}>
            Standby loads: not connected
          </Link>
        }
      />
      <main className="page">
        <section className="hero">
          <p className="eyebrow">Flexible travel, planned honestly</p>
          <h1 className="display">
            Where could <em>we</em> go?
          </h1>
          <p className="lede">Trips with real backup options — and a realistic way home before your deadline.</p>
        </section>

        <div className="split">
          <div className="sticky-col">
            {request && today ? (
              <>
                <div className="desktop-only">
                  <TripSetup request={request} onChange={setRequest} today={today} />
                </div>
                <div className="mobile-only">
                  <TripSummary request={request} onEdit={() => setEditing(true)} />
                </div>
                <Sheet open={editing} onClose={() => setEditing(false)} title="Your trip">
                  <div style={{ overflowY: "auto", flex: 1, minHeight: 0, margin: "12px calc(var(--gutter) * -1) 0", padding: "0 var(--gutter) 4px" }}>
                    <TripSetup request={request} onChange={setRequest} today={today} />
                    <button type="button" className="btn btn-block" style={{ marginTop: 14 }} onClick={() => setEditing(false)}>
                      Show trips
                    </button>
                  </div>
                </Sheet>
              </>
            ) : (
              <div className="skeleton" style={{ height: 120 }} />
            )}
            {errors.length > 0 && (
              <div className="notice" role="alert" style={{ marginTop: 12, background: "var(--bad-bg)", color: "var(--bad)" }}>
                <Icon name="alert" size={18} />
                <div>{errors.map((e) => <div key={e}>{e}</div>)}</div>
              </div>
            )}
          </div>

          <section aria-live="polite" aria-busy={stale} style={{ marginTop: 24 }}>
            {!output && !errors.length && (
              <div className="results">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 330 }} />
                ))}
              </div>
            )}
            {output && deferred && (
              <>
                <div className="between" style={{ marginBottom: 12, alignItems: "flex-end" }}>
                  <div>
                    <h2 className="h2">{output.results.length ? "Trips worth a look" : "Nothing fits yet"}</h2>
                    {output.results.length > 0 && (
                      <p className="small" style={{ margin: "4px 0 0" }}>
                        {output.results.length} destinations ranked for your dates
                      </p>
                    )}
                  </div>
                  {stale && <span className="tiny">Updating…</span>}
                </div>

                <div className="notice" style={{ marginBottom: 16 }}>
                  <Icon name="shield" size={18} />
                  <span>
                    Ranked by schedule depth, connection risk, seasonal patterns and your deadline — <strong>not live standby loads</strong>, which aren’t connected. Flight counts are approximate.{" "}
                    <Link href="/how-it-works">How this works</Link>
                  </span>
                </div>

                {output.results.length === 0 ? (
                  <div className="panel">
                    <p style={{ margin: 0 }}>No destinations match every filter for these dates. Try widening the window, allowing a connection, or clearing a weather preference.</p>
                  </div>
                ) : (
                  <div className="results" style={{ opacity: stale ? 0.55 : 1, transition: "opacity .2s" }}>
                    {output.results.slice(0, limit).map((r, i) => (
                      <DestinationCard key={r.destination.id} result={r} rank={i + 1} href={`/trip/${r.destination.id}?${query}&d=${r.best.date}`} />
                    ))}
                  </div>
                )}

                {output.results.length > limit && (
                  <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 16 }} onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, output.results.length - limit)} more of {output.results.length - limit}
                  </button>
                )}

                {output.filtered.length > 0 && (
                  <details className="disclosure panel" style={{ marginTop: 20 }}>
                    <summary className="between">
                      <span style={{ fontWeight: 650 }}>Not shown ({output.filtered.length})</span>
                      <Icon name="chevronDown" size={18} />
                    </summary>
                    <ul className="list-plain" style={{ marginTop: 10 }}>
                      {output.filtered.map((f) => (
                        <li key={f.destination.id} className="between">
                          <span>{f.destination.name}</span>
                          <span className="tiny" style={{ textAlign: "right" }}>
                            {f.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
