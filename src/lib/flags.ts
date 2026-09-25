import { COUNTRIES } from "./country-data";

// Maps our NOC/IAAF-style 3-letter nationality codes (as stored in
// events_enriched.nationality) to ISO 3166-1 alpha-2, which is what flag
// CDNs (flagcdn.com) expect. Most match loosely, but a real chunk differ
// on purpose (NOC codes follow national Olympic committee history, not
// ISO). Historic/defunct entities (URS, TCH, GDR, YUG...) have no current
// flag and are intentionally left unmapped -- callers should just not
// render a flag for those rather than guessing a modern successor.
export const NOC_TO_ISO2: Record<string, string> = {
  USA: "us", GBR: "gb", GER: "de", FRA: "fr", ITA: "it", ESP: "es", NED: "nl",
  BEL: "be", SUI: "ch", AUT: "at", POR: "pt", SWE: "se", NOR: "no", DEN: "dk",
  FIN: "fi", ISL: "is", IRL: "ie", POL: "pl", CZE: "cz", SVK: "sk", HUN: "hu",
  ROU: "ro", BUL: "bg", GRE: "gr", CRO: "hr", SRB: "rs", SLO: "si", BIH: "ba",
  MKD: "mk", MNE: "me", ALB: "al", KOS: "xk", MDA: "md", UKR: "ua", BLR: "by",
  LTU: "lt", LAT: "lv", EST: "ee", RUS: "ru", GEO: "ge", ARM: "am", AZE: "az",
  KAZ: "kz", UZB: "uz", KGZ: "kg", TJK: "tj", TKM: "tm", MON: "mc", LUX: "lu",
  MLT: "mt", CYP: "cy", AND: "ad", SMR: "sm", LIE: "li",
  CAN: "ca", MEX: "mx", CUB: "cu", JAM: "jm", BAH: "bs", TRI: "tt", BAR: "bb",
  GRN: "gd", LCA: "lc", VIN: "vc", SKN: "kn", DMA: "dm", PUR: "pr", ISV: "vi",
  IVB: "vg", AIA: "ai", CAY: "ky", BER: "bm", ARU: "aw", GUA: "gt", HON: "hn",
  ESA: "sv", NCA: "ni", CRC: "cr", PAN: "pa", COL: "co", VEN: "ve", GUY: "gy",
  SUR: "sr", ECU: "ec", PER: "pe", BOL: "bo", PAR: "py", URU: "uy", BRA: "br",
  ARG: "ar", CHI: "cl",
  CHN: "cn", JPN: "jp", KOR: "kr", PRK: "kp", TPE: "tw", HKG: "hk", MAC: "mo",
  MGL: "mn", VIE: "vn", THA: "th", MAS: "my", SGP: "sg", INA: "id", PHI: "ph",
  BRU: "bn", CAM: "kh", LAO: "la", MYA: "mm", TLS: "tl", IND: "in", PAK: "pk",
  SRI: "lk", BAN: "bd", NEP: "np", BHU: "bt", MDV: "mv", AFG: "af",
  KSA: "sa", UAE: "ae", QAT: "qa", KUW: "kw", BRN: "bh", OMA: "om", YEM: "ye",
  IRQ: "iq", IRI: "ir", SYR: "sy", LBN: "lb", JOR: "jo", ISR: "il", PLE: "ps",
  TUR: "tr",
  RSA: "za", NGR: "ng", EGY: "eg", MAR: "ma", ALG: "dz", TUN: "tn", LBA: "ly",
  KEN: "ke", ETH: "et", UGA: "ug", TAN: "tz", RWA: "rw", BDI: "bi", SUD: "sd",
  SSD: "ss", SOM: "so", DJI: "dj", ERI: "er", GHA: "gh", CIV: "ci", SEN: "sn",
  MLI: "ml", BUR: "bf", NIG: "ne", CHA: "td", CMR: "cm", GAB: "ga", CGO: "cg",
  COD: "cd", CAF: "cf", GEQ: "gq", ANG: "ao", ZAM: "zm", ZIM: "zw", MOZ: "mz",
  MAW: "mw", NAM: "na", BOT: "bw", LES: "ls", SWZ: "sz", MRI: "mu", SEY: "sc",
  MAD: "mg", COM: "km", CPV: "cv", GAM: "gm", GBS: "gw", GUI: "gn", LBR: "lr",
  SLE: "sl", TOG: "tg", BEN: "bj", MTN: "mr", STP: "st", ESW: "sz",
  AUS: "au", NZL: "nz", FIJ: "fj", PNG: "pg", SOL: "sb", VAN: "vu", SAM: "ws",
  TGA: "to", KIR: "ki", TUV: "tv", NRU: "nr", PLW: "pw", FSM: "fm", MHL: "mh",
  ASA: "as", GUM: "gu", COK: "ck", TAH: "pf", NMI: "mp",
};

// Flag code: the country master (country-data.ts, generated from
// tablasauxiliares.countries) first, this older hand map as fallback.
function iso2For(nocCode: string) {
  const c = nocCode.toUpperCase();
  return COUNTRIES[c]?.iso2 ?? NOC_TO_ISO2[c] ?? null;
}

export function countryName(nocCode: string | null | undefined) {
  if (!nocCode) return null;
  return COUNTRIES[nocCode.toUpperCase()]?.name ?? nocCode;
}

export function flagUrl(nocCode: string | null | undefined, size: "16x12" | "24x18" | "32x24" = "24x18") {
  if (!nocCode) return null;
  const iso2 = iso2For(nocCode);
  if (!iso2) return null;
  return `https://flagcdn.com/${size}/${iso2}.png`;
}

// Wider flag images (flagcdn "w" sizes keep each flag's own aspect ratio),
// for the countries grid and country headers.
export function flagUrlWide(nocCode: string | null | undefined, width: 40 | 80 | 160 | 320 = 160) {
  if (!nocCode) return null;
  const iso2 = iso2For(nocCode);
  if (!iso2) return null;
  return `https://flagcdn.com/w${width}/${iso2}.png`;
}
