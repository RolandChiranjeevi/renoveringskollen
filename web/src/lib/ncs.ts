// Ungefärlig färg på skärmen för en NCS-kulörkod.
//
// NCS är ett licensierat system och kan inte räknas om exakt till skärmfärger utan NCS egen tabell.
// Här räknas i stället en uppskattning ut ur själva beteckningen: en NCS-kulör består av andelar
// svart (s), kulörthet (c) och vitt (resten), och en kulörton mellan två av de fyra rena färgerna
// gult, rött, blått och grönt. Resultatet är en bra fingervisning – kulörkoden gäller alltid.

type Hue = 'Y' | 'R' | 'B' | 'G';
type Rgb = [number, number, number];

/** Ungefärliga skärmfärger för de fyra rena NCS-kulörtonerna. */
const UNIQUE: Record<Hue, Rgb> = {
  Y: [255, 211, 0],
  R: [196, 2, 51],
  B: [0, 135, 189],
  G: [0, 159, 107],
};

/** Kulörtonerna ligger i en cirkel: gult → rött → blått → grönt → gult. */
const NEXT: Record<Hue, Hue> = { Y: 'R', R: 'B', B: 'G', G: 'Y' };

export interface Ncs {
  /** Andel svart, 0–99. */
  blackness: number;
  /** Kulörthet, 0–100. */
  chromaticness: number;
  /** Kulörton: första rena färgen och hur många procent mot nästa (0 = ren). Saknas för grått. */
  hue: { from: Hue; to: Hue; percent: number } | null;
}

// "NCS S 0502-Y", "NCS S 1050-Y90R", "S 2030-B", "NCS 1500-N" och "ncs s 1050 - y90r".
const PATTERN = /^(?:NCS)?(?:S)?(\d{2})(\d{2})-(?:(N)|([YRBG])(?:(\d{1,2})([YRBG]))?)$/;

export function parseNcs(code: string | null | undefined): Ncs | null {
  if (!code) return null;
  const m = PATTERN.exec(code.toUpperCase().replace(/\s+/g, ''));
  if (!m) return null;
  const blackness = Number(m[1]);
  const chromaticness = Number(m[2]);
  if (blackness + chromaticness > 100) return null;

  if (m[3]) {
    // Grått ("N") har ingen kulörthet.
    return chromaticness === 0 ? { blackness, chromaticness, hue: null } : null;
  }
  const from = m[4] as Hue;
  if (m[5] === undefined) {
    return { blackness, chromaticness, hue: { from, to: NEXT[from], percent: 0 } };
  }
  const to = m[6] as Hue;
  const percent = Number(m[5]);
  // "Y90R" är giltigt (rött följer på gult), "Y90B" är det inte.
  if (NEXT[from] !== to || percent < 1 || percent > 99) return null;
  return { blackness, chromaticness, hue: { from, to, percent } };
}

const channel = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const hex2 = (n: number) => channel(n).toString(16).padStart(2, '0').toUpperCase();

/** Ungefärlig skärmfärg (#RRGGBB) för en NCS-kod, eller null om koden inte är en NCS-kod. */
export function ncsToHex(code: string | null | undefined): string | null {
  const ncs = parseNcs(code);
  if (!ncs) return null;

  const white = 100 - ncs.blackness - ncs.chromaticness;
  let pure: Rgb = [0, 0, 0];
  if (ncs.hue) {
    const t = ncs.hue.percent / 100;
    const a = UNIQUE[ncs.hue.from];
    const b = UNIQUE[ncs.hue.to];
    pure = [0, 1, 2].map((i) => a[i]! * (1 - t) + b[i]! * t) as Rgb;
  }
  // Vitt är 255, svart 0 och den rena kulören bidrar med sin andel.
  const rgb = pure.map((p) => (white * 255 + ncs.chromaticness * p) / 100);
  return `#${hex2(rgb[0]!)}${hex2(rgb[1]!)}${hex2(rgb[2]!)}`;
}

export interface Swatch {
  hex: string;
  /** Sant när färgen är uträknad ur kulörkoden i stället för vald av användaren. */
  approximate: boolean;
}

/** En angiven färgruta (hex) gäller alltid; annars försöker vi räkna ut en ur kulörkoden. */
export function swatchFor(
  hex: string | null | undefined,
  code: string | null | undefined,
): Swatch | null {
  if (hex) return { hex, approximate: false };
  const fromCode = ncsToHex(code);
  return fromCode ? { hex: fromCode, approximate: true } : null;
}
