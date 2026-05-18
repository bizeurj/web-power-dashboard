/**
 * Edge middleware: protects dashboard pages.
 *
 * /api/refresh is intentionally NOT protected here. It enforces its own
 * authorization in the route handler (either a NextAuth session for human
 * users or a CRON_SECRET bearer token for the daily Vercel Cron). The cron
 * scheduler does not carry a NextAuth session cookie so it would be blocked
 * by the middleware redirect-to-login flow.
 *
 * /api/snapshot stays gated by middleware so unauthenticated reads bounce
 * cleanly to /login.
 *
 * /api/auth/* is never gated (that's how login itself works).
 */
export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/api/snapshot/:path*',
  ],
};
