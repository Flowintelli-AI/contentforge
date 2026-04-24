#!/bin/bash
# Derive direct (non-pooled) URL by stripping the -pooler subdomain Neon uses for PgBouncer
DIRECT_URL=$(echo "$DATABASE_URL" | sed 's/-pooler\\./-./g')
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy --schema packages/db/prisma/schema.prisma
