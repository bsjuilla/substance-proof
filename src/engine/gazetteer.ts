// Place code -> jurisdiction. Cities: only the places used by the demo and tests, plus the other offshore centres a
// Jersey or Mauritius firm deals with. Airports: the main airports a board director is likely to fly through, each
// with its IANA time zone, because real boarding passes print local airport time without naming a zone.
// Unknown codes return undefined so the engine reports "unknown", never guesses.

/** IATA airport code -> [jurisdiction, IANA time zone]. */
export const AIRPORTS: Record<string, [string, string]> = {
  // Channel Islands and Isle of Man
  JER: ["JE", "Europe/Jersey"], GCI: ["GG", "Europe/Guernsey"], ACI: ["GG", "Europe/Guernsey"], IOM: ["IM", "Europe/Isle_of_Man"],
  // United Kingdom and Ireland
  LHR: ["GB", "Europe/London"], LGW: ["GB", "Europe/London"], STN: ["GB", "Europe/London"], LTN: ["GB", "Europe/London"],
  LCY: ["GB", "Europe/London"], SEN: ["GB", "Europe/London"], MAN: ["GB", "Europe/London"], BHX: ["GB", "Europe/London"],
  BRS: ["GB", "Europe/London"], SOU: ["GB", "Europe/London"], EXT: ["GB", "Europe/London"], EDI: ["GB", "Europe/London"],
  GLA: ["GB", "Europe/London"], NCL: ["GB", "Europe/London"], LPL: ["GB", "Europe/London"], EMA: ["GB", "Europe/London"],
  ABZ: ["GB", "Europe/London"], BFS: ["GB", "Europe/London"], BHD: ["GB", "Europe/London"],
  DUB: ["IE", "Europe/Dublin"], SNN: ["IE", "Europe/Dublin"], ORK: ["IE", "Europe/Dublin"],
  // Europe
  CDG: ["FR", "Europe/Paris"], ORY: ["FR", "Europe/Paris"], NCE: ["FR", "Europe/Paris"], LYS: ["FR", "Europe/Paris"],
  MRS: ["FR", "Europe/Paris"], BOD: ["FR", "Europe/Paris"], TLS: ["FR", "Europe/Paris"], NTE: ["FR", "Europe/Paris"], DNR: ["FR", "Europe/Paris"],
  AMS: ["NL", "Europe/Amsterdam"], BRU: ["BE", "Europe/Brussels"], LUX: ["LU", "Europe/Luxembourg"],
  FRA: ["DE", "Europe/Berlin"], MUC: ["DE", "Europe/Berlin"], BER: ["DE", "Europe/Berlin"], DUS: ["DE", "Europe/Berlin"], HAM: ["DE", "Europe/Berlin"],
  ZRH: ["CH", "Europe/Zurich"], GVA: ["CH", "Europe/Zurich"],
  MAD: ["ES", "Europe/Madrid"], BCN: ["ES", "Europe/Madrid"], AGP: ["ES", "Europe/Madrid"], PMI: ["ES", "Europe/Madrid"],
  LIS: ["PT", "Europe/Lisbon"], OPO: ["PT", "Europe/Lisbon"], FAO: ["PT", "Europe/Lisbon"],
  FCO: ["IT", "Europe/Rome"], MXP: ["IT", "Europe/Rome"], LIN: ["IT", "Europe/Rome"],
  VIE: ["AT", "Europe/Vienna"], CPH: ["DK", "Europe/Copenhagen"], ARN: ["SE", "Europe/Stockholm"], OSL: ["NO", "Europe/Oslo"],
  HEL: ["FI", "Europe/Helsinki"], ATH: ["GR", "Europe/Athens"], MLA: ["MT", "Europe/Malta"], LCA: ["CY", "Asia/Nicosia"],
  WAW: ["PL", "Europe/Warsaw"], PRG: ["CZ", "Europe/Prague"], IST: ["TR", "Europe/Istanbul"],
  // Gulf
  DXB: ["AE", "Asia/Dubai"], DWC: ["AE", "Asia/Dubai"], AUH: ["AE", "Asia/Dubai"], DOH: ["QA", "Asia/Qatar"],
  BAH: ["BH", "Asia/Bahrain"], RUH: ["SA", "Asia/Riyadh"], JED: ["SA", "Asia/Riyadh"], KWI: ["KW", "Asia/Kuwait"], MCT: ["OM", "Asia/Muscat"],
  // Asia
  SIN: ["SG", "Asia/Singapore"], HKG: ["HK", "Asia/Hong_Kong"], NRT: ["JP", "Asia/Tokyo"], HND: ["JP", "Asia/Tokyo"],
  ICN: ["KR", "Asia/Seoul"], PEK: ["CN", "Asia/Shanghai"], PKX: ["CN", "Asia/Shanghai"], PVG: ["CN", "Asia/Shanghai"],
  SHA: ["CN", "Asia/Shanghai"], CAN: ["CN", "Asia/Shanghai"], SZX: ["CN", "Asia/Shanghai"], TPE: ["TW", "Asia/Taipei"],
  BKK: ["TH", "Asia/Bangkok"], KUL: ["MY", "Asia/Kuala_Lumpur"], CGK: ["ID", "Asia/Jakarta"], MNL: ["PH", "Asia/Manila"],
  DEL: ["IN", "Asia/Kolkata"], BOM: ["IN", "Asia/Kolkata"], BLR: ["IN", "Asia/Kolkata"], CMB: ["LK", "Asia/Colombo"], MLE: ["MV", "Indian/Maldives"],
  // Africa and the Indian Ocean
  MRU: ["MU", "Indian/Mauritius"], RUN: ["RE", "Indian/Reunion"], SEZ: ["SC", "Indian/Mahe"],
  JNB: ["ZA", "Africa/Johannesburg"], CPT: ["ZA", "Africa/Johannesburg"], NBO: ["KE", "Africa/Nairobi"], CAI: ["EG", "Africa/Cairo"],
  LOS: ["NG", "Africa/Lagos"], CMN: ["MA", "Africa/Casablanca"], ADD: ["ET", "Africa/Addis_Ababa"],
  // Americas
  JFK: ["US", "America/New_York"], EWR: ["US", "America/New_York"], LGA: ["US", "America/New_York"], BOS: ["US", "America/New_York"],
  IAD: ["US", "America/New_York"], DCA: ["US", "America/New_York"], MIA: ["US", "America/New_York"], ATL: ["US", "America/New_York"],
  ORD: ["US", "America/Chicago"], DFW: ["US", "America/Chicago"], IAH: ["US", "America/Chicago"],
  LAX: ["US", "America/Los_Angeles"], SFO: ["US", "America/Los_Angeles"],
  YYZ: ["CA", "America/Toronto"], YVR: ["CA", "America/Vancouver"], GRU: ["BR", "America/Sao_Paulo"], MEX: ["MX", "America/Mexico_City"],
  BGI: ["BB", "America/Barbados"], GCM: ["KY", "America/Cayman"], EIS: ["VG", "America/Tortola"], NAS: ["BS", "America/Nassau"],
  BDA: ["BM", "Atlantic/Bermuda"], PTY: ["PA", "America/Panama"],
  // Oceania
  SYD: ["AU", "Australia/Sydney"], MEL: ["AU", "Australia/Melbourne"], AKL: ["NZ", "Pacific/Auckland"],
};

