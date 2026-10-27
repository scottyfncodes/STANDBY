"use client";

import { formatDate, formatTime } from "@/lib/engine/time";
import type { FareOption } from "@/lib/fares/types";
import { useFare } from "./hooks";
import { Icon } from "./icons";

const money = (n: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

function itinerary(o: FareOption) {
  const stops = o.stops === 0 ? "nonstop" : `${o.stops} stop${o.stops > 1 ? "s" : ""}`;
  const nextDay = o.arr.date !== o.dep.date ? " +1" : "";
  return `${o.flights.join(", ")} · ${formatTime(o.dep.time)}–${formatTime(o.arr.time)}${nextDay} · ${stops}`;
}

/**
 * The "buy a confirmed seat" backup: cheapest public one-way fare for a trip direction.
 * Renders nothing when no fare provider is connected.
 */
export function FareCard({ from, to, date, airline, airlineName }: { from: string[]; to: string[]; date: string; airline: string; airlineName: string }) {
  const state = useFare(from, to, date, airline);
  if (state.status === "idle" || (state.status === "unavailable" && state.reason === "not_configured")) return null;

  const head = (
    <div className="fare-head">
      <span className="fare-title">
        <Icon name="ticket" size={17} /> Buy a confirmed seat
      </span>
      <span className="tiny num">
        {from.join("/")} → {to.join("/")} · {formatDate(date)}
      </span>
    </div>
  );

  if (state.status === "loading")
    return (
      <div className="fare" aria-busy="true">
        {head}
        <div className="fare-body" style={{ paddingTop: 12 }}>
          <span className="loading-note" role="status">
            Checking public fares…
          </span>
        </div>
      </div>
    );

  if (state.status === "unavailable")
    return (
      <div className="fare">
        {head}
        <div className="fare-body small" style={{ paddingTop: 10 }}>
          Public fares unavailable{state.reason === "unsupported" ? "" : " right now"} ({state.detail.replace(/\.$/, "") || state.reason}).
        </div>
      </div>
    );

  const q = state.quote;
  const own = q.cheapestOnAirline;
  const any = q.cheapest;
  const sameAsOwn = !!own && !!any && any.price >= own.price;
  const checked = state.provenance.asOf ? formatTime(new Date(state.provenance.asOf).toTimeString().slice(0, 5)) : undefined;
  const shown = own ?? any;
  const range = q.typicalRange;

  return (
    <div className="fare">
      {head}
      <div className="fare-body">
        {!any && !own ? (
          <p className="small" style={{ margin: "10px 0 0" }}>
            No one-way fares found for this date.
          </p>
        ) : (
          <div>
            {own && (
              <div className="fare-row">
                <span className="fare-label">{sameAsOwn ? `Cheapest, on ${airlineName}` : `On ${airlineName}`}</span>
                <span className="price">{money(own.price, q.currency)}</span>
                <span className="fare-itin">{itinerary(own)}</span>
              </div>
            )}
            {any && !sameAsOwn && (
              <div className="fare-row">
                <span className="fare-label">Cheapest, any airline{any.airlineNames.length ? ` (${any.airlineNames.join(" + ")})` : ""}</span>
                <span className="price">{money(any.price, q.currency)}</span>
                <span className="fare-itin">{itinerary(any)}</span>
                {own && <span className="badge plain tone-good fare-save">{money(own.price - any.price, q.currency)} less than {airlineName}</span>}
              </div>
            )}
            {!own && <div className="fare-row tiny">No {airlineName} fare found for this date.</div>}
          </div>
        )}
        {range && (
          <div className="range">
            <div className="tiny">
              Usually {money(range[0], q.currency)}–{money(range[1], q.currency)} for this trip{q.priceLevel ? `; prices are ${q.priceLevel} right now` : ""}.
            </div>
            {shown && range[1] > range[0] && (
              <div aria-hidden="true">
                <div className="range-track">
                  <span className="range-dot" style={{ left: `${Math.min(100, Math.max(0, ((shown.price - range[0]) / (range[1] - range[0])) * 100))}%` }} />
                </div>
                <div className="range-ends">
                  <span>{money(range[0], q.currency)}</span>
                  <span style={{ color: "var(--ink)", fontWeight: 650 }}>● {money(shown.price, q.currency)}</span>
                  <span>{money(range[1], q.currency)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <div className="fare-foot">
          One adult, one-way. Public fares from Google Flights (via SerpApi){checked ? `, checked ${checked}` : ""}. Prices change constantly, and seats for sale don’t tell you anything about standby.
          {q.searchUrl && (
            <>
              {" "}
              <a href={q.searchUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 650, color: "var(--ink)", whiteSpace: "nowrap" }}>
                Check on Google Flights <Icon name="external" size={12} style={{ verticalAlign: -1 }} />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
