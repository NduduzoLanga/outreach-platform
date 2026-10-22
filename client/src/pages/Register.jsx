import { Link } from 'react-router-dom';
import { MailCheck, ShieldCheck } from 'lucide-react';

export default function Register() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-65px)] max-w-2xl items-center px-4 py-10">
      <article className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800">
          <MailCheck aria-hidden="true" size={24} />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Account onboarding</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Access is invitation-only</h1>
        <p className="mt-4 leading-7 text-slate-600">
          A Master Admin creates your consultant or lead specialist account. You will receive a secure, single-use email link to set your own password. The platform never emails a password.
        </p>
        <div className="mt-6 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-700" size={19} />
          <p>Invitation links expire after 24 hours. If yours expired or you did not receive it, contact your platform administrator for a replacement.</p>
        </div>
        <Link className="mt-8 inline-flex rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900" to="/login">
          Return to sign in
        </Link>
      </article>
    </section>
  );
}
