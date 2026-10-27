import type { AirportCode } from "@/lib/domain/types";
import type { NetworkProvider, StandbyLoadProvider } from "@/lib/providers/types";

/**
 * A rule's value is never assumed. It is either unknown, supplied by the traveler,
 * or published by the airline with a citation.
 */
export type RuleValue =
  | { status: "unknown" }
  | { status: "user"; value: string }
  | { status: "published"; value: string; source: string; url?: string };

export interface AirlineRule {
  key: string;
  label: string;
  value: RuleValue;
  /** Why this rule matters to trip planning. */
  matters: string;
}

/** Relationship of a traveler to the employee whose privileges they use. */
export type Relationship =
  | "employee"
  | "spouse"
  | "domestic-partner"
  | "dependent-child"
  | "parent"
  | "registered-companion"
  | "buddy-pass"
  | "other";

/**
 * Airline adapter. Adding another airline means implementing this interface —
 * the planner and scoring engine never reference a specific carrier.
 */
export interface AirlineAdapter {
  code: string;
  name: string;
  alliance?: string;
  website: string;
  hubs: AirportCode[];
  network: NetworkProvider;
  /** Planning buffers for connections, in minutes (STANDBY planning assumptions, not airline MCTs). */
  connectionBufferMin: { domestic: number; international: number; usEntry: number };
  /** Relationships the airline is known to support. `undefined` = unknown; all are offered. */
  relationships?: Relationship[];
  /** Employee travel rules. Unverified rules are represented as unknown. */
  employeeRules: AirlineRule[];
  standbyLoads: StandbyLoadProvider;
  /** Published, verifiable public information worth surfacing. */
  publicFacts: { label: string; value: string }[];
}
