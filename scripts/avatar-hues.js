// Derive an avatar hue set and measure it the way globals.css annotates its tokens.
const h2r = (h, s, l) => {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}
const lum = ([r, g, b]) => {
  const c = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const hex = ([r, g, b]) =>
  '#' +
  [r, g, b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

const BG_LIGHT = h2r(30, 20, 98) // --background
const CARD_LIGHT = h2r(0, 0, 100) // --card
const CARD_DARK = h2r(156, 9, 11) // .dark --card
const BG_DARK = h2r(165, 11, 7) // .dark --background

// Excluded bands: 0-35 (--debt 16/22) and 100-190 (--credit & --primary 158-163).
const HUES = [48, 78, 196, 222, 250, 280, 310, 336]
const RESERVED = { credit: [162, 158], debt: [16, 22], primary: [162, 160] }

const LIGHT = { fillS: 62, fillL: 84, textS: 62, textL: 25 }
const DARK = { fillS: 26, fillL: 26, textS: 62, textL: 76 }

const dist = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

const rows = HUES.map((H) => {
  const lf = h2r(H, LIGHT.fillS, LIGHT.fillL)
  const lt = h2r(H, LIGHT.textS, LIGHT.textL)
  const df = h2r(H, DARK.fillS, DARK.fillL)
  const dt = h2r(H, DARK.textS, DARK.textL)
  const near = Math.min(
    ...Object.values(RESERVED)
      .flat()
      .map((r) => dist(H, r)),
  )
  return {
    H,
    lightFill: hex(lf),
    lightText: hex(lt),
    'text/fill L': ratio(lt, lf).toFixed(2),
    'fill/bg L': ratio(lf, BG_LIGHT).toFixed(2),
    'fill/card L': ratio(lf, CARD_LIGHT).toFixed(2),
    darkFill: hex(df),
    darkText: hex(dt),
    'text/fill D': ratio(dt, df).toFixed(2),
    'fill/card D': ratio(df, CARD_DARK).toFixed(2),
    'fill/bg D': ratio(df, BG_DARK).toFixed(2),
    'Δhue reserved': near,
  }
})
console.table(rows)

const num = (k) => rows.map((r) => Number(r[k]))
const min = (k) => Math.min(...num(k))
console.log(
  '\nworst text/fill  light',
  min('text/fill L'),
  ' dark',
  min('text/fill D'),
)
console.log(
  'worst fill/bg    light',
  min('fill/bg L'),
  '  dark',
  min('fill/bg D'),
)
console.log(
  'worst fill/card  light',
  min('fill/card L'),
  '  dark',
  min('fill/card D'),
)
console.log(
  'closest hue to a reserved token:',
  Math.min(...rows.map((r) => r['Δhue reserved'])),
  'deg',
)
let worstPair = 360
for (let i = 0; i < HUES.length; i++)
  for (let j = i + 1; j < HUES.length; j++)
    worstPair = Math.min(worstPair, dist(HUES[i], HUES[j]))
console.log('closest two avatar hues:', worstPair, 'deg')
