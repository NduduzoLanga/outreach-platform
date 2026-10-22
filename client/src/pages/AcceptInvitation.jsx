import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await API.post('/auth/accept-invitation', { token, password });
      await login(data.email, password);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Invitation could not be accepted. Ask an administrator for a new link.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-65px)] max-w-xl items-center px-4 py-10">
      <article className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Secure account setup</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Set your password</h1>
        {!token ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
            This invitation link is missing its token. Open the complete link from your invitation email or contact your administrator.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-slate-600">Choose a unique password with at least 12 characters. The link can be used once and expires 24 hours after issue.</p>
            {error && <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{error}</p>}
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <label className="block text-sm font-medium text-slate-700">
                New password
                <input
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                  minLength={12}
                  maxLength={72}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Confirm password
                <input
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5"
                  minLength={12}
                  maxLength={72}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  type="password"
                  value={confirmation}
                />
              </label>
              <button className="w-full rounded-lg bg-emerald-800 px-4 py-3 font-semibold text-white hover:bg-emerald-900 disabled:opacity-50" disabled={submitting} type="submit">
                {submitting ? 'Activating account…' : 'Set password and activate'}
              </button>
            </form>
          </>
        )}
      </article>
    </section>
  );
}
