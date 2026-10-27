import type { AirportCode, DataProvenance } from "@/lib/domain/types";
import type { RouteRecord } from "@/lib/data/aa-network";
import type { NetworkProvider } from "./types";

/** Builds a NetworkProvider from undirected route records (service assumed in both directions). */
export function createStaticNetwork(id: string, routes: RouteRecord[], provenance: DataProvenance): NetworkProvider {
  const byPair = new Map<string, RouteRecord>();
  const adjacency = new Map<AirportCode, Set<AirportCode>>();
  for (const r of routes) {
    byPair.set(`${r.a}-${r.b}`, r);
    byPair.set(`${r.b}-${r.a}`, r);
    for (const [x, y] of [[r.a, r.b], [r.b, r.a]] as const) {
      if (!adjacency.has(x)) adjacency.set(x, new Set());
      adjacency.get(x)!.add(y);
    }
  }
  const operates = (r: RouteRecord, month: number) => !r.months || r.months.includes(month);

  return {
    id,
    provenance,
    route(from, to, month) {
      const r = byPair.get(`${from}-${to}`);
      return r && operates(r, month) ? r : undefined;
    },
    routeAnyMonth(from, to) {
      return byPair.get(`${from}-${to}`);
    },
    destinationsFrom(from, month) {
      return [...(adjacency.get(from) ?? [])].filter((to) => operates(byPair.get(`${from}-${to}`)!, month));
    },
    serves(code) {
      return adjacency.has(code);
    },
  };
}
