import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Workhuman Dashboard',
  description: 'Marketing analytics dashboard for workhuman.com',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
