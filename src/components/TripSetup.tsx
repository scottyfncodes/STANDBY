"use client";

import { useState } from "react";
import { getAirport, NEARBY_AIRPORTS, ORIGIN_CHOICES } from "@/lib/data/airports";
import type { Budget, Climate, Complexity, Interest, RiskTolerance, Scope, TripRequest } from "@/lib/domain/types";
import { addDays, diffDays } from "@/lib/engine/time";
import { Icon } from "./icons";
import { AirportPicker, ChipToggle, Segmented, Stepper, Switch } from "./ui";

const CLIMATES: { value: Climate; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "mild", label: "Mild" },
  { value: "cool", label: "Cool" },
  { value: "snow", label: "Snow" },
];
const INTERESTS: { value: Interest; label: string }[] = [
  { value: "beach", label: "Beach" },
  { value: "city", label: "City" },
  { value: "outdoors", label: "Outdoors" },
  { value: "culture", label: "Culture" },
  { value: "food", label: "Food" },
  { value: "events", label: "Events" },
  { value: "relaxation", label: "Relaxation" },
];

export function validate(r: TripRequest): string[] {
  const errs: string[] = [];
  if (!r.origins.length) errs.push("Add at least one departure airport.");
  if (r.windowEnd < r.windowStart) errs.push("The last departure date is before the first.");
  if (r.homeBy && addDays(r.windowStart, r.nights) > r.homeBy) errs.push(`A ${r.nights}-night trip leaving ${r.windowStart} can't be home by ${r.homeBy}. Move the deadline or shorten the trip.`);
  if (diffDays(r.windowStart, r.windowEnd) > 120) errs.push("Keep the departure window under four months for useful comparisons.");
  return errs;
}

