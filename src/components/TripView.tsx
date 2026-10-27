"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAirline } from "@/lib/airlines/registry";
import { getAirport } from "@/lib/data/airports";
import { getDestination, type Destination } from "@/lib/data/destinations";
import { decodeRequest, encodeRequest } from "@/lib/domain/query";
import type { TripRequest } from "@/lib/domain/types";
import { assessTrip, TIER_COPY, type Factor, type TripAssessment } from "@/lib/engine/assess";
import { DEMAND_LABEL, type DemandLevel } from "@/lib/engine/calendar";
import { compareDates, defaultRequest, type DateOption } from "@/lib/engine/discover";
import { ItineraryEngine, resilienceNotes, type Itinerary, type PathSummary } from "@/lib/engine/itinerary";
import { buildPlan, type FallbackKind, type FallbackOption, type TripPlan } from "@/lib/engine/plan";
import { formatDate, formatDuration, formatShortDate, formatTime, monthName, monthOf, weekdayName } from "@/lib/engine/time";
import type { ClimateResult } from "@/lib/providers/types";
import type { FlightHistory } from "@/lib/providers/history";
import { LiveSchedule } from "@/lib/providers/live";
import { LOAD_BAND_LABEL, loadBand, type FlightLoads } from "@/lib/providers/loads";
import { assessParty } from "@/lib/eligibility/party";
import { useFlightHistory, useFlightLoads, useLiveDay, useToday, type LiveState } from "./hooks";
import { Icon, type IconName } from "./icons";
import { useStore } from "./store";
import { PostcardArt, Prov, RouteDiagram, Segmented, TierBadge } from "./ui";

type Tab = "plan" | "dates" | "routes" | "backups" | "home" | "evidence";
const TABS: { id: Tab; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "dates", label: "Dates" },
  { id: "routes", label: "Routes" },
  { id: "backups", label: "Backups" },
  { id: "home", label: "Getting home" },
  { id: "evidence", label: "Evidence" },
];

export function TripView({ destinationId }: { destinationId: string }) {
  const destination = getDestination(destinationId)!;
  const today = useToday();
  const { ready, profile, toggleSaved, isSaved } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("plan");

  const request = useMemo<TripRequest | null>(() => {
    if (!today || !ready) return null;
    return decodeRequest(params, { ...defaultRequest(today, profile.homeAirports[0]), origins: profile.homeAirports, travelers: Math.max(1, profile.party.travelers.length) });
  }, [today, ready, params, profile]);

  const airline = getAirline(profile.party.airline);
  const historyState = useFlightHistory();
  const loadsState = useFlightLoads();
  const history = historyState.status === "ready" ? historyState.data : undefined;
  const loads = loadsState.status === "ready" ? loadsState.data : undefined;
  const dataLoading = historyState.status === "loading" || loadsState.status === "loading";
  const engine = useMemo(() => new ItineraryEngine(airline, history, loads), [airline, history, loads]);
  const comparison = useMemo(() => (request && !dataLoading ? compareDates({ airline, engine, request, party: profile.party, destination, maxDates: 62 }) : null), [airline, engine, request, profile.party, destination, dataLoading]);

  const wanted = params.get("d");
  const selected = comparison ? comparison.options.find((o) => o.date === wanted) ?? comparison.options[0] : undefined;
  const best = comparison?.options[0];

  // Live published schedules for the two airport-days the plan depends on most: leaving home on
  // the outbound date, and leaving the destination on the return date. Date ranking above keeps
  // using history so every date is compared on the same footing.
  const liveOut = useLiveDay(request?.origins[0], selected?.date);
  const liveBack = useLiveDay(destination.airports[0], selected?.returnDate);
  const live = useMemo(() => {
    const days = [liveOut, liveBack].flatMap((x) => (x.status === "ready" ? [x.day] : []));
    return days.length ? new LiveSchedule(days) : undefined;
  }, [liveOut, liveBack]);
  const planEngine = useMemo(() => (live ? new ItineraryEngine(airline, history, loads, live) : engine), [live, airline, history, loads, engine]);
  const assessment = useMemo(
    () => (selected && request ? (live ? assessTrip({ airline, engine: planEngine, request, party: profile.party, destination, outboundDate: selected.date }) : selected.assessment) : undefined),
    [selected, request, live, airline, planEngine, profile.party, destination],
  );
  const plan = useMemo(
    () => (assessment && request ? buildPlan({ engine: planEngine, assessment, destination, request, allOrigins: assessment.origins }) : undefined),
    [planEngine, assessment, destination, request],
  );
  const liveStates = { out: liveOut, back: liveBack };

  const climate = useClimate(destination.airports[0]!);
  const query = request ? encodeRequest(request).toString() : "";
  const saveId = selected ? `${destination.id}:${selected.date}:${request?.origins.join(",")}` : "";
  const pickDate = (d: string) => {
    router.replace(`/trip/${destination.id}?${query}&d=${d}`, { scroll: false });
    setTab("plan");
  };

  return (
    <main className="page">
      <div className="postcard trip-hero">
        <PostcardArt destination={destination} />
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 12px)", left: "var(--gutter)", right: "var(--gutter)" }} className="between">
          <Link href={`/?${query}`} className="icon-btn" aria-label="Back to results" style={{ background: "rgba(255,255,255,.85)", color: "var(--ink)", borderColor: "transparent" }}>
            <Icon name="arrowLeft" size={18} />
          </Link>
          {selected && (
            <button
              type="button"
              className="icon-btn"
              aria-pressed={isSaved(saveId)}
              aria-label={isSaved(saveId) ? "Remove from saved" : "Save trip"}
              style={{ background: isSaved(saveId) ? "var(--sun)" : "rgba(255,255,255,.85)", color: "var(--ink)", borderColor: "transparent" }}
              onClick={() => toggleSaved({ id: saveId, destinationId: destination.id, query: `${query}&d=${selected.date}`, date: selected.date })}
            >
              <Icon name="bookmark" size={18} fill={isSaved(saveId) ? "currentColor" : "none"} />
            </button>
          )}
        </div>
        <p className="eyebrow" style={{ color: "rgba(255,255,255,.8)", margin: 0 }}>
          {destination.region}
        </p>
        <h1 className="postcard-name" style={{ fontSize: 40 }}>
          {destination.name}
        </h1>
        {selected && (
          <div className="row" style={{ marginTop: 10, flexWrap: "wrap" }}>
            <TierBadge tier={(assessment ?? selected.assessment).tier} />
            <span style={{ fontSize: 14, fontWeight: 600 }} className="mono">
              {formatDate(selected.date)} → {formatDate(selected.returnDate)}
            </span>
          </div>
        )}
      </div>

      {!comparison || !request ? (
        <div className="stack" style={{ marginTop: 20 }}>
          <div className="skeleton" style={{ height: 48 }} />
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      ) : !selected || !plan ? (
        <NoOptions destination={destination} comparison={comparison} query={query} />
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Trip sections">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} type="button">
                {t.label}
              </button>
            ))}
          </div>
          {wanted && wanted !== selected.date && (
            <div className="notice" style={{ marginTop: 8 }}>
              <Icon name="info" size={18} />
              <span>{formatDate(wanted)} isn’t available for this search, so we’re showing {formatDate(selected.date)}.</span>
            </div>
          )}
          <div style={{ marginTop: 12 }} className="narrow">
            {tab === "plan" && <PlanTab a={assessment ?? selected.assessment} plan={plan} destination={destination} request={request} climate={climate} isBest={best?.date === selected.date} best={best} onPick={pickDate} goTo={setTab} history={history} />}
            {tab === "dates" && <DatesTab comparison={comparison} selected={selected.date} onPick={pickDate} destination={destination} request={request} climate={climate} engine={engine} />}
            {tab === "routes" && <RoutesTab plan={plan} a={assessment ?? selected.assessment} history={history} loads={loads} live={liveStates} />}
            {tab === "backups" && <BackupsTab plan={plan} />}
            {tab === "home" && <HomeTab plan={plan} a={assessment ?? selected.assessment} request={request} />}
            {tab === "evidence" && <EvidenceTab a={assessment ?? selected.assessment} airlineName={airline.name} climate={climate} history={history} loads={loads} live={liveStates} />}
          </div>
        </>
      )}
    </main>
  );
}

