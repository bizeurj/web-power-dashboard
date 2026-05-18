import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

/**
 * Auth configuration:
 * - Google OAuth as the only provider
 * - Sign-in restricted to allowed email domains (default: workhuman.com)
 * - Anyone outside those domains is rejected at the signIn callback
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
      const allowed = (process.env.ALLOWED_EMAIL_DOMAINS || 'workhuman.com')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const email = (user.email || '').toLowerCase();
      const domain = email.split('@')[1];
      if (!domain) return false;
      return allowed.includes(domain);
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
