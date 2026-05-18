import { redirect } from 'next/navigation';

export default function Home() {
  // Middleware will have already gated this; redirect signed-in users to the dashboard.
  redirect('/dashboard');
}
