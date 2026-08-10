/**
 * Time bucketing for the group stats chart.
 *
 * `expenseDate` is a DATE column, so Prisma hands it back as midnight UTC. Every key here is
 * derived in UTC to match — reading those dates in local time is what makes an expense drift to
 * the previous day for anyone west of UTC.
 */

/** Past this many days the per-day bars are too thin to read, so the chart switches to months. */
export const DAILY_BUCKET_LIMIT_DAYS = 60

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type TimeGranularity = 'day' | 'month'

export const dayKey = (date: Date) => date.toISOString().slice(0, 10)
export const monthKey = (date: Date) => date.toISOString().slice(0, 7)

/**
 * Lists every bucket from the first key to the last, including ones nobody spent anything in.
 * Without the empty buckets the axis closes up the gaps, and a fortnight where nothing happened
 * looks exactly like a busy one.
 */
export function fillBuckets(
  keys: string[],
  granularity: TimeGranularity,
): string[] {
  if (keys.length === 0) return []
  const sorted = [...keys].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const filled: string[] = []

  if (granularity === 'day') {
    const lastTime = Date.parse(`${last}T00:00:00.000Z`)
    for (
      let time = Date.parse(`${first}T00:00:00.000Z`);
      time <= lastTime;
      time += MS_PER_DAY
    ) {
      filled.push(new Date(time).toISOString().slice(0, 10))
    }
    return filled
  }

  const [firstYear, firstMonth] = first.split('-').map(Number)
  const [lastYear, lastMonth] = last.split('-').map(Number)
  let year = firstYear
  let month = firstMonth
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    filled.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return filled
}

/**
 * Groups amounts into a continuous run of buckets, switching from days to months once the range
 * gets too long to draw a bar per day.
 */
export function bucketSpendingOverTime(
  entries: { date: Date; amount: number }[],
): {
  granularity: TimeGranularity
  buckets: { bucket: string; amount: number }[]
} {
  if (entries.length === 0) return { granularity: 'day', buckets: [] }

  // ISO day keys sort lexicographically, so the first and last of them bound the range.
  const dayKeys = entries.map((entry) => dayKey(entry.date)).sort()
  const spanInDays =
    (Date.parse(`${dayKeys[dayKeys.length - 1]}T00:00:00.000Z`) -
      Date.parse(`${dayKeys[0]}T00:00:00.000Z`)) /
      MS_PER_DAY +
    1
  const granularity: TimeGranularity =
    spanInDays > DAILY_BUCKET_LIMIT_DAYS ? 'month' : 'day'

  const totals = new Map<string, number>()
  for (const entry of entries) {
    const key =
      granularity === 'day' ? dayKey(entry.date) : monthKey(entry.date)
    totals.set(key, (totals.get(key) ?? 0) + entry.amount)
  }

  return {
    granularity,
    buckets: fillBuckets(Array.from(totals.keys()), granularity).map(
      (bucket) => ({ bucket, amount: totals.get(bucket) ?? 0 }),
    ),
  }
}
