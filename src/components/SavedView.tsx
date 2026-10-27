"use client";

import Link from "next/link";
import { getDestination } from "@/lib/data/destinations";
import { formatDate } from "@/lib/engine/time";
import { useToday } from "./hooks";
import { Icon } from "./icons";
import { useStore } from "./store";
import { TopBar } from "./TopBar";
import { EmptyState, PostcardArt } from "./ui";

export function SavedView() {
  const { ready, saved, toggleSaved } = useStore();
  const today = useToday();
  return (
    <>
      <TopBar />
      <main className="page narrow">
        <section className="hero">
          <h1 className="display sm">
            Saved trips
          </h1>
          <p className="lede">Plans you’re considering. Re-open one to recompute it — nothing is stored on a server.</p>
        </section>
        {!ready ? (
          <div className="skeleton" style={{ height: 96 }} />
        ) : saved.length === 0 ? (
          <EmptyState
            icon="bookmark"
            title="No saved trips yet"
            action={
              <Link href="/" className="btn">
                Find a trip
              </Link>
            }
          >
            Tap the bookmark on any trip plan to keep it here.
          </EmptyState>
        ) : (
          <div className="stack">
            {saved.map((s) => {
              const d = getDestination(s.destinationId);
              if (!d) return null;
              const past = today ? s.date < today : false;
              return (
                <div key={s.id} className="card" style={{ display: "grid", gridTemplateColumns: "96px 1fr auto", overflow: "hidden", alignItems: "stretch" }}>
                  <div className="postcard" style={{ minHeight: 96, borderRadius: 0, padding: 0 }}>
                    <PostcardArt destination={d} />
                  </div>
                  <Link href={`/trip/${d.id}?${s.query}`} style={{ padding: "12px 14px", textDecoration: "none", minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 600, lineHeight: 1.15 }}>{d.name}</div>
                    <div className="small num" style={{ marginTop: 2 }}>Leaving {formatDate(s.date)}</div>
                    {past && <div className="tiny" style={{ color: "var(--warn)" }}>This date has passed</div>}
                  </Link>
                  <button type="button" className="icon-btn" style={{ alignSelf: "center", marginRight: 12 }} aria-label={`Remove ${d.name}`} onClick={() => toggleSaved(s)}>
                    <Icon name="close" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
