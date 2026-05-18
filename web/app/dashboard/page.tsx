import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <main style={{ minHeight: '100vh', background: '#f6f8fb' }}>
      <DashboardClient userEmail={session.user?.email || ''} userName={session.user?.name || ''} />
    </main>
  );
}
