import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { TopBar } from "@/components/TopBar";
import { americanAirlines } from "@/lib/airlines/american";
import { providerStatuses } from "@/lib/providers/registry";
import type { ProviderStatus } from "@/lib/providers/types";

export const metadata: Metadata = { title: "How it works" };
export const dynamic = "force-dynamic";

const STATE: Record<ProviderStatus["state"], { label: string; cls: string }> = {
  connected: { label: "Connected", cls: "tone-good" },
  reference: { label: "Reference data", cls: "tone-ok" },
  not_configured: { label: "Not connected", cls: "tone-unknown" },
  not_available: { label: "Not available", cls: "t-high-risk" },
};

export default function HowItWorks() {
  const statuses = providerStatuses();
  return (
    <>
      <TopBar />
      <main className="page narrow">
        <section className="hero">
          <p className="eyebrow">How it works</p>
          <h1 className="display" style={{ fontSize: 40 }}>
            Honest about what we know.
          </h1>
          <p className="lede">
            STANDBY plans around flexibility: how many realistic attempts you’d have getting there and getting home, and what to do when a flight doesn’t clear. It never invents loads or a percent chance of making it.
          </p>
        </section>

        <div className="stack-lg">
          <section className="card" style={{ padding: 16 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>
              How trips are assessed
            </h2>
            <ul className="list-plain" style={{ marginTop: 8 }}>
              <li><strong>Ways in & ways home.</strong> Roughly how many flights into your destination — and back to your airports — you could try for that day, through nonstops and one-stop hub connections.</li>
              <li><strong>Thinnest link.</strong> A once-a-day leg means a missed flight usually costs a full day.</li>
              <li><strong>Room before your deadline.</strong> How many attempts home remain before you must be back, with a reserve that depends on your risk tolerance.</li>
              <li><strong>Seasonal demand.</strong> Holidays, school breaks, destination peaks and events. These are general patterns, not route-specific load data.</li>
              <li><strong>Your party.</strong> More seats on one flight is harder; priority may differ between travelers.</li>
              <li><strong>Connections.</strong> Every connection is another standby list and a place to get stuck overnight.</li>
            </ul>
            <p className="small" style={{ marginTop: 10 }}>
              These become one of five plain-language assessments: <em>More flexible options</em>, <em>Workable with backups</em>, <em>Limited alternatives</em>, <em>High schedule risk</em> or <em>Insufficient evidence</em>. A numeric probability would need validated historical standby outcomes, which STANDBY doesn’t have.
            </p>
          </section>

          <section>
            <h2 className="h2" style={{ fontSize: 20, marginBottom: 10 }}>
              Data sources
            </h2>
            <div className="stack">
              {statuses.map((s) => (
                <div key={s.id} className="panel">
                  <div className="between" style={{ alignItems: "flex-start" }}>
                    <h3 className="h3">{s.label}</h3>
                    <span className={`badge ${STATE[s.state].cls}`}>{STATE[s.state].label}</span>
                  </div>
                  <p className="small" style={{ margin: "6px 0 0", color: "var(--ink-2)" }}>
                    {s.provides}
                  </p>
                  <p className="small" style={{ margin: "6px 0 0" }}>
                    {s.detail}
                  </p>
                  {(s.requires || s.costNote) && (
                    <p className="tiny" style={{ margin: "6px 0 0" }}>
                      {[s.requires && `Needs: ${s.requires}`, s.costNote].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <h2 className="h2" style={{ fontSize: 20 }}>
              {americanAirlines.name} employee travel rules
            </h2>
            <p className="small" style={{ margin: "6px 0 10px" }}>
              STANDBY hasn’t verified these, so it treats them as unknown rather than guessing. You can note your own priority on the Travelers tab.
            </p>
            <ul className="list-plain">
              {americanAirlines.employeeRules.map((r) => (
                <li key={r.key}>
                  <div className="between">
                    <strong style={{ fontSize: 14.5, color: "var(--ink)" }}>{r.label}</strong>
                    <span className="badge tone-unknown">Unknown</span>
                  </div>
                  <div className="tiny" style={{ marginTop: 3 }}>
                    {r.matters}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="notice">
            <Icon name="shield" size={18} />
            <span>
              <strong>Privacy.</strong> Your travelers, airports and saved trips stay in this browser’s storage. STANDBY has no accounts, never asks for employee credentials, and doesn’t automate or scrape employee websites.
            </span>
          </section>

          <p className="tiny">
            Weather data by <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0). STANDBY is not affiliated with American Airlines.
          </p>
        </div>
      </main>
    </>
  );
}
