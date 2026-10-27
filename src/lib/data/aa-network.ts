import type { AirportCode, DataProvenance } from "@/lib/domain/types";

/**
 * American Airlines reference network.
 *
 * IMPORTANT: this is NOT a live schedule. Frequencies and block times are rounded,
 * approximate figures for typical service, compiled from publicly available route
 * information. They exist so STANDBY can reason about *relative* flexibility
 * (e.g. "about 9 flights a day" vs "one flight a day, seasonal"). Exact times,
 * days of operation and seasonal dates change constantly and must be confirmed
 * on aa.com or with a connected schedule provider.
 */
export const AA_NETWORK_PROVENANCE: DataProvenance = {
  kind: "reference",
  source: "STANDBY reference network — approximate typical American Airlines service",
  asOf: "2026-10",
  note: "Rounded daily frequencies and block times. Not a live schedule; confirm exact flights on aa.com.",
};

/** Months are 1–12. */
export interface RouteRecord {
  a: AirportCode;
  b: AirportCode;
  /** Approximate typical daily departures in each direction. */
  daily: number;
  /** Approximate block time in minutes. */
  blockMin: number;
  /** If set, the route only operates in these months. */
  months?: number[];
}

const WINTER = [12, 1, 2, 3];
const WINTER_SPRING = [12, 1, 2, 3, 4];
const PEAK_SUMMER = [6, 7, 8];
const SUMMER = [5, 6, 7, 8, 9];
const EURO_SEASON = [3, 4, 5, 6, 7, 8, 9, 10];
const SKI_AND_SUMMER = [12, 1, 2, 3, 6, 7, 8, 9];

type Tuple = [AirportCode, AirportCode, number, number, number[]?];

