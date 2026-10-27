import { AA_NETWORK_PROVENANCE, AA_ROUTES } from "@/lib/data/aa-network";
import { createStaticNetwork } from "@/lib/providers/network";
import type { AirlineAdapter } from "./types";

const unknown = { status: "unknown" } as const;

export const americanAirlines: AirlineAdapter = {
  code: "AA",
  name: "American Airlines",
  alliance: "oneworld",
  website: "https://www.aa.com",
  hubs: ["DFW", "CLT", "ORD", "PHL", "MIA", "PHX", "DCA", "LAX", "JFK", "LGA"],
  network: createStaticNetwork("aa-reference", AA_ROUTES, AA_NETWORK_PROVENANCE),
  connectionBufferMin: { domestic: 60, international: 90, usEntry: 120 },
  employeeRules: [
    { key: "priority-order", label: "Boarding priority by relationship", value: unknown, matters: "Decides whether a spouse, parent or companion clears ahead of or behind other non-rev travelers. STANDBY does not assume travelers share the employee's priority." },
    { key: "travel-without-employee", label: "Companions traveling without the employee", value: unknown, matters: "Determines whether your party can fly when the employee is not on board." },
    { key: "listing-window", label: "Listing window and cutoffs", value: unknown, matters: "Affects how late you can switch to a backup flight." },
    { key: "international-fees", label: "Taxes and fees on international non-rev travel", value: unknown, matters: "Can change the true cost of an international attempt." },
    { key: "cabin-eligibility", label: "Premium cabin eligibility", value: unknown, matters: "Opens extra seats on some flights if eligible." },
    { key: "dress-code", label: "Dress code", value: unknown, matters: "A mismatch can cost you a seat at the gate." },
    { key: "partner-carriers", label: "Interline / partner standby (ZED/MIBA)", value: unknown, matters: "Partner flights could add fallback options on thin routes." },
  ],
  standbyLoads: {
    status: {
      id: "aa-standby-loads",
      label: "AA standby loads & priority lists",
      provides: "Open seats, listed non-rev passengers and priority order per flight",
      state: "not_available",
      detail: "Not connected. These live only in American's authorized employee travel systems. STANDBY does not collect credentials or automate private websites, so every feasibility view here is built without loads.",
      requires: "An authorized, airline-sanctioned integration (future phase).",
    },
  },
  publicFacts: [
    { label: "Alliance", value: "oneworld" },
    { label: "Hubs", value: "DFW · CLT · ORD · PHL · MIA · PHX · DCA · LAX · JFK · LGA" },
  ],
};
