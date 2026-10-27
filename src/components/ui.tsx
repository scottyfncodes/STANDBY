"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAirport } from "@/lib/data/airports";
import type { Destination } from "@/lib/data/destinations";
import type { AirportCode, ProvenanceKind } from "@/lib/domain/types";
import { TIER_COPY, type Tier } from "@/lib/engine/assess";
import { Icon } from "./icons";

export function TierBadge({ tier, short = false }: { tier: Tier; short?: boolean }) {
  return <span className={`badge t-${tier}`}>{short ? TIER_COPY[tier].short : TIER_COPY[tier].label}</span>;
}

const PROV_LABEL: Record<ProvenanceKind, string> = {
  live: "Live",
  reference: "Reference data",
  estimate: "Estimate",
  user: "Your input",
  unavailable: "Not connected",
};

export function Prov({ kind, label }: { kind: ProvenanceKind; label?: string }) {
  return <span className={`prov ${kind === "live" ? "live" : ""}`}>{label ?? PROV_LABEL[kind]}</span>;
}

/** Deterministic pseudo-random from a string, for stable artwork. */
function seeded(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Typographic postcard art: palette wash, sun, horizon and a flight arc. */
export function PostcardArt({ destination }: { destination: Destination }) {
  const [deep, light] = destination.palette;
  const r = seeded(destination.id);
  const sunX = 190 + r() * 110;
  const sunY = 62 + r() * 26;
  const arcY = 30 + r() * 40;
  const gid = `g-${destination.id}`;
  const beach = destination.interests.includes("beach");
  const peaks = destination.interests.includes("outdoors") && !beach;
  return (
    <svg className="postcard-art" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={deep} />
          <stop offset="1" stopColor={mix(deep, light, 0.45)} />
        </linearGradient>
        <linearGradient id={`${gid}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
      </defs>
      <rect width="400" height="200" fill={`url(#${gid})`} />
      <circle cx={sunX} cy={sunY} r="34" fill={light} opacity="0.9" />
      <circle cx={sunX} cy={sunY} r="58" fill={light} opacity="0.12" />
      {peaks ? (
        <path d={`M0 200 L0 150 L${60 + r() * 30} 95 L140 140 L${200 + r() * 30} 80 L290 145 L${340 + r() * 20} 110 L400 140 L400 200 Z`} fill={deep} opacity="0.55" />
      ) : (
        <path d={`M0 160 C 80 ${145 + r() * 10}, 160 ${170 + r() * 8}, 240 155 S 360 ${150 + r() * 10}, 400 158 L400 200 L0 200 Z`} fill={deep} opacity="0.5" />
      )}
      {beach && <path d="M0 178 C 120 168, 260 186, 400 174 L400 200 L0 200 Z" fill={light} opacity="0.35" />}
      <path d={`M-10 ${arcY + 90} Q 200 ${arcY - 30} 410 ${arcY + 50}`} stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="3 6" fill="none" />
      <rect width="400" height="200" fill={`url(#${gid}-s)`} />
    </svg>
  );
}

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((x, i) => Math.round(x + (pb[i]! - x) * t).toString(16).padStart(2, "0")).join("")}`;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ value, min, max, onChange, label, format }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string; format?: (v: number) => string }) {
  return (
    <div className="stepper">
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <output aria-live="polite" aria-label={label}>
        {format ? format(value) : value}
      </output>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="toggle">
      <div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{label}</div>
        {hint && <div className="tiny">{hint}</div>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />
    </div>
  );
}

export function ChipToggle<T extends string>({ values, options, onChange, label }: { values: T[]; options: { value: T; label: string }[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button key={o.value} type="button" className="chip" aria-pressed={on} onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="between">
          <h2 className="h2" style={{ fontSize: 20 }}>
            {title}
          </h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AirportPicker({ open, onClose, choices, selected, onPick, title }: { open: boolean; onClose: () => void; choices: AirportCode[]; selected: AirportCode[]; onPick: (c: AirportCode) => void; title: string }) {
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return choices
      .map((c) => getAirport(c)!)
      .filter(Boolean)
      .filter((a) => !s || a.code.toLowerCase().includes(s) || a.city.toLowerCase().includes(s) || a.name.toLowerCase().includes(s));
  }, [q, choices]);
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <input ref={inputRef} className="input" style={{ marginTop: 12 }} placeholder="City or airport code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search airports" autoComplete="off" />
      <div className="sheet-list">
        {filtered.map((a) => {
          const on = selected.includes(a.code);
          return (
            <button key={a.code} type="button" className="sheet-item" onClick={() => onPick(a.code)} aria-pressed={on}>
              <span className="chip-code" style={{ fontSize: 16 }}>
                {a.code}
              </span>
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>{a.city}</span>
                <span className="tiny">{a.name}</span>
              </span>
              {on ? <Icon name="check" style={{ color: "var(--good)" }} /> : <span />}
            </button>
          );
        })}
        {!filtered.length && <p className="small" style={{ padding: "16px var(--gutter)" }}>No airports match “{q}”. STANDBY currently covers airports in its American Airlines reference network.</p>}
      </div>
    </Sheet>
  );
}

export function RouteDiagram({ origin, via, destination, legDaily }: { origin: AirportCode; via?: AirportCode; destination: AirportCode; legDaily: number[] }) {
  const f = (n?: number) => (n ? `~${n}/day` : "");
  if (!via)
    return (
      <div className="route nonstop">
        <span className="route-code">{origin}</span>
        <span className="route-line">
          <span>{f(legDaily[0])}</span>
        </span>
        <span className="route-code">{destination}</span>
      </div>
    );
  return (
    <div className="route">
      <span className="route-code">{origin}</span>
      <span className="route-line">
        <span>{f(legDaily[0])}</span>
      </span>
      <span className="route-hub">{via}</span>
      <span className="route-line">
        <span>{f(legDaily[1])}</span>
      </span>
      <span className="route-code">{destination}</span>
    </div>
  );
}

export function costLabel(cost: number) {
  return "$".repeat(cost);
}