const T: Tuple[] = [
  // Hub ↔ hub
  ["DFW", "CLT", 10, 165], ["DFW", "ORD", 12, 150], ["DFW", "PHL", 7, 195], ["DFW", "MIA", 9, 170],
  ["DFW", "PHX", 10, 150], ["DFW", "DCA", 8, 180], ["DFW", "LAX", 12, 195], ["DFW", "JFK", 5, 210],
  ["DFW", "LGA", 10, 210], ["CLT", "ORD", 9, 125], ["CLT", "PHL", 10, 95], ["CLT", "MIA", 8, 125],
  ["CLT", "PHX", 5, 280], ["CLT", "DCA", 10, 80], ["CLT", "LAX", 4, 320], ["CLT", "LGA", 10, 120],
  ["CLT", "JFK", 3, 120], ["ORD", "PHL", 7, 120], ["ORD", "MIA", 6, 195], ["ORD", "PHX", 7, 240],
  ["ORD", "DCA", 8, 110], ["ORD", "LAX", 7, 270], ["ORD", "LGA", 10, 135], ["PHL", "MIA", 6, 170],
  ["PHL", "PHX", 4, 310], ["PHL", "LAX", 3, 345], ["MIA", "PHX", 2, 300], ["MIA", "DCA", 6, 160],
  ["MIA", "LAX", 5, 330], ["MIA", "JFK", 6, 190], ["MIA", "LGA", 8, 190], ["PHX", "LAX", 9, 85],
  ["PHX", "DCA", 2, 270], ["PHX", "JFK", 2, 290], ["LAX", "JFK", 10, 345], ["DCA", "LGA", 12, 75],

  // Spokes ↔ hubs (common departure airports)
  ["AUS", "DFW", 10, 60], ["AUS", "CLT", 5, 170], ["AUS", "ORD", 4, 170], ["AUS", "PHX", 3, 165],
  ["AUS", "MIA", 3, 165], ["AUS", "PHL", 2, 210], ["AUS", "LAX", 4, 210], ["AUS", "JFK", 3, 240],
  ["AUS", "DCA", 2, 200],
  ["SAT", "DFW", 9, 65], ["SAT", "CLT", 3, 170], ["SAT", "ORD", 3, 170], ["SAT", "PHX", 3, 140], ["SAT", "MIA", 1, 165],
  ["IAH", "DFW", 9, 70], ["IAH", "CLT", 4, 150], ["IAH", "MIA", 3, 150], ["IAH", "PHX", 3, 170], ["IAH", "ORD", 3, 160],
  ["OKC", "DFW", 8, 60], ["OKC", "CLT", 1, 170], ["OKC", "ORD", 2, 120], ["OKC", "PHX", 2, 140],
  ["TUL", "DFW", 7, 60], ["TUL", "CLT", 1, 150], ["TUL", "ORD", 2, 120], ["TUL", "PHX", 1, 150],
  ["BNA", "DFW", 7, 120], ["BNA", "CLT", 6, 80], ["BNA", "ORD", 5, 100], ["BNA", "MIA", 3, 120],
  ["BNA", "PHL", 3, 125], ["BNA", "PHX", 2, 240], ["BNA", "LAX", 2, 270], ["BNA", "DCA", 3, 105], ["BNA", "LGA", 4, 135],
  ["MSY", "DFW", 6, 100], ["MSY", "CLT", 5, 115], ["MSY", "ORD", 3, 150], ["MSY", "MIA", 3, 120],
  ["MSY", "PHX", 2, 210], ["MSY", "PHL", 2, 160],
  ["STL", "DFW", 5, 115], ["STL", "CLT", 4, 120], ["STL", "ORD", 4, 70], ["STL", "PHX", 2, 210], ["STL", "MIA", 1, 165],
  ["MCI", "DFW", 6, 100], ["MCI", "CLT", 3, 145], ["MCI", "ORD", 4, 90], ["MCI", "PHX", 2, 180],
  ["MSP", "DFW", 4, 150], ["MSP", "CLT", 3, 145], ["MSP", "ORD", 3, 95], ["MSP", "PHX", 2, 195],
  ["ATL", "DFW", 5, 135], ["ATL", "CLT", 6, 70], ["ATL", "MIA", 4, 115], ["ATL", "ORD", 3, 125],
  ["ATL", "PHX", 2, 265], ["ATL", "PHL", 2, 125],
  ["RDU", "DFW", 4, 180], ["RDU", "CLT", 9, 60], ["RDU", "ORD", 4, 130], ["RDU", "MIA", 3, 120],
  ["RDU", "PHL", 4, 85], ["RDU", "LGA", 4, 95], ["RDU", "DCA", 3, 70],
  ["BOS", "DFW", 5, 240], ["BOS", "CLT", 7, 135], ["BOS", "ORD", 6, 165], ["BOS", "PHL", 7, 90],
  ["BOS", "MIA", 6, 195], ["BOS", "PHX", 3, 320], ["BOS", "DCA", 6, 95], ["BOS", "LAX", 2, 370], ["BOS", "JFK", 3, 80],
  ["BWI", "DFW", 4, 200], ["BWI", "CLT", 5, 95], ["BWI", "ORD", 3, 125], ["BWI", "MIA", 3, 150], ["BWI", "PHX", 1, 300],
  ["IAD", "DFW", 4, 200], ["IAD", "CLT", 4, 95], ["IAD", "MIA", 3, 150],
  ["EWR", "DFW", 4, 220], ["EWR", "CLT", 6, 115], ["EWR", "MIA", 4, 180], ["EWR", "ORD", 3, 140], ["EWR", "PHX", 2, 320],
  ["PIT", "DFW", 3, 170], ["PIT", "CLT", 5, 95], ["PIT", "ORD", 3, 95], ["PIT", "PHL", 3, 75], ["PIT", "MIA", 1, 160],
  ["CMH", "DFW", 3, 160], ["CMH", "CLT", 4, 95], ["CMH", "ORD", 3, 85], ["CMH", "PHL", 2, 95],
  ["IND", "DFW", 3, 145], ["IND", "CLT", 3, 105], ["IND", "ORD", 4, 70],
  ["DTW", "DFW", 3, 170], ["DTW", "CLT", 4, 110], ["DTW", "ORD", 3, 85], ["DTW", "PHL", 3, 100],
  ["MCO", "DFW", 7, 165], ["MCO", "CLT", 8, 105], ["MCO", "ORD", 5, 165], ["MCO", "PHL", 5, 145],
  ["MCO", "MIA", 4, 70], ["MCO", "PHX", 3, 280], ["MCO", "DCA", 4, 130], ["MCO", "LGA", 4, 165],
  ["MCO", "JFK", 2, 165], ["MCO", "LAX", 2, 330],
  ["TPA", "DFW", 6, 155], ["TPA", "CLT", 7, 105], ["TPA", "ORD", 4, 165], ["TPA", "PHL", 5, 150],
  ["TPA", "MIA", 4, 70], ["TPA", "PHX", 2, 270], ["TPA", "DCA", 3, 130], ["TPA", "LGA", 3, 165],
  ["FLL", "DFW", 5, 175], ["FLL", "CLT", 7, 115], ["FLL", "ORD", 4, 190], ["FLL", "PHL", 5, 165],
  ["FLL", "DCA", 3, 145], ["FLL", "LGA", 3, 180], ["FLL", "PHX", 1, 295],
  ["RSW", "DFW", 4, 165], ["RSW", "CLT", 6, 110], ["RSW", "ORD", 4, 175], ["RSW", "PHL", 4, 160], ["RSW", "DCA", 2, 145],
  ["DEN", "DFW", 8, 130], ["DEN", "CLT", 4, 230], ["DEN", "ORD", 5, 155], ["DEN", "PHX", 5, 110],
  ["DEN", "MIA", 2, 260], ["DEN", "PHL", 3, 240], ["DEN", "LAX", 3, 155],
  ["SLC", "DFW", 4, 165], ["SLC", "CLT", 2, 265], ["SLC", "ORD", 3, 205], ["SLC", "PHX", 4, 105], ["SLC", "LAX", 2, 115],
  ["ABQ", "DFW", 5, 110], ["ABQ", "PHX", 4, 75], ["ABQ", "ORD", 2, 180], ["ABQ", "CLT", 1, 230],
  ["LAS", "DFW", 7, 175], ["LAS", "CLT", 4, 290], ["LAS", "ORD", 6, 240], ["LAS", "PHX", 7, 70],
  ["LAS", "PHL", 3, 320], ["LAS", "MIA", 2, 300], ["LAS", "LAX", 5, 70], ["LAS", "JFK", 2, 320],
  ["SAN", "DFW", 6, 185], ["SAN", "CLT", 3, 300], ["SAN", "ORD", 4, 250], ["SAN", "PHX", 6, 70],
  ["SAN", "PHL", 2, 330], ["SAN", "MIA", 1, 320], ["SAN", "JFK", 2, 335],
  ["SNA", "DFW", 5, 190], ["SNA", "PHX", 5, 75], ["SNA", "CLT", 2, 300], ["SNA", "ORD", 2, 250],
  ["BUR", "DFW", 3, 185], ["BUR", "PHX", 4, 75],
  ["SFO", "DFW", 6, 215], ["SFO", "CLT", 3, 320], ["SFO", "ORD", 5, 270], ["SFO", "PHX", 6, 120],
  ["SFO", "PHL", 3, 345], ["SFO", "MIA", 2, 345], ["SFO", "LAX", 6, 85], ["SFO", "JFK", 4, 345],
  ["SJC", "DFW", 3, 205], ["SJC", "PHX", 3, 105], ["SJC", "LAX", 3, 75],
  ["SEA", "DFW", 4, 255], ["SEA", "CLT", 2, 320], ["SEA", "ORD", 4, 270], ["SEA", "PHX", 4, 180],
  ["SEA", "PHL", 2, 330], ["SEA", "LAX", 3, 170], ["SEA", "JFK", 2, 345],
  ["PDX", "DFW", 3, 240], ["PDX", "PHX", 3, 160], ["PDX", "ORD", 2, 260], ["PDX", "CLT", 1, 320], ["PDX", "LAX", 2, 145],

  // Domestic leisure
  ["EYW", "MIA", 4, 55], ["EYW", "CLT", 3, 120], ["EYW", "DFW", 1, 170], ["EYW", "ORD", 1, 180, WINTER_SPRING],
  ["EYW", "PHL", 1, 170, WINTER_SPRING],
  ["CHS", "CLT", 6, 70], ["CHS", "DFW", 3, 150], ["CHS", "ORD", 2, 125], ["CHS", "PHL", 3, 105],
  ["CHS", "MIA", 2, 105], ["CHS", "DCA", 3, 95], ["CHS", "LGA", 3, 125],
  ["SAV", "CLT", 5, 70], ["SAV", "DFW", 2, 145], ["SAV", "ORD", 1, 130], ["SAV", "PHL", 2, 115],
  ["SAV", "MIA", 1, 105], ["SAV", "DCA", 2, 105], ["SAV", "LGA", 2, 135],
  ["AVL", "CLT", 4, 55], ["AVL", "DFW", 1, 140], ["AVL", "ORD", 1, 115, [5, 6, 7, 8, 9, 10]],
  ["PWM", "CLT", 3, 135], ["PWM", "PHL", 3, 90], ["PWM", "DCA", 2, 95], ["PWM", "LGA", 2, 75],
  ["PWM", "DFW", 1, 240, [5, 6, 7, 8, 9, 10]], ["PWM", "ORD", 1, 140, [6, 7, 8, 9]],
  ["BZN", "DFW", 2, 200], ["BZN", "CLT", 1, 270], ["BZN", "ORD", 2, 210], ["BZN", "PHX", 1, 145],
  ["BZN", "LAX", 1, 165, SKI_AND_SUMMER], ["BZN", "PHL", 1, 295, PEAK_SUMMER], ["BZN", "JFK", 1, 300, SKI_AND_SUMMER],
  ["JAC", "DFW", 2, 180], ["JAC", "ORD", 1, 210, SKI_AND_SUMMER], ["JAC", "CLT", 1, 260, SKI_AND_SUMMER],
  ["JAC", "PHX", 1, 130, SKI_AND_SUMMER], ["JAC", "LAX", 1, 150, SKI_AND_SUMMER], ["JAC", "MIA", 1, 300, WINTER],
  ["JAC", "LGA", 1, 280, WINTER], ["JAC", "PHL", 1, 275, PEAK_SUMMER],
  ["HDN", "DFW", 2, 150, WINTER], ["HDN", "ORD", 1, 180, WINTER], ["HDN", "CLT", 1, 240, WINTER],
  ["HDN", "LAX", 1, 145, WINTER], ["HDN", "MIA", 1, 280, WINTER], ["HDN", "LGA", 1, 270, WINTER],
  ["SAF", "DFW", 2, 105], ["SAF", "PHX", 1, 85],
  ["PSP", "DFW", 2, 190], ["PSP", "PHX", 4, 70], ["PSP", "ORD", 2, 245, [10, 11, 12, 1, 2, 3, 4, 5]],
  ["PSP", "CLT", 1, 310, WINTER_SPRING], ["PSP", "PHL", 1, 330, [1, 2, 3, 4]], ["PSP", "JFK", 1, 330, WINTER_SPRING],
  ["HNL", "DFW", 2, 505], ["HNL", "LAX", 3, 345], ["HNL", "PHX", 3, 400], ["HNL", "ORD", 1, 555], ["HNL", "CLT", 1, 660],
  ["OGG", "DFW", 1, 500], ["OGG", "LAX", 3, 345], ["OGG", "PHX", 2, 385], ["OGG", "ORD", 1, 540, WINTER_SPRING],
  ["OGG", "CLT", 1, 650, WINTER_SPRING],
  ["ANC", "DFW", 1, 390, SUMMER], ["ANC", "ORD", 1, 375, PEAK_SUMMER], ["ANC", "PHX", 1, 330, SUMMER],
  ["SJU", "MIA", 6, 165], ["SJU", "CLT", 3, 215], ["SJU", "PHL", 2, 245], ["SJU", "DFW", 2, 265],
  ["SJU", "ORD", 1, 280], ["SJU", "JFK", 2, 240],
  ["STT", "MIA", 3, 170], ["STT", "CLT", 2, 240], ["STT", "PHL", 1, 255], ["STT", "DFW", 1, 280], ["STT", "JFK", 1, 250],

  // Mexico, Central America & Caribbean
  ["CUN", "DFW", 7, 145], ["CUN", "CLT", 4, 165], ["CUN", "MIA", 5, 95], ["CUN", "ORD", 3, 205],
  ["CUN", "PHL", 2, 225], ["CUN", "PHX", 2, 215], ["CUN", "AUS", 1, 135], ["CUN", "LAX", 1, 265],
  ["PVR", "DFW", 3, 170], ["PVR", "PHX", 2, 150], ["PVR", "LAX", 2, 175], ["PVR", "ORD", 1, 240],
  ["PVR", "CLT", 1, 255, WINTER_SPRING],
  ["SJD", "DFW", 3, 160], ["SJD", "PHX", 3, 130], ["SJD", "LAX", 3, 150], ["SJD", "ORD", 1, 235],
  ["SJD", "CLT", 1, 255], ["SJD", "PHL", 1, 300, WINTER_SPRING],
  ["MEX", "DFW", 5, 150], ["MEX", "MIA", 3, 195], ["MEX", "CLT", 1, 215], ["MEX", "PHX", 1, 170],
  ["MEX", "LAX", 1, 215], ["MEX", "ORD", 1, 240],
  ["SJO", "DFW", 2, 240], ["SJO", "MIA", 2, 165], ["SJO", "CLT", 1, 240], ["SJO", "LAX", 1, 330, WINTER_SPRING],
  ["LIR", "DFW", 2, 225], ["LIR", "MIA", 1, 165], ["LIR", "CLT", 1, 235], ["LIR", "LAX", 1, 330, WINTER_SPRING],
  ["LIR", "ORD", 1, 285, WINTER_SPRING], ["LIR", "JFK", 1, 300, WINTER_SPRING], ["LIR", "PHL", 1, 290, WINTER_SPRING],
  ["NAS", "MIA", 5, 60], ["NAS", "CLT", 3, 125], ["NAS", "DFW", 1, 175], ["NAS", "PHL", 1, 165],
  ["NAS", "ORD", 1, 185, WINTER_SPRING], ["NAS", "LGA", 1, 180],
  ["MBJ", "MIA", 3, 110], ["MBJ", "CLT", 2, 180], ["MBJ", "DFW", 2, 210], ["MBJ", "PHL", 1, 220], ["MBJ", "ORD", 1, 250],
  ["AUA", "MIA", 3, 155], ["AUA", "CLT", 2, 255], ["AUA", "PHL", 1, 280], ["AUA", "DFW", 1, 300, WINTER_SPRING],
  ["AUA", "ORD", 1, 330, WINTER_SPRING],
  ["PUJ", "MIA", 3, 145], ["PUJ", "CLT", 2, 225], ["PUJ", "PHL", 1, 245], ["PUJ", "DFW", 1, 260], ["PUJ", "ORD", 1, 280],
  ["GCM", "MIA", 3, 75], ["GCM", "CLT", 1, 170], ["GCM", "DFW", 1, 165], ["GCM", "PHL", 1, 200, WINTER_SPRING],
  ["BDA", "PHL", 1, 135], ["BDA", "CLT", 1, 145], ["BDA", "MIA", 1, 155], ["BDA", "JFK", 1, 120],

  // Canada
  ["YYZ", "DFW", 2, 195], ["YYZ", "CLT", 2, 120], ["YYZ", "ORD", 3, 95], ["YYZ", "MIA", 2, 195],
  ["YYZ", "PHL", 2, 95], ["YYZ", "LGA", 2, 90],
  ["YVR", "DFW", 2, 260], ["YVR", "PHX", 2, 175], ["YVR", "LAX", 2, 170], ["YVR", "ORD", 1, 260, [6, 7, 8, 9]],

  // Transatlantic
  ["LHR", "DFW", 3, 545], ["LHR", "JFK", 5, 420], ["LHR", "MIA", 2, 515], ["LHR", "CLT", 1, 500],
  ["LHR", "PHL", 2, 440], ["LHR", "ORD", 2, 470], ["LHR", "LAX", 1, 640], ["LHR", "PHX", 1, 620], ["LHR", "BOS", 1, 400],
  ["DUB", "PHL", 2, 410], ["DUB", "CLT", 1, 480], ["DUB", "DFW", 1, 550], ["DUB", "ORD", 1, 475, EURO_SEASON],
  ["DUB", "JFK", 1, 400, EURO_SEASON],
  ["CDG", "DFW", 1, 560], ["CDG", "PHL", 1, 455], ["CDG", "CLT", 1, 495, EURO_SEASON], ["CDG", "MIA", 1, 535],
  ["CDG", "JFK", 1, 445], ["CDG", "ORD", 1, 500, EURO_SEASON],
  ["MAD", "DFW", 1, 575], ["MAD", "MIA", 1, 535], ["MAD", "PHL", 1, 465], ["MAD", "JFK", 1, 445],
  ["MAD", "CLT", 1, 500, EURO_SEASON],
  ["BCN", "DFW", 1, 585, EURO_SEASON], ["BCN", "PHL", 1, 500, EURO_SEASON], ["BCN", "JFK", 1, 480],
  ["BCN", "MIA", 1, 555, EURO_SEASON], ["BCN", "CLT", 1, 520, SUMMER],
  ["FCO", "DFW", 1, 610, EURO_SEASON], ["FCO", "PHL", 1, 535], ["FCO", "JFK", 1, 525], ["FCO", "MIA", 1, 590, EURO_SEASON],
  ["FCO", "CLT", 1, 560, SUMMER], ["FCO", "ORD", 1, 570, EURO_SEASON],
  ["LIS", "PHL", 1, 420, EURO_SEASON], ["LIS", "JFK", 1, 415], ["LIS", "CLT", 1, 450, SUMMER],
  ["ATH", "JFK", 1, 580, [5, 6, 7, 8, 9, 10]], ["ATH", "PHL", 1, 580, [5, 6, 7, 8, 9, 10]], ["ATH", "DFW", 1, 660, SUMMER],

  // Pacific & South America
  ["HND", "DFW", 1, 830], ["HND", "LAX", 1, 700], ["HND", "JFK", 1, 840],
  ["LIM", "MIA", 2, 345], ["LIM", "DFW", 1, 450],
  ["BOG", "MIA", 3, 230], ["BOG", "DFW", 1, 325],
  ["MDE", "MIA", 2, 215],
  ["EZE", "MIA", 1, 520], ["EZE", "DFW", 1, 600], ["EZE", "JFK", 1, 640],
];

export const AA_ROUTES: RouteRecord[] = T.map(([a, b, daily, blockMin, months]) => ({ a, b, daily, blockMin, months }));
