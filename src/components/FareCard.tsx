"use client";

import { formatDate, formatTime } from "@/lib/engine/time";
import type { FareOption } from "@/lib/fares/types";
import { useFare } from "./hooks";

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
    <div className="between" style={{ alignItems: "baseline" }}>
      <div style={{ fontWeight: 650 }}>Buy a confirmed seat</div>
      <span className="tiny">
        {from.join("/")} → {to.join("/")} · {formatDate(date)}
      </span>
    </div>
  );

  if (state.status === "loading")
    return (
      <div className="notice" style={{ display: "block" }}>
        {head}
        <div className="small" style={{ marginTop: 4 }}>
          Checking public fares…
        </div>
      </div>
    );

  if (state.status === "unavailable")
    return (
      <div className="notice" style={{ display: "block" }}>
        {head}
        <div className="small" style={{ marginTop: 4 }}>
          Public fares unavailable{state.reason === "unsupported" ? "" : " right now"} ({state.detail.replace(/\.$/, "") || state.reason}).
        </div>
      </div>
    );

  const q = state.quote;
  const own = q.cheapestOnAirline;
  const any = q.cheapest;
  const sameAsOwn = !!own && !!any && any.price >= own.price;
  const checked = state.provenance.asOf ? formatTime(new Date(state.provenance.asOf).toTimeString().slice(0, 5)) : undefined;

  return (
    <div className="notice" style={{ display: "block" }}>
      {head}
      {!any && !own ? (
        <div className="small" style={{ marginTop: 4 }}>
          No one-way fares found for this date.
        </div>
      ) : (
        <ul className="list-plain" style={{ marginTop: 6 }}>
          {own && (
            <li>
              <div className="between">
                <span>{sameAsOwn ? `Cheapest, on ${airlineName}` : `On ${airlineName}`}</span>
                <strong className="mono">{money(own.price, q.currency)}</strong>
              </div>
              <div className="tiny">{itinerary(own)}</div>
            </li>
          )}
          {any && !sameAsOwn && (
            <li>
              <div className="between">
                <span>Cheapest, any airline{any.airlineNames.length ? ` (${any.airlineNames.join(" + ")})` : ""}</span>
                <strong className="mono">{money(any.price, q.currency)}</strong>
              </div>
              <div className="tiny">{itinerary(any)}</div>
            </li>
          )}
          {!own && (
            <li className="tiny">No {airlineName} fare found for this date.</li>
          )}
        </ul>
      )}
      {q.typicalRange && (
        <div className="tiny" style={{ marginTop: 6 }}>
          Usually {money(q.typicalRange[0], q.currency)}–{money(q.typicalRange[1], q.currency)} for this trip{q.priceLevel ? `; prices are ${q.priceLevel} right now` : ""}.
        </div>
      )}
      <div className="tiny" style={{ marginTop: 6 }}>
        One adult, one-way. Public fares from Google Flights (via SerpApi){checked ? `, checked ${checked}` : ""}. Prices change constantly, and seats for sale don’t tell you anything about standby.
        {q.searchUrl && (
          <>
            {" "}
            <a href={q.searchUrl} target="_blank" rel="noopener noreferrer">
              Check on Google Flights
            </a>
          </>
        )}
      </div>
    </div>
  );
}
