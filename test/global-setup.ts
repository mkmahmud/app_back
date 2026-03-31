// test/global-setup.ts
import { execSync } from 'child_process'

module.exports = async () => {
  // Ensure test database is migrated before E2E tests
  if (process.env.NODE_ENV === 'test') {
    console.log('\n🔧 Running test database migrations...')
    try {
      execSync('npx prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL },
        stdio: 'inherit',
      })
    } catch (err) {
      console.error('Migration failed:', err)
      process.exit(1)
    }
  }
}
