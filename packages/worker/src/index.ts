import PgBoss from 'pg-boss'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('DATABASE_URL is required')

const boss = new PgBoss({ connectionString: DATABASE_URL })

boss.on('error', (error) => {
  console.error('[pg-boss] error:', error)
})

async function start() {
  await boss.start()
  console.log('[worker] pg-boss started — ready for jobs')
  // Job handlers registered in subsequent issues
}

start().catch((err) => {
  console.error('[worker] fatal startup error:', err)
  process.exit(1)
})

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received — stopping pg-boss')
  await boss.stop()
  process.exit(0)
})