export function TripSetup({ request, onChange, today }: { request: TripRequest; onChange: (r: TripRequest) => void; today: string }) {
  const [picker, setPicker] = useState(false);
  const set = <K extends keyof TripRequest>(k: K, v: TripRequest[K]) => onChange({ ...request, [k]: v });
  const refinements =
    request.climates.length + request.interests.length + (request.budget ? 1 : 0) + (request.complexity === "nonstop" ? 1 : 0) + (request.risk !== "balanced" ? 1 : 0) + (request.useAlternateOrigins ? 1 : 0);
  const nearby = [...new Set(request.origins.flatMap((o) => NEARBY_AIRPORTS[o] ?? []))].filter((x) => !request.origins.includes(x));

  return (
    <div className="card pad">
      <span className="field-label">Leaving from</span>
      <div className="chips">
        {request.origins.map((o) => (
          <button key={o} type="button" className="chip" aria-label={`Remove ${o}`} onClick={() => set("origins", request.origins.filter((x) => x !== o))}>
            <span className="chip-code">{o}</span>
            <span className="tiny">{getAirport(o)?.city}</span>
            <Icon name="close" size={14} />
          </button>
        ))}
        {request.origins.length < 4 && (
          <button type="button" className="chip" onClick={() => setPicker(true)}>
            <Icon name="plus" size={16} /> {request.origins.length ? "Add" : "Choose airport"}
          </button>
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <label>
          <span className="field-label">Earliest departure</span>
          <input className="input" type="date" min={today} value={request.windowStart} onChange={(e) => e.target.value && onChange({ ...request, windowStart: e.target.value, windowEnd: request.windowEnd < e.target.value ? e.target.value : request.windowEnd })} />
        </label>
        <label>
          <span className="field-label">Latest departure</span>
          <input className="input" type="date" min={request.windowStart} value={request.windowEnd} onChange={(e) => e.target.value && set("windowEnd", e.target.value)} />
        </label>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <span className="field-label">Trip length</span>
          <Stepper label="nights" value={request.nights} min={1} max={21} onChange={(v) => set("nights", v)} format={(v) => `${v} night${v === 1 ? "" : "s"}`} />
        </div>
        <label>
          <span className="field-label">Must be home by {request.homeBy ? "" : "(optional)"}</span>
          <div style={{ position: "relative" }}>
            <input className="input" type="date" min={addDays(request.windowStart, request.nights)} value={request.homeBy ?? ""} onChange={(e) => set("homeBy", e.target.value || undefined)} />
          </div>
        </label>
      </div>

      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <span className="field-label">Travelers</span>
          <Stepper label="travelers" value={request.travelers} min={1} max={6} onChange={(v) => set("travelers", v)} />
        </div>
        <div>
          <span className="field-label">Where</span>
          <Segmented<Scope>
            label="Destination scope"
            value={request.scope}
            onChange={(v) => set("scope", v)}
            options={[
              { value: "any", label: "Any" },
              { value: "domestic", label: "US" },
              { value: "international", label: "Abroad" },
            ]}
          />
        </div>
      </div>

      <details className="disclosure" style={{ marginTop: 14 }}>
        <summary className="between" style={{ padding: "8px 0" }}>
          <span className="row" style={{ fontWeight: 650 }}>
            <Icon name="sliders" size={18} /> Refine
            {refinements > 0 && <span className="badge plain tone-ok">{refinements}</span>}
          </span>
          <span className="tiny">Weather, vibe, budget, risk</span>
        </summary>
        <div className="stack-lg" style={{ paddingTop: 10 }}>
          <div>
            <span className="field-label">Weather</span>
            <ChipToggle label="Weather" values={request.climates} options={CLIMATES} onChange={(v) => set("climates", v)} />
          </div>
          <div>
            <span className="field-label">The trip is about</span>
            <ChipToggle label="Interests" values={request.interests} options={INTERESTS} onChange={(v) => set("interests", v)} />
          </div>
          <div>
            <span className="field-label">On-the-ground budget</span>
            <Segmented<"0" | "1" | "2" | "3">
              label="Budget"
              value={String(request.budget ?? 0) as "0" | "1" | "2" | "3"}
              onChange={(v) => set("budget", v === "0" ? undefined : (Number(v) as Budget))}
              options={[
                { value: "0", label: "Any" },
                { value: "1", label: "$" },
                { value: "2", label: "$$" },
                { value: "3", label: "$$$" },
              ]}
            />
          </div>
          <div>
            <span className="field-label">Connections</span>
            <Segmented<Complexity>
              label="Connections"
              value={request.complexity}
              onChange={(v) => set("complexity", v)}
              options={[
                { value: "one-stop", label: "One stop is fine" },
                { value: "nonstop", label: "Nonstop only" },
              ]}
            />
          </div>
          <div>
            <span className="field-label">How much uncertainty is OK?</span>
            <Segmented<RiskTolerance>
              label="Uncertainty tolerance"
              value={request.risk}
              onChange={(v) => set("risk", v)}
              options={[
                { value: "cautious", label: "Cautious" },
                { value: "balanced", label: "Balanced" },
                { value: "adventurous", label: "Adventurous" },
              ]}
            />
            <p className="tiny" style={{ margin: "6px 0 0" }}>
              Cautious favors deep schedules and keeps more backup flights in reserve before your deadline.
            </p>
          </div>
          <div>
            <Switch
              label="Nearby departure airports"
              hint={nearby.length ? `Also consider ${nearby.join(", ")}` : "No nearby alternates known for your airports"}
              checked={request.useAlternateOrigins}
              onChange={(v) => set("useAlternateOrigins", v)}
            />
            <Switch label="Alternate arrival airports" hint="e.g. Liberia ↔ San José, Bozeman for Jackson" checked={request.allowAlternateDestinations} onChange={(v) => set("allowAlternateDestinations", v)} />
          </div>
        </div>
      </details>

      <AirportPicker
        open={picker}
        onClose={() => setPicker(false)}
        title="Departure airport"
        choices={ORIGIN_CHOICES}
        selected={request.origins}
        onPick={(c) => {
          if (!request.origins.includes(c)) set("origins", [...request.origins, c]);
          setPicker(false);
        }}
      />
    </div>
  );
}
