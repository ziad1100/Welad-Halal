/**
 * READ-ONLY production diagnostic for 401 investigations (Step 3).
 * Usage (Render Shell): npm run seed:status --workspace apps/backend
 *
 * Prints ONLY non-sensitive state: user counts, usernames, flags, timestamps,
 * recent failed-login tallies, migration count. NEVER prints password hashes,
 * passwords, tokens, secrets, or connection strings.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { username: true, fullName: true, role: true, permissionLevel: true, isOwner: true, isActive: true, forcePasswordChange: true, lastLoginAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`users.total=${users.length}`);
  console.log(`users.owners=${users.filter((u) => u.isOwner).length} active=${users.filter((u) => u.isActive).length} forcePasswordChange=${users.filter((u) => u.forcePasswordChange).length}`);
  for (const u of users) {
    console.log(`user username=${JSON.stringify(u.username)} role=${u.role} level=${u.permissionLevel} owner=${u.isOwner} active=${u.isActive} forcePwChange=${u.forcePasswordChange} lastLogin=${u.lastLoginAt?.toISOString() ?? 'never'}`);
  }
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const fails = await prisma.loginAttempt.groupBy({
    by: ['username', 'success'],
    where: { createdAt: { gte: since } },
    _count: true,
    orderBy: { _count: { username: 'desc' } },
    take: 20,
  });
  console.log(`loginAttempts.last60m.rows=${fails.length}`);
  for (const f of fails) {
    console.log(`attempt username=${JSON.stringify(f.username)} success=${f.success} count=${f._count}`);
  }
  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
    console.log(`migrations.applied=${Number(rows[0]?.count ?? 0)}`);
  } catch {
    console.log('migrations.applied=unknown');
  }
}

main().catch((e) => { console.error(`seed:status failed: ${e?.message || e}`); process.exit(1); }).finally(() => prisma.$disconnect());
