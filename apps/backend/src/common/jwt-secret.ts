/** Central JWT secret resolution — fails closed in production.
 * Local/dev falls back to a documented non-secret so `docker compose up` and
 * CI work without configuration; production MUST set JWT_SECRET. */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is missing or too short (>=32 chars required) — refusing to boot in production');
  }
  // eslint-disable-next-line no-console
  console.warn('[auth] JWT_SECRET not set — using dev-only fallback (never use in production)');
  return 'dev-secret-change-me-min-32-chars-please';
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN || '8h';
}
