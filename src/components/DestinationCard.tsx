import Link from "next/link";
import { summarizePaths } from "@/lib/engine/itinerary";
import type { DiscoveryResult } from "@/lib/engine/discover";
import { formatDate, monthOf } from "@/lib/engine/time";
import { Icon } from "./icons";
import { costLabel, PostcardArt, TierBadge } from "./ui";

export function DestinationCard({ result, rank, href }: { result: DiscoveryResult; rank: number; href: string }) {
  const { destination: d, best, fit } = result;
  const a = best.assessment;
  const path = summarizePaths(a.outbound).find((p) => p.options.some((o) => !o.overnightConnection));
  const route = path ? (path.via ? `via ${path.via}` : "Nonstop") : "—";
  const risk = a.risks[0] ?? fit.concerns[0];
  const high = d.highF[monthOf(best.date) - 1];
  return (
    <Link href={href} className="card dest-card">
      <div className="postcard">
        <PostcardArt destination={d} />
        <span className="postcard-rank">No. {String(rank).padStart(2, "0")}</span>
        <span className="postcard-codes">{a.destAirports.join(" · ")}</span>
        <h3 className="postcard-name">{d.name}</h3>
        <div className="postcard-region">{d.region}</div>
      </div>
      <div className="dest-body">
        <div className="between" style={{ flexWrap: "wrap", rowGap: 6 }}>
          <TierBadge tier={a.tier} />
          <span className="small num strong">
            {formatDate(best.date)} → {formatDate(best.returnDate)}
          </span>
        </div>
        <ul className="why">
          {result.why.slice(0, 3).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="facts">
          <div className="fact">
            <div className="fact-k">Flights in</div>
            <div className="fact-v">~{a.outbound.depth}</div>
          </div>
          <div className="fact">
            <div className="fact-k">Flights home</div>
            <div className="fact-v">~{a.inbound.depth}</div>
          </div>
          <div className="fact">
            <div className="fact-k">Best route</div>
            <div className="fact-v">{route}</div>
          </div>
        </div>
        {risk && (
          <div className="risk-line">
            <Icon name="alert" size={16} style={{ flex: "none", marginTop: 1 }} />
            <span>{risk}</span>
          </div>
        )}
        <div className="between dest-foot">
          <span className="tiny">
            {costLabel(d.cost)} on the ground (est.) · ~{high}°F highs
          </span>
          <span className="row small" style={{ color: "var(--ink)", fontWeight: 650, gap: 4 }}>
            Plan <Icon name="chevronRight" size={16} />
          </span>
        </div>
      </div>
    </Link>
  );
}
