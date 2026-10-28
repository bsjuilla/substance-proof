// Place code -> jurisdiction. Small on purpose: only places used by the demo and tests.
// Unknown codes return undefined so the engine reports "unknown", never guesses.

const PLACES: Record<string, string> = {
  // Jersey
  JER: "JE",
  "CITY:STHELIER": "JE",
  "CITY:JERSEY": "JE",
  // Singapore
  SIN: "SG",
  "CITY:SINGAPORE": "SG",
  // United Arab Emirates
  DXB: "AE",
  DWC: "AE",
  AUH: "AE",
  "CITY:DUBAI": "AE",
  // United Kingdom
  LHR: "GB",
  LGW: "GB",
  STN: "GB",
  MAN: "GB",
  "CITY:LONDON": "GB",
  // Guernsey / Isle of Man
  GCI: "GG",
  IOM: "IM",
  // Others used in synthetic travel
  CDG: "FR",
  "CITY:PARIS": "FR",
  FRA: "DE",
  ZRH: "CH",
  HKG: "HK",
  "CITY:HONGKONG": "HK",
  JNB: "ZA",
  MRU: "MU",
  "CITY:PORTLOUIS": "MU",
  BGI: "BB",
  "CITY:BRIDGETOWN": "BB",
};

export function jurisdictionOf(placeCode: string): string | undefined {
  return PLACES[placeCode.trim().toUpperCase()];
}

export const JURISDICTION_NAMES: Record<string, string> = {
  JE: "Jersey",
  SG: "Singapore",
  AE: "United Arab Emirates",
  GB: "United Kingdom",
  GG: "Guernsey",
  IM: "Isle of Man",
  FR: "France",
  DE: "Germany",
  CH: "Switzerland",
  HK: "Hong Kong",
  ZA: "South Africa",
  MU: "Mauritius",
  BB: "Barbados",
};
