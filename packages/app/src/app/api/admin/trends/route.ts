import { NextResponse } from 'next/server'
import { requireOwner, isErrorResponse } from '@/lib/admin-auth'

export async function GET() {
  const auth = await requireOwner()
  if (isErrorResponse(auth)) return auth

  const { serviceClient } = auth

  // Past 8 weeks of agent run rating data
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000).toISOString()

  const [runsResult, missResult] = await Promise.all([
    serviceClient
      .from('agent_runs')
      .select('created_at, user_rating')
      .gte('created_at', eightWeeksAgo)
      .order('created_at', { ascending: true }),
    serviceClient
      .from('miss_log')
      .select('created_at, resolved')
      .gte('created_at', eightWeeksAgo)
      .order('created_at', { ascending: true }),
  ])

  // Group by ISO week (Monday)
  function getWeekStart(dateStr: string): string {
    const d = new Date(dateStr)
    const day = d.getUTCDay()
    const diff = (day === 0 ? -6 : 1) - day
    d.setUTCDate(d.getUTCDate() + diff)
    return d.toISOString().slice(0, 10)
  }

  type WeekBucket = {
    week: string
    total_runs: number
    rated_runs: number
    rating_sum: number
    miss_count: number
    resolved_miss_count: number
  }

  const buckets: Record<string, WeekBucket> = {}

  function ensureBucket(week: string) {
    if (!buckets[week]) {
      buckets[week] = {
        week,
        total_runs: 0,
        rated_runs: 0,
        rating_sum: 0,
        miss_count: 0,
        resolved_miss_count: 0,
      }
    }
  }

  for (const run of (runsResult.data ?? []) as { created_at: string; user_rating: number | null }[]) {
    const week = getWeekStart(run.created_at)
    ensureBucket(week)
    buckets[week].total_runs++
    if (run.user_rating !== null) {
      buckets[week].rated_runs++
      buckets[week].rating_sum += run.user_rating
    }
  }

  for (const miss of (missResult.data ?? []) as { created_at: string; resolved: boolean }[]) {
    const week = getWeekStart(miss.created_at)
    ensureBucket(week)
    buckets[week].miss_count++
    if (miss.resolved) buckets[week].resolved_miss_count++
  }

  const weeks = Object.values(buckets)
    .sort((a, b) => a.week.localeCompare(b.week))
    .map((b) => ({
      week: b.week,
      total_runs: b.total_runs,
      rated_runs: b.rated_runs,
      avg_rating: b.rated_runs > 0 ? Math.round((b.rating_sum / b.rated_runs) * 100) / 100 : null,
      miss_count: b.miss_count,
      resolved_miss_count: b.resolved_miss_count,
    }))

  return NextResponse.json({ weeks })
}
