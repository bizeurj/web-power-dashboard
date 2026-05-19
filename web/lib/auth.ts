import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/**
 * Auth configuration:
 * - Google OAuth as the only provider
 * - Sign-in allowed if the email matches EITHER:
 *     ALLOWED_EMAIL_DOMAINS  (comma-separated domain allowlist), OR
 *     ALLOWED_EMAILS         (comma-separated specific-email allowlist)
 *   This lets you mix a broad org-wide domain rule with a few specific
 *   personal accounts (e.g. your default Google profile on your laptop)
 *   so individual users don't have to switch Google profiles to sign in.
 * - If both env vars are unset, defaults to allowing the workhuman.com domain.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async signIn({ user }) {
      const email = (user.email || '').toLowerCase();
      if (!email) return false;
      const domain = email.split('@')[1];
      if (!domain) return false;

      const domainAllowlist = parseList(
        process.env.ALLOWED_EMAIL_DOMAINS,
        'workhuman.com'
      );
      const emailAllowlist = parseList(process.env.ALLOWED_EMAILS, '');

      const domainOk = domainAllowlist.includes(domain);
      const emailOk = emailAllowlist.includes(email);
      return domainOk || emailOk;
    },
    async session({ session, token }) {
      // Surface a stable user identifier on the session for downstream UI.
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 60 * 60 * 8, // 8 hour session
  },
  secret: process.env.NEXTAUTH_SECRET,
};

function parseList(raw: string | undefined, fallback: string): string[] {
  const source = raw ?? fallback;
  return source
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
