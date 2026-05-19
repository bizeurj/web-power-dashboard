import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DebugClient from './DebugClient';

export const dynamic = 'force-dynamic';

/**
 * /debug — auth-gated raw snapshot viewer. Lets you see exactly what
 * the live snapshot looks like, which makes diagnosing "GSC is zero"
 * or "AI tab is empty" trivial. Same access rules as the dashboard.
 */
export default async function DebugPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <main style={{ minHeight: '100vh', background: '#f6f8fb' }}>
      <DebugClient />
    </main>
  );
}
