import PgBoss from 'pg-boss'
import { createSupabaseClient } from '@brain/core'
import { registerAllJobs } from './jobs/register.js'

const DATABASE_URL = process.env.DATABASE_URL
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!DATABASE_URL) throw new Error('DATABASE_URL is required')
if (!SUPABASE_URL) throw new Error('SUPABASE_URL is required')
if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY is required')

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const boss = new PgBoss({
  connectionString: DATABASE_URL,
  retryLimit: 2,       // 2 retries → 3 total attempts
  retryBackoff: true,
  retryDelay: 30,      // 30s base, doubles each retry
})

boss.on('error', (error) => {
  console.error('[pg-boss] error:', error)
})

async function start() {
  await boss.start()
  console.log('[worker] pg-boss started')
  registerAllJobs(boss, supabase)
  console.log('[worker] ready')
}

start().catch((err) => {
  console.error('[worker] fatal startup error:', err)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received — stopping')
  await boss.stop()
  process.exit(0)
})
