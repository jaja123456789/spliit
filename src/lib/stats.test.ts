import { bucketSpendingOverTime, fillBuckets } from './stats'

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('fillBuckets', () => {
  it('returns nothing for no keys', () => {
    expect(fillBuckets([], 'day')).toEqual([])
    expect(fillBuckets([], 'month')).toEqual([])
  })

  it('fills the empty days between the first and last', () => {
    expect(fillBuckets(['2024-03-01', '2024-03-04'], 'day')).toEqual([
      '2024-03-01',
      '2024-03-02',
      '2024-03-03',
      '2024-03-04',
    ])
  })

  it('crosses a month and a leap day', () => {
    expect(fillBuckets(['2024-02-27', '2024-03-02'], 'day')).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
      '2024-03-02',
    ])
  })

  it('crosses a year boundary by month', () => {
    expect(fillBuckets(['2024-11', '2025-02'], 'month')).toEqual([
      '2024-11',
      '2024-12',
      '2025-01',
      '2025-02',
    ])
  })

  it('does not care what order the keys arrive in', () => {
    expect(fillBuckets(['2024-03-04', '2024-03-01'], 'day')).toEqual(
      fillBuckets(['2024-03-01', '2024-03-04'], 'day'),
    )
  })
})

describe('bucketSpendingOverTime', () => {
  it('returns nothing for no expenses', () => {
    expect(bucketSpendingOverTime([])).toEqual({
      granularity: 'day',
      buckets: [],
    })
  })

  it('adds up several expenses on the same day', () => {
    const result = bucketSpendingOverTime([
      { date: utc('2024-03-01'), amount: 1000 },
      { date: utc('2024-03-01'), amount: 250 },
    ])
    expect(result.granularity).toBe('day')
    expect(result.buckets).toEqual([{ bucket: '2024-03-01', amount: 1250 }])
  })

  it('shows days with no spending as zero rather than closing the gap', () => {
    const result = bucketSpendingOverTime([
      { date: utc('2024-03-01'), amount: 1000 },
      { date: utc('2024-03-03'), amount: 500 },
    ])
    expect(result.buckets).toEqual([
      { bucket: '2024-03-01', amount: 1000 },
      { bucket: '2024-03-02', amount: 0 },
      { bucket: '2024-03-03', amount: 500 },
    ])
  })

  it('stays on days right up to the 60 day limit', () => {
    const result = bucketSpendingOverTime([
      { date: utc('2024-01-01'), amount: 100 },
      { date: utc('2024-02-29'), amount: 100 }, // day 60 inclusive
    ])
    expect(result.granularity).toBe('day')
    expect(result.buckets).toHaveLength(60)
  })

  it('switches to months once the range is longer', () => {
    const result = bucketSpendingOverTime([
      { date: utc('2024-01-01'), amount: 100 },
      { date: utc('2024-03-01'), amount: 100 },
    ])
    expect(result.granularity).toBe('month')
    expect(result.buckets).toEqual([
      { bucket: '2024-01', amount: 100 },
      { bucket: '2024-02', amount: 0 },
      { bucket: '2024-03', amount: 100 },
    ])
  })

  it('keeps the running total equal to what went in', () => {
    const entries = [
      { date: utc('2024-01-05'), amount: 1234 },
      { date: utc('2024-04-17'), amount: -500 },
      { date: utc('2024-09-30'), amount: 99 },
    ]
    const total = entries.reduce((sum, entry) => sum + entry.amount, 0)
    const result = bucketSpendingOverTime(entries)
    expect(result.buckets.reduce((sum, b) => sum + b.amount, 0)).toBe(total)
  })

  it('keys by UTC, so a date-only value never lands on the day before', () => {
    // Midnight UTC on the 1st is still the 1st, whatever the server's timezone is.
    const result = bucketSpendingOverTime([
      { date: utc('2024-03-01'), amount: 100 },
    ])
    expect(result.buckets[0].bucket).toBe('2024-03-01')
  })
})
