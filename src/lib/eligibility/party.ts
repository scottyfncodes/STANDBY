import type { Relationship, RuleValue } from "@/lib/airlines/types";

export interface Traveler {
  id: string;
  /** First name or nickname only — never store employee IDs or credentials. */
  name: string;
  relationship: Relationship;
  /** Priority as the traveler knows it (e.g. "D2"), or unknown. */
  priority: RuleValue;
}

export interface Party {
  airline: string;
  travelers: Traveler[];
  /** The party will only fly if everyone clears the same flight. */
  mustTravelTogether: boolean;
}

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  employee: "Employee",
  spouse: "Spouse",
  "domestic-partner": "Domestic partner",
  "dependent-child": "Dependent child",
  parent: "Parent of employee",
  "registered-companion": "Registered companion",
  "buddy-pass": "Buddy pass",
  other: "Other",
};

export interface PartyAssessment {
  seatsNeeded: number;
  /** All travelers' priorities are known and identical. */
  prioritiesKnown: boolean;
  mixedPriority: boolean | "unknown";
  notes: string[];
  /** 0 (no strain) … 1 (heavy strain) — how much party composition stretches the plan. */
  strain: number;
}

export function assessParty(party: Party, travelersOverride?: number): PartyAssessment {
  const seatsNeeded = Math.max(1, travelersOverride ?? party.travelers.length);
  const notes: string[] = [];
  const known = party.travelers.filter((t) => t.priority.status !== "unknown");
  const prioritiesKnown = party.travelers.length > 0 && known.length === party.travelers.length;
  const values = new Set(known.map((t) => (t.priority.status === "unknown" ? "" : t.priority.value.trim().toUpperCase())));
  const mixedPriority: PartyAssessment["mixedPriority"] = prioritiesKnown ? values.size > 1 : known.length > 1 && values.size > 1 ? true : "unknown";

  if (!prioritiesKnown) {
    notes.push("Boarding priority is unknown for at least one traveler. Priority can differ by relationship to the employee, so STANDBY doesn't assume you clear together.");
  } else if (mixedPriority === true) {
    notes.push("Your party has different priorities. The higher-priority traveler may clear while the other does not — decide in advance whether you'd split up.");
  }
  if (!party.travelers.some((t) => t.relationship === "employee")) {
    notes.push("The employee isn't part of this party. Whether companions may fly without the employee is an airline rule STANDBY hasn't verified.");
  }
  if (seatsNeeded >= 3) notes.push(`You need ${seatsNeeded} open seats on the same flight, which is noticeably harder than one or two.`);
  else if (seatsNeeded === 2 && party.mustTravelTogether) notes.push("Two seats on the same flight are needed since you're traveling together.");

  const strain = Math.min(1, (seatsNeeded - 1) * 0.22 + (party.mustTravelTogether && seatsNeeded > 1 ? 0.12 : 0) + (mixedPriority === true ? 0.1 : 0));
  return { seatsNeeded, prioritiesKnown, mixedPriority, notes, strain };
}
