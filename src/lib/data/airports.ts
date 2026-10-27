import type { Airport, AirportCode } from "@/lib/domain/types";

/**
 * Curated airport reference set (codes, IANA time zones, approximate coordinates).
 * Coordinates are used only for climate lookups and drawing, never for distances
 * that drive recommendations.
 */
const LIST: Airport[] = [
  // American Airlines hubs
  { code: "DFW", name: "Dallas/Fort Worth International", city: "Dallas–Fort Worth", country: "US", tz: "America/Chicago", lat: 32.9, lon: -97.04 },
  { code: "CLT", name: "Charlotte Douglas International", city: "Charlotte", country: "US", tz: "America/New_York", lat: 35.21, lon: -80.94 },
  { code: "ORD", name: "Chicago O'Hare International", city: "Chicago", country: "US", tz: "America/Chicago", lat: 41.98, lon: -87.9 },
  { code: "PHL", name: "Philadelphia International", city: "Philadelphia", country: "US", tz: "America/New_York", lat: 39.87, lon: -75.24 },
  { code: "MIA", name: "Miami International", city: "Miami", country: "US", tz: "America/New_York", lat: 25.79, lon: -80.29 },
  { code: "PHX", name: "Phoenix Sky Harbor International", city: "Phoenix", country: "US", tz: "America/Phoenix", lat: 33.43, lon: -112.01 },
  { code: "DCA", name: "Ronald Reagan Washington National", city: "Washington", country: "US", tz: "America/New_York", lat: 38.85, lon: -77.04 },
  { code: "LAX", name: "Los Angeles International", city: "Los Angeles", country: "US", tz: "America/Los_Angeles", lat: 33.94, lon: -118.41 },
  { code: "JFK", name: "John F. Kennedy International", city: "New York", country: "US", tz: "America/New_York", lat: 40.64, lon: -73.78 },
  { code: "LGA", name: "LaGuardia", city: "New York", country: "US", tz: "America/New_York", lat: 40.78, lon: -73.87 },

  // Common US departure / spoke airports
  { code: "AUS", name: "Austin–Bergstrom International", city: "Austin", country: "US", tz: "America/Chicago", lat: 30.19, lon: -97.67 },
  { code: "SAT", name: "San Antonio International", city: "San Antonio", country: "US", tz: "America/Chicago", lat: 29.53, lon: -98.47 },
  { code: "IAH", name: "Houston George Bush Intercontinental", city: "Houston", country: "US", tz: "America/Chicago", lat: 29.99, lon: -95.34 },
  { code: "OKC", name: "Will Rogers International", city: "Oklahoma City", country: "US", tz: "America/Chicago", lat: 35.39, lon: -97.6 },
  { code: "TUL", name: "Tulsa International", city: "Tulsa", country: "US", tz: "America/Chicago", lat: 36.2, lon: -95.89 },
  { code: "BNA", name: "Nashville International", city: "Nashville", country: "US", tz: "America/Chicago", lat: 36.12, lon: -86.68 },
  { code: "MSY", name: "Louis Armstrong New Orleans International", city: "New Orleans", country: "US", tz: "America/Chicago", lat: 29.99, lon: -90.26 },
  { code: "STL", name: "St. Louis Lambert International", city: "St. Louis", country: "US", tz: "America/Chicago", lat: 38.75, lon: -90.37 },
  { code: "MCI", name: "Kansas City International", city: "Kansas City", country: "US", tz: "America/Chicago", lat: 39.3, lon: -94.71 },
  { code: "MSP", name: "Minneapolis–Saint Paul International", city: "Minneapolis", country: "US", tz: "America/Chicago", lat: 44.88, lon: -93.22 },
  { code: "ATL", name: "Hartsfield–Jackson Atlanta International", city: "Atlanta", country: "US", tz: "America/New_York", lat: 33.64, lon: -84.43 },
  { code: "RDU", name: "Raleigh–Durham International", city: "Raleigh–Durham", country: "US", tz: "America/New_York", lat: 35.88, lon: -78.79 },
  { code: "BOS", name: "Boston Logan International", city: "Boston", country: "US", tz: "America/New_York", lat: 42.36, lon: -71.01 },
  { code: "BWI", name: "Baltimore/Washington International", city: "Baltimore", country: "US", tz: "America/New_York", lat: 39.18, lon: -76.67 },
  { code: "IAD", name: "Washington Dulles International", city: "Washington", country: "US", tz: "America/New_York", lat: 38.95, lon: -77.46 },
  { code: "EWR", name: "Newark Liberty International", city: "Newark", country: "US", tz: "America/New_York", lat: 40.69, lon: -74.17 },
  { code: "PIT", name: "Pittsburgh International", city: "Pittsburgh", country: "US", tz: "America/New_York", lat: 40.49, lon: -80.23 },
  { code: "CMH", name: "John Glenn Columbus International", city: "Columbus", country: "US", tz: "America/New_York", lat: 39.998, lon: -82.89 },
  { code: "IND", name: "Indianapolis International", city: "Indianapolis", country: "US", tz: "America/Indiana/Indianapolis", lat: 39.72, lon: -86.29 },
  { code: "DTW", name: "Detroit Metropolitan Wayne County", city: "Detroit", country: "US", tz: "America/Detroit", lat: 42.21, lon: -83.35 },
  { code: "MCO", name: "Orlando International", city: "Orlando", country: "US", tz: "America/New_York", lat: 28.43, lon: -81.31 },
  { code: "TPA", name: "Tampa International", city: "Tampa", country: "US", tz: "America/New_York", lat: 27.98, lon: -82.53 },
  { code: "FLL", name: "Fort Lauderdale–Hollywood International", city: "Fort Lauderdale", country: "US", tz: "America/New_York", lat: 26.07, lon: -80.15 },
  { code: "RSW", name: "Southwest Florida International", city: "Fort Myers", country: "US", tz: "America/New_York", lat: 26.54, lon: -81.76 },
  { code: "DEN", name: "Denver International", city: "Denver", country: "US", tz: "America/Denver", lat: 39.86, lon: -104.67 },
  { code: "SLC", name: "Salt Lake City International", city: "Salt Lake City", country: "US", tz: "America/Denver", lat: 40.79, lon: -111.98 },
  { code: "ABQ", name: "Albuquerque International Sunport", city: "Albuquerque", country: "US", tz: "America/Denver", lat: 35.04, lon: -106.61 },
  { code: "LAS", name: "Harry Reid International", city: "Las Vegas", country: "US", tz: "America/Los_Angeles", lat: 36.08, lon: -115.15 },
  { code: "SAN", name: "San Diego International", city: "San Diego", country: "US", tz: "America/Los_Angeles", lat: 32.73, lon: -117.19 },
  { code: "SNA", name: "John Wayne (Orange County)", city: "Santa Ana", country: "US", tz: "America/Los_Angeles", lat: 33.68, lon: -117.87 },
  { code: "BUR", name: "Hollywood Burbank", city: "Burbank", country: "US", tz: "America/Los_Angeles", lat: 34.2, lon: -118.36 },
  { code: "SFO", name: "San Francisco International", city: "San Francisco", country: "US", tz: "America/Los_Angeles", lat: 37.62, lon: -122.38 },
  { code: "SJC", name: "San José Mineta International", city: "San José", country: "US", tz: "America/Los_Angeles", lat: 37.36, lon: -121.93 },
  { code: "SEA", name: "Seattle–Tacoma International", city: "Seattle", country: "US", tz: "America/Los_Angeles", lat: 47.45, lon: -122.31 },
  { code: "PDX", name: "Portland International", city: "Portland", country: "US", tz: "America/Los_Angeles", lat: 45.59, lon: -122.6 },

  // Leisure destinations
  { code: "EYW", name: "Key West International", city: "Key West", country: "US", tz: "America/New_York", lat: 24.56, lon: -81.76 },
  { code: "CHS", name: "Charleston International", city: "Charleston", country: "US", tz: "America/New_York", lat: 32.9, lon: -80.04 },
  { code: "SAV", name: "Savannah/Hilton Head International", city: "Savannah", country: "US", tz: "America/New_York", lat: 32.13, lon: -81.2 },
  { code: "AVL", name: "Asheville Regional", city: "Asheville", country: "US", tz: "America/New_York", lat: 35.44, lon: -82.54 },
  { code: "PWM", name: "Portland International Jetport", city: "Portland, Maine", country: "US", tz: "America/New_York", lat: 43.65, lon: -70.31 },
  { code: "BZN", name: "Bozeman Yellowstone International", city: "Bozeman", country: "US", tz: "America/Denver", lat: 45.78, lon: -111.15 },
  { code: "JAC", name: "Jackson Hole", city: "Jackson Hole", country: "US", tz: "America/Denver", lat: 43.61, lon: -110.74 },
  { code: "HDN", name: "Yampa Valley (Steamboat)", city: "Steamboat Springs", country: "US", tz: "America/Denver", lat: 40.48, lon: -107.22 },
  { code: "SAF", name: "Santa Fe Regional", city: "Santa Fe", country: "US", tz: "America/Denver", lat: 35.62, lon: -106.09 },
  { code: "PSP", name: "Palm Springs International", city: "Palm Springs", country: "US", tz: "America/Los_Angeles", lat: 33.83, lon: -116.51 },
  { code: "HNL", name: "Daniel K. Inouye International", city: "Honolulu", country: "US", tz: "Pacific/Honolulu", lat: 21.32, lon: -157.92 },
  { code: "OGG", name: "Kahului", city: "Maui", country: "US", tz: "Pacific/Honolulu", lat: 20.9, lon: -156.43 },
  { code: "ANC", name: "Ted Stevens Anchorage International", city: "Anchorage", country: "US", tz: "America/Anchorage", lat: 61.17, lon: -150.0 },
  { code: "SJU", name: "Luis Muñoz Marín International", city: "San Juan", country: "PR", tz: "America/Puerto_Rico", lat: 18.44, lon: -66.0 },
  { code: "STT", name: "Cyril E. King", city: "St. Thomas", country: "VI", tz: "America/St_Thomas", lat: 18.34, lon: -64.97 },

  // International
  { code: "CUN", name: "Cancún International", city: "Cancún", country: "MX", tz: "America/Cancun", lat: 21.04, lon: -86.87 },
  { code: "PVR", name: "Puerto Vallarta International", city: "Puerto Vallarta", country: "MX", tz: "America/Mexico_City", lat: 20.68, lon: -105.25 },
  { code: "SJD", name: "Los Cabos International", city: "Los Cabos", country: "MX", tz: "America/Mazatlan", lat: 23.15, lon: -109.72 },
  { code: "MEX", name: "Mexico City International", city: "Mexico City", country: "MX", tz: "America/Mexico_City", lat: 19.44, lon: -99.07 },
  { code: "SJO", name: "Juan Santamaría International", city: "San José", country: "CR", tz: "America/Costa_Rica", lat: 9.99, lon: -84.2 },
  { code: "LIR", name: "Guanacaste (Liberia)", city: "Guanacaste", country: "CR", tz: "America/Costa_Rica", lat: 10.59, lon: -85.54 },
  { code: "NAS", name: "Lynden Pindling International", city: "Nassau", country: "BS", tz: "America/Nassau", lat: 25.04, lon: -77.47 },
  { code: "MBJ", name: "Sangster International", city: "Montego Bay", country: "JM", tz: "America/Jamaica", lat: 18.5, lon: -77.91 },
  { code: "AUA", name: "Queen Beatrix International", city: "Aruba", country: "AW", tz: "America/Aruba", lat: 12.5, lon: -70.02 },
  { code: "PUJ", name: "Punta Cana International", city: "Punta Cana", country: "DO", tz: "America/Santo_Domingo", lat: 18.57, lon: -68.36 },
  { code: "GCM", name: "Owen Roberts International", city: "Grand Cayman", country: "KY", tz: "America/Cayman", lat: 19.29, lon: -81.36 },
  { code: "BDA", name: "L.F. Wade International", city: "Bermuda", country: "BM", tz: "Atlantic/Bermuda", lat: 32.36, lon: -64.68 },
  { code: "YYZ", name: "Toronto Pearson International", city: "Toronto", country: "CA", tz: "America/Toronto", lat: 43.68, lon: -79.63 },
  { code: "YVR", name: "Vancouver International", city: "Vancouver", country: "CA", tz: "America/Vancouver", lat: 49.19, lon: -123.18 },
  { code: "LHR", name: "London Heathrow", city: "London", country: "GB", tz: "Europe/London", lat: 51.47, lon: -0.45 },
  { code: "DUB", name: "Dublin", city: "Dublin", country: "IE", tz: "Europe/Dublin", lat: 53.42, lon: -6.27 },
  { code: "CDG", name: "Paris Charles de Gaulle", city: "Paris", country: "FR", tz: "Europe/Paris", lat: 49.01, lon: 2.55 },
  { code: "MAD", name: "Adolfo Suárez Madrid–Barajas", city: "Madrid", country: "ES", tz: "Europe/Madrid", lat: 40.47, lon: -3.56 },
  { code: "BCN", name: "Barcelona–El Prat", city: "Barcelona", country: "ES", tz: "Europe/Madrid", lat: 41.3, lon: 2.08 },
  { code: "FCO", name: "Rome Fiumicino", city: "Rome", country: "IT", tz: "Europe/Rome", lat: 41.8, lon: 12.25 },
  { code: "LIS", name: "Lisbon Humberto Delgado", city: "Lisbon", country: "PT", tz: "Europe/Lisbon", lat: 38.77, lon: -9.13 },
  { code: "ATH", name: "Athens International", city: "Athens", country: "GR", tz: "Europe/Athens", lat: 37.94, lon: 23.94 },
  { code: "HND", name: "Tokyo Haneda", city: "Tokyo", country: "JP", tz: "Asia/Tokyo", lat: 35.55, lon: 139.78 },
  { code: "LIM", name: "Jorge Chávez International", city: "Lima", country: "PE", tz: "America/Lima", lat: -12.02, lon: -77.11 },
  { code: "BOG", name: "El Dorado International", city: "Bogotá", country: "CO", tz: "America/Bogota", lat: 4.7, lon: -74.15 },
  { code: "MDE", name: "José María Córdova International", city: "Medellín", country: "CO", tz: "America/Bogota", lat: 6.17, lon: -75.43 },
  { code: "EZE", name: "Ministro Pistarini (Ezeiza)", city: "Buenos Aires", country: "AR", tz: "America/Argentina/Buenos_Aires", lat: -34.82, lon: -58.54 },
];

