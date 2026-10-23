// Derive the avatar plates and measure them the way globals.css annotates its tokens.
//
// The plates are chosen in OKLCH, not HSL: HSL hue is not how eyes space colour, and the previous
// set (spaced 26° apart in HSL) produced an olive and a lime at hues 48 and 78, the greens the money
// colour is meant to keep to itself. Here every plate shares one lightness and one chroma, the
// largest chroma all of them can reach inside sRGB, so only the hue changes from plate to plate.
//
//   node scripts/avatar-hues.js     prints the HSL triplets for globals.css and every ratio

// ---- colour maths ----
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const gamma = (v) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
const luminance = ([r, g, b]) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const oklchToLinearRgb = (L, C, h) => {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}
const inGamut = (L, C, h) =>
  oklchToLinearRgb(L, C, h).every((v) => v >= 0 && v <= 1)
const maxChroma = (L, h) => {
  let lo = 0
  let hi = 0.4
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(L, mid, h)) lo = mid
    else hi = mid
  }
  return lo
}
const toHsl = ([r, g, b]) => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 1000) / 10]
}
const fromHsl = ([h, s, l]) => {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}
const hueOf = (rgb) => {
  const [R, G, B] = rgb.map(linear)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}
const dist = (a, b) => {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

// ---- the plates ----
// Sand, then sky round to rose. Nothing in 115-200° (green and teal) and nothing within 26° of the
// money and star tokens. Keep in step with AVATAR_HUES in src/lib/avatar-hue.ts.
const HUES = [85, 230, 258, 286, 314, 342, 10]
const RESERVED = {
  credit: fromHsl([162, 88, 24]),
  debt: fromHsl([16, 88, 39.5]),
  star: fromHsl([32, 95, 44]),
}
const LIGHTNESS = {
  lightPlate: 0.885,
  lightMark: 0.43,
  darkPlate: 0.35,
  darkMark: 0.86,
}
const CHROMA_CAP = { lightMark: 0.11, darkMark: 0.09 }
const chroma = Object.fromEntries(
  Object.entries(LIGHTNESS).map(([role, L]) => {
    const shared = Math.min(...HUES.map((h) => maxChroma(L, h))) * 0.96
    return [role, Math.min(shared, CHROMA_CAP[role] ?? Infinity)]
  }),
)

const LIGHT_SHEET = fromHsl([0, 0, 100])
const DARK_SHEET = fromHsl([30, 4, 11])
const rows = HUES.map((h, index) => {
  const colour = (role) =>
    toHsl(
      oklchToLinearRgb(LIGHTNESS[role], chroma[role], h).map((v) =>
        gamma(Math.max(0, Math.min(1, v))),
      ),
    )
  const t = Object.fromEntries(
    Object.keys(LIGHTNESS).map((role) => [role, colour(role)]),
  )
  return {
    token: `--avatar-${index + 1}`,
    hue: h,
    light: `${t.lightPlate[0]} ${t.lightPlate[1]}% ${t.lightPlate[2]}%`,
    lightMark: `${t.lightMark[0]} ${t.lightMark[1]}% ${t.lightMark[2]}%`,
    'mark/plate L': ratio(fromHsl(t.lightMark), fromHsl(t.lightPlate)).toFixed(
      2,
    ),
    'plate/sheet L': ratio(fromHsl(t.lightPlate), LIGHT_SHEET).toFixed(2),
    dark: `${t.darkPlate[0]} ${t.darkPlate[1]}% ${t.darkPlate[2]}%`,
    darkMark: `${t.darkMark[0]} ${t.darkMark[1]}% ${t.darkMark[2]}%`,
    'mark/plate D': ratio(fromHsl(t.darkMark), fromHsl(t.darkPlate)).toFixed(2),
    'plate/sheet D': ratio(fromHsl(t.darkPlate), DARK_SHEET).toFixed(2),
  }
})
console.table(rows)

const worst = (key) => Math.min(...rows.map((r) => Number(r[key])))
console.log(
  'worst mark/plate  light',
  worst('mark/plate L'),
  ' dark',
  worst('mark/plate D'),
)
const reservedHues = Object.fromEntries(
  Object.entries(RESERVED).map(([k, rgb]) => [k, Math.round(hueOf(rgb))]),
)
console.log('reserved hues (OKLCH):', reservedHues)
console.log(
  'closest plate to a reserved hue:',
  Math.min(
    ...HUES.flatMap((h) => Object.values(reservedHues).map((r) => dist(h, r))),
  ),
  'deg',
)
let closest = 360
for (let i = 0; i < HUES.length; i++)
  for (let j = i + 1; j < HUES.length; j++)
    closest = Math.min(closest, dist(HUES[i], HUES[j]))
console.log('closest two plates:', closest, 'deg')