const PLACES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(AIRPORTS).map(([code, [j]]) => [code, j])),
  "CITY:STHELIER": "JE",
  "CITY:JERSEY": "JE",
  "CITY:SINGAPORE": "SG",
  "CITY:DUBAI": "AE",
  "CITY:LONDON": "GB",
  "CITY:STPETERPORT": "GG",
  "CITY:DOUGLAS": "IM",
  "CITY:PARIS": "FR",
  "CITY:HONGKONG": "HK",
  "CITY:PORTLOUIS": "MU",
  "CITY:BRIDGETOWN": "BB",
};

export function jurisdictionOf(placeCode: string): string | undefined {
  return PLACES[placeCode.trim().toUpperCase()];
}

const PLACE_NAMES: Record<string, string> = {
  "CITY:STHELIER": "St Helier", "CITY:JERSEY": "Jersey", "CITY:SINGAPORE": "Singapore", "CITY:DUBAI": "Dubai",
  "CITY:LONDON": "London", "CITY:HONGKONG": "Hong Kong", "CITY:PARIS": "Paris", "CITY:PORTLOUIS": "Port Louis", "CITY:BRIDGETOWN": "Bridgetown",
  "CITY:STPETERPORT": "St Peter Port", "CITY:DOUGLAS": "Douglas",
};

/** Human-readable place: "CITY:STHELIER" -> "St Helier"; airport codes stay as codes ("JER"). */
export function placeName(code: string): string {
  // A claimed place the code could not map keeps its words ("TEXT:Lisbon" -> "Lisbon").
  if (code.startsWith("TEXT:")) return code.slice(5);
  return PLACE_NAMES[code.trim().toUpperCase()] ?? code;
}

export const JURISDICTION_NAMES: Record<string, string> = {
  JE: "Jersey", SG: "Singapore", AE: "United Arab Emirates", GB: "United Kingdom", GG: "Guernsey", IM: "Isle of Man",
  IE: "Ireland", FR: "France", NL: "the Netherlands", BE: "Belgium", LU: "Luxembourg", DE: "Germany", CH: "Switzerland",
  ES: "Spain", PT: "Portugal", IT: "Italy", AT: "Austria", DK: "Denmark", SE: "Sweden", NO: "Norway", FI: "Finland",
  GR: "Greece", MT: "Malta", CY: "Cyprus", PL: "Poland", CZ: "Czechia", TR: "Turkey", QA: "Qatar", BH: "Bahrain",
  SA: "Saudi Arabia", KW: "Kuwait", OM: "Oman", HK: "Hong Kong", JP: "Japan", KR: "South Korea", CN: "China",
  TW: "Taiwan", TH: "Thailand", MY: "Malaysia", ID: "Indonesia", PH: "the Philippines", IN: "India", LK: "Sri Lanka",
  MV: "the Maldives", MU: "Mauritius", RE: "Réunion", SC: "Seychelles", ZA: "South Africa", KE: "Kenya", EG: "Egypt",
  NG: "Nigeria", MA: "Morocco", ET: "Ethiopia", US: "the United States", CA: "Canada", BR: "Brazil", MX: "Mexico",
  BB: "Barbados", KY: "the Cayman Islands", VG: "the British Virgin Islands", BS: "the Bahamas", BM: "Bermuda",
  PA: "Panama", AU: "Australia", NZ: "New Zealand",
};