// ——— Climate (live via server route, reference fallback)

type ClimateState = { status: "loading" } | { status: "ok"; data: ClimateResult } | { status: "error" };

function useClimate(code: string): ClimateState {
  const [state, setState] = useState<ClimateState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    fetch(`/api/climate?airport=${code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: ClimateResult) => alive && setState({ status: "ok", data }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [code]);
  return state;
}

function climateFor(destination: Destination, climate: ClimateState, month: number) {
  if (climate.status === "ok") {
    const m = climate.data.months.find((x) => x.month === month);
    if (m) return { high: m.avgHighF, wetDays: m.wetDays, live: true as const };
  }
  return { high: destination.highF[month - 1]!, wetDays: undefined, live: false as const };
}

// ——— Plan

function PlanTab({ a, plan, destination, request, climate, isBest, best, onPick, goTo, history }: { a: TripAssessment; plan: TripPlan; destination: Destination; request: TripRequest; climate: ClimateState; isBest: boolean; best?: DateOption; onPick: (d: string) => void; goTo: (t: Tab) => void; history?: FlightHistory }) {
  const { profile } = useStore();
  const party = assessParty(profile.party, request.travelers);
  const first = plan.firstAttempt;
  const month = monthOf(a.outboundDate);
  const c = climateFor(destination, climate, month);
  const rp = plan.returnPlan;
  return (
    <div className="stack-lg">
      <p style={{ margin: 0, fontSize: 15.5, color: "var(--ink-2)" }}>{a.headline}</p>

      {!isBest && best && (
        <button type="button" className="notice" style={{ border: 0, width: "100%", textAlign: "left" }} onClick={() => onPick(best.date)}>
          <Icon name="calendar" size={18} />
          <span>
            Comparing every date in your window, <strong>{formatDate(best.date)}</strong> ranks a little better ({TIER_COPY[best.assessment.tier].label.toLowerCase()}). Tap to switch.
          </span>
        </button>
      )}

      <section className="card" style={{ padding: 16 }}>
        <div className="between">
          <span className="plan-label">Plan A</span>
          <span className="small">{formatDate(a.outboundDate)}</span>
        </div>
        {plan.primaryOut && first ? (
          <>
            <div style={{ marginTop: 26 }}>
              <RouteDiagram origin={plan.primaryOut.origin} via={plan.primaryOut.via} destination={plan.primaryOut.destination} legDaily={plan.primaryOut.legDaily} />
            </div>
            <p style={{ margin: "14px 0 0", fontSize: 15 }}>
              {first.legs[0]!.flight ? (
                <>
                  List for <strong>{first.legs[0]!.flight} at {formatTime(first.legs[0]!.depLocal.time)}</strong>, the first departure from {getAirport(first.origin)?.city}.
                </>
              ) : (
                <>
                  List for the <strong>first departure, around {formatTime(first.legs[0]!.depLocal.time)}</strong> from {getAirport(first.origin)?.city}.
                </>
              )}{" "}
              Arrive {first.basis === "live" ? "" : "about "}{formatTime(first.legs[first.legs.length - 1]!.arrLocal.time)}
              {first.arrivesLaterDay ? " the next day" : ""} local time · {formatDuration(first.totalMin)}.
            </p>
            <p className="tiny" style={{ margin: "6px 0 0" }}>
              {first.legs[0]!.basis === "live" ? "From the published schedule (live). Confirm on aa.com before you go." : <ScheduleSourceNote date={a.outboundDate} history={history} />}
            </p>
          </>
        ) : (
          <p className="small">No same-day routing found.</p>
        )}

        <hr className="divider" />
        <h3 className="h3">If it doesn’t clear</h3>
        <div style={{ marginTop: 10 }}>
          {plan.outboundFallbacks.slice(0, 2).map((f, i) => (
            <div key={f.title} className="row" style={{ alignItems: "flex-start", marginTop: i ? 10 : 0 }}>
              <span className="plan-label b">Plan {String.fromCharCode(66 + i)}</span>
              <div>
                <div style={{ fontWeight: 650, fontSize: 15 }}>{f.title}</div>
                <div className="small">{f.detail}</div>
              </div>
            </div>
          ))}
          <button type="button" className="btn btn-ghost" style={{ marginTop: 14, minHeight: 38, fontSize: 14 }} onClick={() => goTo("backups")}>
            All backups <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <div className="between">
          <h3 className="h3 row" style={{ gap: 8 }}>
            <Icon name="home" size={18} /> Getting home
          </h3>
          <DeadlineBadge risk={rp.deadlineRisk} />
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 15 }}>
          {plan.primaryBack ? (
            <>
              Start with the first <strong>{plan.primaryBack.via ? `${plan.primaryBack.origin} → ${plan.primaryBack.via} → ${plan.primaryBack.destination}` : `${plan.primaryBack.origin}–${plan.primaryBack.destination} nonstop`}</strong> on {formatDate(a.returnDate)}.{" "}
            </>
          ) : null}
          {rp.advice}
        </p>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 12, minHeight: 38, fontSize: 14 }} onClick={() => goTo("home")}>
          Return options <Icon name="arrowRight" size={16} />
        </button>
      </section>

      <section>
        <h2 className="h2" style={{ fontSize: 20 }}>
          Suggested sequence
        </h2>
        <div style={{ marginTop: 12 }}>
          {plan.sequence.map((s, i) => (
            <div className="plan-step" key={s}>
              <span className="plan-num">{i + 1}</span>
              <p style={{ margin: "3px 0 0", fontSize: 15 }}>{s}</p>
            </div>
          ))}
        </div>
      </section>

      {a.risks.length > 0 && (
        <section className="panel">
          <h3 className="h3">Main risks</h3>
          <ul className="list-plain" style={{ marginTop: 6 }}>
            {a.risks.map((r) => (
              <li key={r} className="row" style={{ alignItems: "flex-start" }}>
                <Icon name="alert" size={16} style={{ color: "var(--warn)", flex: "none", marginTop: 2 }} />
                {r}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid-2">
        <div className="panel">
          <div className="eyebrow">{monthName(month, true)} weather</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, marginTop: 4 }} className="mono">
            {Math.round(c.high)}°F
          </div>
          <div className="tiny">
            avg. daily high{c.wetDays !== undefined ? ` · ~${Math.round(c.wetDays)} wet days` : ""}
          </div>
          <div style={{ marginTop: 8 }}>{c.live ? <Prov kind="live" label="Open-Meteo history" /> : <Prov kind="reference" label={climate.status === "loading" ? "Loading…" : "Reference normals"} />}</div>
        </div>
        <div className="panel">
          <div className="eyebrow">Your party</div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, marginTop: 4 }}>
            {party.seatsNeeded} seat{party.seatsNeeded === 1 ? "" : "s"}
          </div>
          <div className="tiny">{profile.party.mustTravelTogether ? "on the same flight" : "can split up"}</div>
          <div style={{ marginTop: 8 }}>
            <Prov kind={party.prioritiesKnown ? "user" : "unavailable"} label={party.prioritiesKnown ? "Priority entered" : "Priority unknown"} />
          </div>
        </div>
      </section>
      {party.notes.length > 0 && (
        <div className="notice">
          <Icon name="user" size={18} />
          <div>
            {party.notes.map((n) => (
              <div key={n}>{n}</div>
            ))}
            <Link href="/profile" style={{ fontWeight: 650 }}>
              Edit travelers
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function DeadlineBadge({ risk }: { risk: TripPlan["returnPlan"]["deadlineRisk"] }) {
  const map = {
    low: ["tone-good", "Comfortable buffer"],
    moderate: ["tone-caution", "Some buffer"],
    high: ["t-high-risk", "Tight deadline"],
    "no-deadline": ["tone-unknown", "No deadline set"],
  } as const;
  const [cls, label] = map[risk];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ——— Dates

const LEVEL_BARS: Record<DemandLevel, number> = { lighter: 1, typical: 2, elevated: 3, peak: 4 };
const LEVEL_COLOR: Record<DemandLevel, string> = { lighter: "var(--good)", typical: "var(--ok)", elevated: "var(--warn)", peak: "var(--bad)" };

function Meter({ level }: { level: DemandLevel }) {
  return (
    <span className="meter" style={{ color: LEVEL_COLOR[level] }} aria-label={DEMAND_LABEL[level]}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={i <= LEVEL_BARS[level] ? "on" : ""} />
      ))}
    </span>
  );
}

function DatesTab({ comparison, selected, onPick, destination, request, climate, engine }: { comparison: NonNullable<ReturnType<typeof compareDates>>; selected: string; onPick: (d: string) => void; destination: Destination; request: TripRequest; climate: ClimateState; engine: ItineraryEngine }) {
  const [order, setOrder] = useState<"best" | "date">("best");
  const opts = order === "best" ? comparison.options : [...comparison.options].sort((a, b) => a.date.localeCompare(b.date));
  const bestDate = comparison.options[0]?.date;
  return (
    <div className="stack-lg">
      <div>
        <div className="between">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Compare departure dates
          </h2>
        </div>
        <p className="small" style={{ margin: "6px 0 12px" }}>
          Each date includes your {request.nights}-night return. Bars show calendar demand (out / back). STANDBY’s reference schedules don’t vary by weekday, so differences between ordinary weekdays come only from general patterns — treat them as low confidence.
        </p>
        <Segmented<"best" | "date">
          label="Order"
          value={order}
          onChange={setOrder}
          options={[
            { value: "best", label: "Best first" },
            { value: "date", label: "By date" },
          ]}
        />
      </div>

      <div className="stack">
        {opts.map((o) => (
          <button key={o.date} type="button" className="date-row" aria-pressed={o.date === selected} onClick={() => onPick(o.date)}>
            <span className="date-tile">
              <span className="dow" style={{ display: "block" }}>
                {weekdayName(o.date)}
              </span>
              <span className="dom" style={{ display: "block" }}>
                {Number(o.date.slice(8))}
              </span>
              <span className="mon" style={{ display: "block" }}>
                {monthName(monthOf(o.date))}
              </span>
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <TierBadge tier={o.assessment.tier} short />
                {o.date === bestDate && <span className="badge plain" style={{ background: "var(--sun)", color: "var(--night)" }}>Best</span>}
              </span>
              <span className="row tiny" style={{ marginTop: 6, gap: 6 }}>
                Out <Meter level={o.assessment.demandOut.level} /> Back <Meter level={o.assessment.demandBack.level} />
              </span>
              <span className="tiny" style={{ display: "block", marginTop: 4, color: "var(--ink-2)" }}>
                {dateReason(o)}
              </span>
            </span>
            <Icon name="chevronRight" size={18} style={{ color: "var(--faint)" }} />
          </button>
        ))}
      </div>

      {comparison.excluded.length > 0 && (
        <details className="disclosure panel">
          <summary className="between">
            <span style={{ fontWeight: 650 }}>Dates that don’t work ({comparison.excluded.length})</span>
            <Icon name="chevronDown" size={18} />
          </summary>
          <ul className="list-plain" style={{ marginTop: 8 }}>
            {comparison.excluded.slice(0, 40).map((e) => (
              <li key={e.date}>
                <strong>{formatShortDate(e.date)}</strong> — {e.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <SeasonOverview destination={destination} request={request} climate={climate} engine={engine} />
    </div>
  );
}

function dateReason(o: DateOption): string {
  const a = o.assessment;
  const strongest = (signals: { text: string; weight: number }[]) => [...signals].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight))[0];
  const out = strongest(a.demandOut.signals);
  const back = strongest(a.demandBack.signals);
  const parts = [`~${a.outbound.depth} ways in, ~${a.inbound.depth} home`];
  if (out) parts.push(`Out: ${out.text}`);
  if (back && back.text !== out?.text) parts.push(`Back: ${back.text}`);
  if (a.slackDays !== null) parts.push(a.slackDays === 0 ? "no spare days" : `${a.slackDays} spare day${a.slackDays === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

function SeasonOverview({ destination, request, climate, engine }: { destination: Destination; request: TripRequest; climate: ClimateState; engine: ItineraryEngine }) {
  const startMonth = monthOf(request.windowStart);
  const windowMonths = new Set([monthOf(request.windowStart), monthOf(request.windowEnd)]);
  const months = Array.from({ length: 12 }, (_, i) => ((startMonth - 1 + i) % 12) + 1);
  const primary = destination.airports[0]!;
  const network = engine.airline.network;
  const served = (m: number) => request.origins.some((o) => network.route(o, primary, m)) || engine.airline.hubs.some((h) => network.route(h, primary, m));
  return (
    <section>
      <h2 className="h2" style={{ fontSize: 20 }}>
        The year at a glance
      </h2>
      <p className="small" style={{ margin: "6px 0 12px" }}>
        Average highs, typical demand season and whether {primary} has {engine.airline.code} service that month.
      </p>
      <div className="months">
        {months.map((m) => {
          const c = climateFor(destination, climate, m);
          const peak = destination.peakMonths.includes(m);
          const svc = served(m);
          const storm = destination.stormMonths?.includes(m);
          return (
            <div key={m} className={`month ${windowMonths.has(m) ? "in-window" : ""}`}>
              <div className="m">{monthName(m)}</div>
              <div className="t">{Math.round(c.high)}°</div>
              <div className="s" style={{ color: !svc ? "var(--unk)" : peak ? "var(--warn)" : "var(--good)" }}>{!svc ? "No svc" : peak ? "Peak" : storm ? "Storms" : "Quieter"}</div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 10, flexWrap: "wrap", gap: 6 }}>
        {climate.status === "ok" ? <Prov kind="live" label="Highs: Open-Meteo 2021–25" /> : <Prov kind="reference" label="Highs: reference normals" />}
        <Prov kind="estimate" label="Season: general pattern" />
        <Prov kind="reference" label="Service: reference network" />
      </div>
    </section>
  );
}

// ——— Routes

function RoutesTab({ plan, a, history, loads, live }: { plan: TripPlan; a: TripAssessment; history?: FlightHistory; loads?: FlightLoads; live: { out: LiveState; back: LiveState } }) {
  const [dir, setDir] = useState<"out" | "back">("out");
  const paths = dir === "out" ? plan.outboundPaths : plan.returnPaths;
  const date = dir === "out" ? a.outboundDate : a.returnDate;
  return (
    <div className="stack-lg">
      <div>
        <Segmented<"out" | "back">
          label="Direction"
          value={dir}
          onChange={setDir}
          options={[
            { value: "out", label: `Out · ${formatShortDate(a.outboundDate)}` },
            { value: "back", label: `Home · ${formatShortDate(a.returnDate)}` },
          ]}
        />
        <div className="notice" style={{ marginTop: 12 }}>
          <Icon name="clock" size={18} />
          <span>
            <LiveNote state={dir === "out" ? live.out : live.back} /> <ScheduleSourceNote date={date} history={history} /> Public seat maps wouldn’t show standby availability anyway.
          </span>
        </div>
      </div>
      {paths.length === 0 && <div className="panel">No routings found for {formatDate(date)}.</div>}
      {paths.slice(0, 8).map((p, i) => (
        <PathCard key={p.key} p={p} recommended={i === 0} history={history} loads={loads} />
      ))}
      {paths.length > 8 && <p className="tiny">{paths.length - 8} more routings with fewer practical options aren’t shown.</p>}
    </div>
  );
}

/** What the live schedule did for this direction: used, out of range, or not connected. */
function LiveNote({ state }: { state: LiveState }) {
  if (state.status === "ready")
    return (
      <>
        Times marked <strong>live</strong> come from the published schedule for {state.day.airport} (AeroDataBox, fetched {formatTime(new Date(state.day.provenance.asOf ?? Date.now()).toTimeString().slice(0, 5))}), with flight numbers and current status.
      </>
    );
  if (state.status === "unavailable" && state.reason === "unsupported") return <>{state.detail}</>;
  if (state.status === "unavailable" && state.reason !== "not_configured") return <>Live schedule unavailable right now ({state.detail || state.reason}).</>;
  return null;
}

/** Explains where departure times come from for a date: last year's records, or estimates. */
function ScheduleSourceNote({ date, history }: { date: string; history?: FlightHistory }) {
  const observed = history?.observedLabel(monthOf(date));
  if (!history || !observed)
    return (
      <>
        Departure times are <strong>estimated</strong> from typical daily frequency — not a published schedule. Confirm real flights on aa.com.
      </>
    );
  return (
    <>
      Times marked <strong>as flown</strong> are how American operated these routes on {weekdayName(date, true)}s in {observed} (US DOT records). Others (marked ~) are <strong>estimated</strong>. This year’s schedule may differ — confirm on aa.com.
    </>
  );
}

function PathCard({ p, recommended, history, loads }: { p: PathSummary; recommended: boolean; history?: FlightHistory; loads?: FlightLoads }) {
  const sameDay = p.options.filter((o) => !o.overnightConnection);
  const last = sameDay[sameDay.length - 1];
  const legs = p.via ? [[p.origin, p.via], [p.via, p.destination]] : [[p.origin, p.destination]];
  const reliability = legs.map(([f, t]) => ({ f: f!, t: t!, r: history?.reliability(f!, t!) })).filter((x) => x.r && x.r.n >= 30);
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="between">
        <span className="small" style={{ fontWeight: 650 }}>
          {p.via ? `Connect in ${getAirport(p.via)?.city}` : "Nonstop"}
        </span>
        {recommended ? <span className="badge tone-good">Most practical</span> : p.weakestDaily <= 1 ? <span className="badge tone-caution">Once daily</span> : null}
      </div>
      <div style={{ marginTop: 26 }}>
        <RouteDiagram origin={p.origin} via={p.via} destination={p.destination} legDaily={p.legDaily} />
      </div>
      <div className="row tiny" style={{ marginTop: 14, gap: 14, flexWrap: "wrap" }}>
        <span>
          <Icon name="clock" size={13} /> {formatDuration(p.typicalMin)} best total
        </span>
        <span>{sameDay.length} same-day option{sameDay.length === 1 ? "" : "s"}</span>
        {p.basis === "live" ? (
          <Prov kind="live" label="Live schedule" />
        ) : p.basis === "historical" ? (
          <Prov kind="historical" label={`As flown · ${history?.observedLabel(monthOf(p.options[0]!.legs[0]!.depLocal.date)) ?? "BTS"}`} />
        ) : (
          <Prov kind="estimate" label={p.options.some((o) => o.legs.some((l) => l.basis !== "estimate")) ? "Partly estimated" : "Estimated times"} />
        )}
      </div>
      <div className="slots" style={{ marginTop: 10 }}>
        {p.options.map((o, i) => (
          <SlotChip key={o.id} it={o} first={i === 0} last={o === last} />
        ))}
      </div>
      {last && (
        <p className="tiny" style={{ margin: "8px 0 0" }}>
          Last realistic same-day attempt around <strong>{formatTime(last.legs[0]!.depLocal.time)}</strong>
          {last.arrivesLaterDay ? " (arrives next day)" : ""}.
          {p.overnightRisk ? " Later departures may mean a night at the hub." : ""}
        </p>
      )}
      <ul className="list-plain" style={{ marginTop: 10 }}>
        {resilienceNotes(p).map((n) => (
          <li key={n.text} className="row" style={{ alignItems: "flex-start", fontSize: 13.5 }}>
            <span className={`fallback-icon tone-${n.tone}`} style={{ width: 20, height: 20, borderRadius: 6, flex: "none", marginTop: 1 }}>
              <Icon name={n.tone === "caution" ? "alert" : "check"} size={12} />
            </span>
            {n.text}
          </li>
        ))}
      </ul>
      <LoadLines p={p} loads={loads} />
      {reliability.length > 0 && (
        <div className="tiny" style={{ marginTop: 8 }}>
          {reliability.map(({ f, t, r }) => (
            <div key={`${f}${t}`}>
              {f}→{t}: {r!.late15}% arrived 15+ min late, {r!.cancel}% cancelled ({r!.n.toLocaleString()} flights, BTS)
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Historical load factor per leg — explicitly an average from last year, not open seats. */
function LoadLines({ p, loads }: { p: PathSummary; loads?: FlightLoads }) {
  const sample = p.options[0];
  if (!loads || !sample) return null;
  const rows = sample.legs.map((l) => ({ l, load: loads.route(l.from, l.to, monthOf(l.depLocal.date)) })).filter((x) => x.load);
  if (!rows.length) return null;
  return (
    <div className="tiny" style={{ marginTop: 8 }}>
      {rows.map(({ l, load }) => (
        <div key={`${l.from}${l.to}`}>
          {l.from}→{l.to}: {LOAD_BAND_LABEL[loadBand(load!.loadFactor)].toLowerCase()} — averaged {Math.round(load!.loadFactor)}% full in {loads.label(load!)} (BTS T-100, historical average, not today’s open seats)
        </div>
      ))}
    </div>
  );
}

function SlotChip({ it, first, last }: { it: Itinerary; first: boolean; last: boolean }) {
  const leg = it.legs[0]!;
  const t = formatTime(leg.depLocal.time);
  const title = it.overnightConnection
    ? "Requires an overnight connection"
    : leg.flight
      ? `${it.legs.map((l) => l.flight ?? "").filter(Boolean).join(" + ")}${leg.status && leg.status !== "scheduled" ? ` · ${leg.status}` : ""}`
      : it.basis === "historical"
        ? "As flown in the same month of the BTS data"
        : "Estimated time";
  return (
    <span className={`slot ${first ? "first" : ""} ${last ? "last" : ""}`} title={title}>
      {leg.basis === "estimate" ? "~" : ""}
      {t}
      {leg.flight ? <span style={{ fontWeight: 500, opacity: 0.75 }}> {leg.flight.replace(" ", "")}</span> : null}
      {leg.status === "delayed" ? " ⚠︎" : ""}
      {it.overnightConnection ? " ☾" : ""}
    </span>
  );
}

// ——— Backups

const FALLBACK_ICON: Record<FallbackKind, IconName> = {
  "later-same-route": "clock",
  "other-hub": "route",
  nonstop: "plane",
  "alt-origin": "swap",
  "alt-destination": "pin",
  "next-day": "calendar",
  "hub-overnight": "moon",
};

function FallbackList({ items }: { items: FallbackOption[] }) {
  if (!items.length) return <p className="small">No alternatives found in the reference network.</p>;
  return (
    <div>
      {items.map((f) => (
        <div key={f.title} className="fallback">
          <span className={`fallback-icon tone-${f.tone}`}>
            <Icon name={FALLBACK_ICON[f.kind]} size={18} />
          </span>
          <div>
            <div style={{ fontWeight: 650 }}>{f.title}</div>
            <div className="small" style={{ marginTop: 2 }}>
              {f.detail}
            </div>
            {f.needsSetting && (
              <div className="tiny" style={{ marginTop: 4, color: "var(--ok)" }}>
                Off in your search · {f.needsSetting}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function BackupsTab({ plan }: { plan: TripPlan }) {
  return (
    <div className="stack-lg">
      <p className="small" style={{ margin: 0 }}>
        Ranked by how practical they are on the day — more remaining attempts and fewer moving parts rank higher.
      </p>
      <section className="card" style={{ padding: 16 }}>
        <h2 className="h2" style={{ fontSize: 20, marginBottom: 10 }}>
          Getting there
        </h2>
        <FallbackList items={plan.outboundFallbacks} />
      </section>
      <section className="card" style={{ padding: 16 }}>
        <h2 className="h2" style={{ fontSize: 20, marginBottom: 10 }}>
          Getting home
        </h2>
        <FallbackList items={plan.returnFallbacks} />
      </section>
    </div>
  );
}

// ——— Getting home

function HomeTab({ plan, a, request }: { plan: TripPlan; a: TripAssessment; request: TripRequest }) {
  const rp = plan.returnPlan;
  const max = Math.max(1, ...rp.days.map((d) => d.attempts));
  return (
    <div className="stack-lg">
      <section className="card" style={{ padding: 16 }}>
        <div className="between">
          <div>
            <div className="eyebrow">Must be home by</div>
            <div style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600, marginTop: 2 }}>{request.homeBy ? formatDate(request.homeBy) : "No deadline"}</div>
          </div>
          <DeadlineBadge risk={rp.deadlineRisk} />
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 15 }}>{rp.advice}</p>
        {!request.homeBy && <p className="tiny">Add a “must be home by” date on the search to see how many backups remain before it.</p>}
      </section>

      <section>
        <h2 className="h2" style={{ fontSize: 20 }}>
          Attempts home by day
        </h2>
        <p className="small" style={{ margin: "6px 0 12px" }}>
          Approximate flights you could try for from {a.destAirports.join("/")} to {a.homeAirports.join("/")}
          {request.homeBy ? " that land by the end of your deadline day" : ""}.
        </p>
        <div className="bars">
          {rp.days.map((d) => (
            <div key={d.date} className="bar-row">
              <span className="mono">{formatShortDate(d.date)}{d.date === a.returnDate ? " ★" : ""}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${(d.attempts / max) * 100}%`, display: "block", background: d.date === a.returnDate ? "var(--ink)" : undefined }} />
              </span>
              <span className="mono" style={{ textAlign: "right", fontWeight: 650 }}>
                {d.attempts}
              </span>
            </div>
          ))}
        </div>
        <p className="tiny" style={{ marginTop: 8 }}>
          ★ planned return day · {rp.totalAttempts} total attempts{request.homeBy ? " before the deadline" : " over the next few days"} · keeping {rp.reserve} in reserve ({request.risk})
        </p>
      </section>

      {rp.latestSensible && (
        <div className="notice dark">
          <Icon name="clock" size={18} />
          <span>
            Latest sensible first attempt: <strong>{formatDate(rp.latestSensible.legs[0]!.depLocal.date)} around {formatTime(rp.latestSensible.legs[0]!.depLocal.time)}</strong>
            {rp.latestSensible.via ? ` via ${rp.latestSensible.via}` : ""}. After that, fewer than {rp.reserve + 1} attempts remain.
          </span>
        </div>
      )}

      <section className="panel">
        <h3 className="h3">Last flights of the day</h3>
        <ul className="list-plain" style={{ marginTop: 6 }}>
          {rp.days.map((d) => (
            <li key={d.date} className="between">
              <span>{formatDate(d.date)}</span>
              <span className="mono small">{d.last ? `~${formatTime(d.last.legs[0]!.depLocal.time)} ${d.last.origin}${d.last.via ? `→${d.last.via}` : ""}` : "None"}</span>
            </li>
          ))}
        </ul>
        <p className="tiny" style={{ margin: "8px 0 0" }}>
          The final departure of the day is a cliff: if it doesn’t clear, the next try is tomorrow morning.
        </p>
      </section>

      {plan.returnFallbacks.length > 0 && (
        <section className="card" style={{ padding: 16 }}>
          <h3 className="h3" style={{ marginBottom: 8 }}>
            If the return doesn’t clear
          </h3>
          <FallbackList items={plan.returnFallbacks.slice(0, 4)} />
        </section>
      )}
    </div>
  );
}

// ——— Evidence

const IMPACT_CLASS = { helps: "tone-good", neutral: "tone-ok", hurts: "tone-caution" } as const;
const IMPACT_LABEL = { helps: "Helps", neutral: "Neutral", hurts: "Hurts" } as const;

function EvidenceTab({ a, airlineName, climate, history, loads, live }: { a: TripAssessment; airlineName: string; climate: ClimateState; history?: FlightHistory; loads?: FlightLoads; live: { out: LiveState; back: LiveState } }) {
  return (
    <div className="stack-lg">
      <section className="card" style={{ padding: 16 }}>
        <div className="between">
          <h2 className="h2" style={{ fontSize: 20 }}>
            Why “{TIER_COPY[a.tier].label}”
          </h2>
        </div>
        <p className="small" style={{ margin: "6px 0 4px" }}>
          A qualitative assessment built from the factors below. It is not a probability of clearing standby — STANDBY has no validated outcome data to support one.
        </p>
        <div style={{ marginTop: 8 }}>
          {a.factors.map((f) => (
            <FactorRow key={f.key} f={f} />
          ))}
          <div className="factor">
            <strong style={{ fontSize: 14.5 }}>Live standby loads</strong>
            <span className="badge tone-unknown">Unknown</span>
            <p>Open seats and the non-rev list aren’t available to STANDBY. On the day, check {airlineName}’s employee travel tools — they can overturn any assessment here.</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3 className="h3">What this used</h3>
        <ul className="list-plain" style={{ marginTop: 6 }}>
          <li className="between">
            <span>Route network & frequencies</span>
            <Prov kind="reference" label="Reference · Oct 2026" />
          </li>
          <li className="between">
            <span>Live schedule (leaving home / leaving {a.destAirports[0]})</span>
            <span className="row" style={{ gap: 4 }}>
              {[live.out, live.back].map((x, i) =>
                x.status === "ready" ? (
                  <Prov key={i} kind="live" label="Live" />
                ) : (
                  <Prov key={i} kind="unavailable" label={x.status === "loading" ? "Loading…" : x.status === "unavailable" && x.reason === "unsupported" ? "Out of range" : "Not connected"} />
                ),
              )}
            </span>
          </li>
          <li className="between">
            <span>Departure times (US domestic)</span>
            {history ? <Prov kind="historical" label={`As flown · ${history.provenance.asOf ?? "BTS"}`} /> : <Prov kind="estimate" />}
          </li>
          <li className="between">
            <span>Departure times (international)</span>
            <Prov kind="estimate" />
          </li>
          <li className="between">
            <span>Delays & cancellations by route</span>
            {history ? <Prov kind="historical" label="BTS on-time records" /> : <Prov kind="unavailable" />}
          </li>
          <li className="between">
            <span>How full flights ran (load factors)</span>
            {loads && a.factors.some((f) => f.key === "loads") ? (
              <Prov kind="historical" label={`BTS T-100 · ${loads.provenance.asOf ?? ""}`} />
            ) : (
              <Prov kind="unavailable" label={loads ? "No data for these routes" : "Not loaded"} />
            )}
          </li>
          <li className="between">
            <span>Holidays & school breaks</span>
            <Prov kind="estimate" label="Calendar patterns" />
          </li>
          <li className="between">
            <span>Weather</span>
            {climate.status === "ok" ? <Prov kind="live" label="Open-Meteo" /> : <Prov kind="reference" label="Reference normals" />}
          </li>
          <li className="between">
            <span>Party & deadline</span>
            <Prov kind="user" />
          </li>
          <li className="between">
            <span>Standby loads & priority lists</span>
            <Prov kind="unavailable" />
          </li>
          <li className="between">
            <span>Public fares</span>
            <Prov kind="unavailable" />
          </li>
        </ul>
      </section>

      <section className="panel">
        <h3 className="h3">Assumptions that matter</h3>
        <ul className="list-plain" style={{ marginTop: 6 }}>
          <li>Connections need at least 60 min domestically, 90 min internationally and 120 min after re-entering the US (STANDBY planning buffers, not American’s official minimums). About 30 of those minutes are needed even with no delay.</li>
          <li>Attempts home only count if they land by the end of your deadline day, in your home airport’s time zone.</li>
          <li>{history ? "US domestic times repeat the most recent BTS pattern for the same calendar month and weekday, which may be more than a year old for dates far ahead; international times are estimated and assumed daily." : "Typical service operates every day; real schedules vary by weekday and season."}</li>
          <li>Alternate arrival airports count for about a third of a primary-airport flight because of the ground transfer.</li>
          <li>Load factors are monthly averages from the most recent BTS data for flights operated by American and its wholly owned regionals (Envoy, PSA, Piedmont); SkyWest and Republic flights aren’t included. A busy route can still have open seats on a given flight, and a quiet one can be full.</li>
          <li>Your boarding priority is {a.party.prioritiesKnown ? "as you entered it" : "unknown, and may differ between travelers"}.</li>
        </ul>
      </section>

      <section className="panel">
        <h3 className="h3">What could change this</h3>
        <ul className="list-plain" style={{ marginTop: 6 }}>
          <li>Actual loads and the standby list on your flights.</li>
          <li>Schedule changes, seasonal start/end dates and aircraft swaps.</li>
          <li>Weather and irregular operations — especially at connection hubs.</li>
          <li>Employee travel rules for your relationship, which STANDBY hasn’t verified.</li>
        </ul>
      </section>
    </div>
  );
}

function FactorRow({ f }: { f: Factor }) {
  return (
    <div className="factor">
      <strong style={{ fontSize: 14.5 }}>{f.label}</strong>
      <span className={`badge ${IMPACT_CLASS[f.impact]}`}>{IMPACT_LABEL[f.impact]}</span>
      <p>{f.detail}</p>
    </div>
  );
}

function NoOptions({ destination, comparison, query }: { destination: Destination; comparison: NonNullable<ReturnType<typeof compareDates>>; query: string }) {
  return (
    <div className="stack" style={{ marginTop: 20 }}>
      <div className="panel">
        <h2 className="h2" style={{ fontSize: 20 }}>
          No workable dates in this window
        </h2>
        <p className="small">
          {comparison.excluded[0]?.reason ?? `We couldn't find ${destination.name} service for your search.`} Try a wider window, allowing a connection, or a later deadline.
        </p>
        <Link className="btn" href={`/?${query}`}>
          Adjust search
        </Link>
      </div>
    </div>
  );
}
