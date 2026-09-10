/**
 * Jest env normalization (Windows/Docker): `localhost` can resolve to ::1
 * while Docker's published port is IPv4-first — Prisma's engine then
 * intermittently fails with "Can't reach database server". Pin local URLs
 * to the loopback literal. Non-localhost URLs (CI service containers) pass
 * through untouched.
 */
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace('@localhost:', '@127.0.0.1:');
}
