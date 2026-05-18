'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const params = useSearchParams();
  const error = params.get('error');
  const errMsg = error === 'AccessDenied'
    ? 'Sign-in restricted to @workhuman.com email addresses.'
    : error
    ? 'Sign-in failed. Try again.'
    : null;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: '40px',
        maxWidth: '420px',
        width: '100%',
      }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 600, letterSpacing: '-0.02em' }}>
          Workhuman Dashboard
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px', lineHeight: 1.55 }}>
          Sign in with your Workhuman Google account. Access is restricted to email addresses ending in
          {' '}<code style={{ background: '#f1f5f9', padding: '2px 5px', borderRadius: '4px', fontSize: '12px' }}>@workhuman.com</code>.
        </p>

        {errMsg && (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#991b1b',
            padding: '10px 12px',
            borderRadius: '8px',
            fontSize: '13px',
            marginTop: '20px',
          }}>
            {errMsg}
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          style={{
            marginTop: '24px',
            width: '100%',
            padding: '12px 16px',
            background: 'var(--text)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
