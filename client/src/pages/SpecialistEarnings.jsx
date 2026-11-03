import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeDollarSign, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';
import PaymentInvoices from '../components/PaymentInvoices';

const currency = (amount) => `R${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
const paymentTypeLabels = {
  referral_additional_incentive: 'Referral additional incentive',
  performance_based_incentive: 'Performance-based incentive',
  gratuity_incentive: 'Gratuity incentive',
  salary: 'Salary',
};

export default function SpecialistEarnings() {
  const { user, setUser } = useAuth();
  const profileQuery = useQuery({
    queryKey: ['current-profile'],
    queryFn: async () => (await API.get('/auth/profile')).data,
  });
  useEffect(() => {
    if (profileQuery.data) setUser(profileQuery.data);
  }, [profileQuery.data, setUser]);
  const ledgerQuery = useQuery({
    queryKey: ['specialist-ledger'],
    queryFn: async () => (await API.get('/withdrawals/ledger')).data,
  });
  const entries = (ledgerQuery.data || []).filter((entry) => ['commission_earned', 'income_assigned'].includes(entry.type));
  const total = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  return (
    <section className="mx-auto max-w-6xl space-y-6 p-2 sm:p-6">
      <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-institute-forest">Lead specialist workspace</p><h1 className="mt-2 text-3xl font-bold text-slate-900">Earnings</h1><p className="mt-2 text-slate-600">Review additional income assigned to your contribution and the available balance on your account.</p></header>
      {profileQuery.error && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">{profileQuery.error.response?.data?.message || 'Your current balance could not be refreshed.'}<button className="ml-3 underline" onClick={() => profileQuery.refetch()} type="button">Retry</button></p>}
      {ledgerQuery.error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{ledgerQuery.error.response?.data?.message || 'Earnings history could not be loaded.'}<button className="ml-3 underline" onClick={() => ledgerQuery.refetch()} type="button">Retry</button></p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-xl bg-gradient-to-br from-slate-950 to-institute-deep p-6 text-white shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-slate-300">Available balance</p><Wallet className="text-emerald-300" size={20} /></div><p className="mt-3 text-3xl font-bold">{currency(profileQuery.data?.balance ?? user?.balance)}</p><p className="mt-2 text-xs text-slate-300">Your balance is managed by the platform administrator.</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-600">Income credits listed</p><BadgeDollarSign className="text-institute-forest" size={20} /></div><p className="mt-3 text-3xl font-bold text-emerald-700">{currency(total)}</p><p className="mt-2 text-xs text-slate-500">{entries.length} recorded credit{entries.length === 1 ? '' : 's'} in the latest 100 ledger entries</p></article>
      </div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-bold text-slate-900">Income history</h2><p className="mt-1 text-sm text-slate-600">Review automatic deal commissions and additional payments assigned by the Master Admin.</p></header>
        {ledgerQuery.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading income history...</p> : entries.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No income credits have been assigned yet.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-4">Credited</th><th className="p-4">Lead / reference</th><th className="p-4">Credit type</th><th className="p-4">Amount</th><th className="p-4">Available after</th></tr></thead><tbody className="divide-y divide-slate-100">{entries.map((entry) => <tr key={entry._id}><td className="p-4 text-slate-600">{new Date(entry.createdAt).toLocaleDateString('en-ZA')}</td><td className="p-4 font-medium text-slate-900">{entry.lead?.clientName || entry.lead?.centerName || (entry.type === 'income_assigned' ? 'General payment' : 'Lead record')}</td><td className="p-4 text-slate-600">{entry.type === 'income_assigned' ? paymentTypeLabels[entry.incentiveType] || 'Admin-assigned payment' : 'Automatic deal commission'}{entry.assignmentReason && <span className="mt-1 block text-xs text-slate-500">{entry.assignmentReason}</span>}</td><td className="p-4 font-semibold text-emerald-700">{currency(entry.amount)}</td><td className="p-4 text-slate-700">{currency(entry.availableBalanceAfter)}</td></tr>)}</tbody></table></div>
        )}
      </section>
      <PaymentInvoices />
    </section>
  );
}