export const AIRPORTS: Record<AirportCode, Airport> = Object.fromEntries(
  LIST.map((a) => [a.code, a]),
);

export function getAirport(code: AirportCode): Airport | undefined {
  return AIRPORTS[code.toUpperCase()];
}

/** Airports that count as "domestic" for a US-based traveler (incl. US territories). */
export function isDomestic(code: AirportCode): boolean {
  const c = AIRPORTS[code]?.country;
  return c === "US" || c === "PR" || c === "VI";
}

/**
 * Nearby airports a traveler might realistically drive to instead.
 * Only includes pairs within roughly a 1–2 hour drive.
 */
export const NEARBY_AIRPORTS: Record<AirportCode, AirportCode[]> = {
  DFW: ["AUS", "OKC"],
  AUS: ["SAT"],
  SAT: ["AUS"],
  IAH: ["AUS"],
  MIA: ["FLL"],
  FLL: ["MIA"],
  DCA: ["BWI", "IAD"],
  BWI: ["DCA", "IAD"],
  IAD: ["DCA", "BWI"],
  JFK: ["LGA", "EWR"],
  LGA: ["JFK", "EWR"],
  EWR: ["LGA", "JFK"],
  LAX: ["BUR", "SNA"],
  BUR: ["LAX"],
  SNA: ["LAX"],
  SFO: ["SJC"],
  SJC: ["SFO"],
  PHL: ["EWR"],
  CLT: ["RDU"],
  RDU: ["CLT"],
  MCO: ["TPA"],
  TPA: ["MCO"],
  ORD: [],
  PHX: [],
  BOS: [],
};

export const ORIGIN_CHOICES: AirportCode[] = [
  "DFW", "CLT", "ORD", "PHL", "MIA", "PHX", "DCA", "LAX", "JFK", "LGA",
  "AUS", "SAT", "IAH", "OKC", "TUL", "BNA", "MSY", "STL", "MCI", "MSP", "ATL", "RDU",
  "BOS", "BWI", "IAD", "EWR", "PIT", "CMH", "IND", "DTW", "MCO", "TPA", "FLL", "RSW",
  "DEN", "SLC", "ABQ", "LAS", "SAN", "SNA", "BUR", "SFO", "SJC", "SEA", "PDX",
];
