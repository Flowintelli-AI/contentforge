const { execSync } = require('child_process');
// Neon pooled URL uses "-pooler." subdomain (port 6543 / PgBouncer)
// Migrations need the direct URL — strip "-pooler" to get port 5432 endpoint
const direct = (process.env.DATABASE_URL || '').replace(/-pooler\./, '.');
execSync('npx prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: direct },
});
