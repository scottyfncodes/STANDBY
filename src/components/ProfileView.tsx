"use client";

import { useState } from "react";
import { AIRLINES } from "@/lib/airlines/registry";
import type { Relationship } from "@/lib/airlines/types";
import { getAirport, ORIGIN_CHOICES } from "@/lib/data/airports";
import type { Budget, RiskTolerance } from "@/lib/domain/types";
import { assessParty, RELATIONSHIP_LABELS, type Traveler } from "@/lib/eligibility/party";
import { Icon } from "./icons";
import { useStore, type Profile } from "./store";
import { TopBar } from "./TopBar";
import { AirportPicker, Segmented, Stepper, Switch } from "./ui";

export function ProfileView() {
  const { ready, profile, setProfile } = useStore();
  const [picker, setPicker] = useState(false);
  if (!ready)
    return (
      <>
        <TopBar />
        <main className="page narrow">
          <div className="skeleton" style={{ height: 400, marginTop: 20 }} />
        </main>
      </>
    );

  const set = (p: Partial<Profile>) => setProfile({ ...profile, ...p });
  const party = profile.party;
  const setTraveler = (id: string, t: Partial<Traveler>) => set({ party: { ...party, travelers: party.travelers.map((x) => (x.id === id ? { ...x, ...t } : x)) } });
  const airline = AIRLINES[party.airline];
  const pa = assessParty(party);

  return (
    <>
      <TopBar />
      <main className="page narrow">
        <section className="hero">
          <h1 className="display sm">
            Travelers
          </h1>
          <p className="lede">Who’s flying, from where, and how you like to travel. Saved only on this device.</p>
        </section>

        <div className="stack-lg">
          <section className="card pad">
            <h2 className="h3">Airline privileges</h2>
            <label style={{ display: "block", marginTop: 10 }}>
              <span className="field-label">Airline</span>
              <select className="select" value={party.airline} onChange={(e) => set({ party: { ...party, airline: e.target.value } })}>
                {Object.values(AIRLINES).map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="tiny" style={{ margin: "8px 0 0" }}>
              More airlines can be added through STANDBY’s airline adapters. {airline?.name} employee systems are not connected.
            </p>
          </section>

          <section className="card pad">
            <div className="between">
              <h2 className="h3">Who’s traveling</h2>
              <button
                type="button"
                className="chip"
                onClick={() => set({ party: { ...party, travelers: [...party.travelers, { id: `t${Date.now()}`, name: `Traveler ${party.travelers.length + 1}`, relationship: "other", priority: { status: "unknown" } }] } })}
                disabled={party.travelers.length >= 6}
              >
                <Icon name="plus" size={16} /> Add
              </button>
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              {party.travelers.map((t) => (
                <div key={t.id} className="panel" style={{ background: "var(--paper)" }}>
                  <div className="grid-2">
                    <label>
                      <span className="field-label">Name</span>
                      <input className="input" value={t.name} maxLength={30} onChange={(e) => setTraveler(t.id, { name: e.target.value })} autoComplete="off" />
                    </label>
                    <label>
                      <span className="field-label">Relationship to employee</span>
                      <select className="select" value={t.relationship} onChange={(e) => setTraveler(t.id, { relationship: e.target.value as Relationship })}>
                        {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label style={{ display: "block", marginTop: 10 }}>
                    <span className="field-label">Boarding priority, if you know it</span>
                    <input
                      className="input"
                      placeholder="Unknown"
                      value={t.priority.status === "unknown" ? "" : t.priority.value}
                      maxLength={20}
                      onChange={(e) => setTraveler(t.id, { priority: e.target.value.trim() ? { status: "user", value: e.target.value } : { status: "unknown" } })}
                      autoComplete="off"
                    />
                  </label>
                  {party.travelers.length > 1 && (
                    <button type="button" className="link-btn" style={{ color: "var(--bad)", fontSize: 13, minHeight: 36, marginTop: 4 }} onClick={() => set({ party: { ...party, travelers: party.travelers.filter((x) => x.id !== t.id) } })}>
                      Remove {t.name || "traveler"}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Switch label="We must travel together" hint="Only take a flight if everyone clears" checked={party.mustTravelTogether} onChange={(v) => set({ party: { ...party, mustTravelTogether: v } })} />
            {pa.notes.length > 0 && (
              <div className="notice" style={{ marginTop: 6 }}>
                <Icon name="info" size={18} />
                <div>
                  {pa.notes.map((n) => (
                    <div key={n}>{n}</div>
                  ))}
                </div>
              </div>
            )}
            <div className="notice" style={{ marginTop: 10 }}>
              <Icon name="shield" size={18} />
              <span>Never enter employee numbers, passwords or login details here. STANDBY doesn’t need them and doesn’t connect to employee systems.</span>
            </div>
          </section>

          <section className="card pad">
            <h2 className="h3">Home airports</h2>
            <div className="chips" style={{ marginTop: 10 }}>
              {profile.homeAirports.map((c) => (
                <button key={c} type="button" className="chip" aria-label={`Remove ${c}`} onClick={() => set({ homeAirports: profile.homeAirports.filter((x) => x !== c) })}>
                  <span className="chip-code">{c}</span>
                  <span className="tiny">{getAirport(c)?.city}</span>
                  <Icon name="close" size={14} />
                </button>
              ))}
              {profile.homeAirports.length < 4 && (
                <button type="button" className="chip" onClick={() => setPicker(true)}>
                  <Icon name="plus" size={16} /> Add
                </button>
              )}
            </div>
            <Switch label="Consider nearby airports" hint="e.g. Austin for DFW, Fort Lauderdale for Miami" checked={profile.useNearbyAirports} onChange={(v) => set({ useNearbyAirports: v })} />
          </section>

          <section className="card pad">
            <h2 className="h3">Defaults for new searches</h2>
            <div className="grid-2" style={{ marginTop: 12 }}>
              <div>
                <span className="field-label">Trip length</span>
                <Stepper label="nights" value={profile.defaultNights} min={1} max={21} onChange={(v) => set({ defaultNights: v })} format={(v) => `${v} night${v === 1 ? "" : "s"}`} />
              </div>
              <div>
                <span className="field-label">Budget</span>
                <Segmented<"0" | "1" | "2" | "3">
                  label="Budget"
                  value={String(profile.budget ?? 0) as "0" | "1" | "2" | "3"}
                  onChange={(v) => set({ budget: v === "0" ? undefined : (Number(v) as Budget) })}
                  options={[
                    { value: "0", label: "Any" },
                    { value: "1", label: "$" },
                    { value: "2", label: "$$" },
                    { value: "3", label: "$$$" },
                  ]}
                />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <span className="field-label">Uncertainty tolerance</span>
              <Segmented<RiskTolerance>
                label="Uncertainty tolerance"
                value={profile.risk}
                onChange={(v) => set({ risk: v })}
                options={[
                  { value: "cautious", label: "Cautious" },
                  { value: "balanced", label: "Balanced" },
                  { value: "adventurous", label: "Adventurous" },
                ]}
              />
            </div>
          </section>
        </div>

        <AirportPicker
          open={picker}
          onClose={() => setPicker(false)}
          title="Home airport"
          choices={ORIGIN_CHOICES}
          selected={profile.homeAirports}
          onPick={(c) => {
            if (!profile.homeAirports.includes(c)) set({ homeAirports: [...profile.homeAirports, c] });
            setPicker(false);
          }}
        />
      </main>
    </>
  );
}
