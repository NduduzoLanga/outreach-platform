import { useContext, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowUpRight, Building, CheckCircle, Clock, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthContext } from '../context/AuthContext';
import API from '../services/api';

const STATUS_STYLES = {
  Pending: 'bg-amber-100 text-amber-800',
  Approved: 'bg-blue-100 text-blue-800',
  Processed: 'bg-emerald-100 text-emerald-800',
  Rejected: 'bg-rose-100 text-rose-800',
};
const withdrawalSchema = z.object({
  amount: z.coerce.number().finite().positive('Enter an amount greater than zero.'),
});

function StatusBadge({ status }) {
  const Icon = status === 'Pending' ? Clock : status === 'Rejected' ? AlertCircle : CheckCircle;
  const label = status === 'Processed' ? 'Paid' : status;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-700'}`}>
      <Icon aria-hidden="true" size={12} />
      {label}
    </span>
  );
}

export default function Withdrawals() {
  const queryClient = useQueryClient();
  const { user, setUser } = useContext(AuthContext);
  const [message, setMessage] = useState({ type: '', text: '' });
  const historyQuery = useQuery({
    queryKey: ['withdrawals'],
    queryFn: async () => (await API.get('/withdrawals')).data,
  });
  const ledgerQuery = useQuery({
    queryKey: ['withdrawal-ledger'],
    queryFn: async () => (await API.get('/withdrawals/ledger')).data,
  });
  const withdrawals = historyQuery.data || [];
  const commissionEntries = (ledgerQuery.data || []).filter((entry) => entry.type === 'commission_earned');
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: { amount: '' },
  });
  const requestWithdrawal = useMutation({
    mutationFn: async ({ amount }) => {
      await API.post('/withdrawals', { amount });
      return API.get('/auth/profile');
    },
    onSuccess: async ({ data }) => {
      setMessage({ type: 'success', text: 'Withdrawal request submitted successfully!' });
      setUser(data);
      reset({ amount: '' });
      await queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Failed to submit withdrawal request.',
      });
    },
  });

  const handleRequestWithdrawal = handleSubmit((values) => {
    setMessage({ type: '', text: '' });
    requestWithdrawal.mutate(values);
  });
  const hasBankDetails = Boolean(user?.bankDetails?.bankName && user?.bankDetails?.accountNumber);
  const balance = Number(user?.balance || 0);

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-2 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Withdrawals &amp; Earnings</h1>
        <p className="text-sm text-slate-500">Request payouts and monitor transaction status.</p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <article className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 text-white shadow-sm">
          <div className="mb-2 flex items-center justify-between text-slate-300">
            <span className="text-sm font-medium">Available Balance</span>
            <Wallet aria-hidden="true" className="text-emerald-400" size={20} />
          </div>
          <p className="text-3xl font-extrabold">
            R{balance.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-2 text-xs text-slate-400">Available for payout requests.</p>
        </article>

        <article className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bank Details Status</span>
            {hasBankDetails ? (
              <div className="mt-3 space-y-1">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Building aria-hidden="true" size={16} />
                  {user.bankDetails.bankName}
                </p>
                <p className="text-xs text-slate-500">Acc: •••• {user.bankDetails.accountNumber.slice(-4)}</p>
              </div>
            ) : (
              <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-600">
                <AlertTriangle aria-hidden="true" size={14} />
                Missing payout bank details
              </p>
            )}
          </div>
          <Link className="mt-4 inline-block text-xs font-semibold text-blue-600 hover:underline" to="/profile">
            {hasBankDetails ? 'Update Banking Details' : '+ Add Bank Details'}
          </Link>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Request Payout</h2>
          <form className="mt-3 space-y-3" onSubmit={handleRequestWithdrawal}>
            <label className="sr-only" htmlFor="withdrawal-amount">Withdrawal amount</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              disabled={!hasBankDetails || isSubmitting || requestWithdrawal.isPending}
              id="withdrawal-amount"
              max={balance}
              min="0.01"
              placeholder="Enter amount (R)"
              step="0.01"
              type="number"
              {...register('amount')}
            />
            {errors.amount && <p className="text-xs text-rose-600">{errors.amount.message}</p>}
            <button
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              disabled={isSubmitting || requestWithdrawal.isPending || !hasBankDetails}
              type="submit"
            >
              <ArrowUpRight aria-hidden="true" size={16} />
              {isSubmitting || requestWithdrawal.isPending ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </article>
      </div>

      {message.text && (
        <p
          className={`rounded-xl border p-4 text-sm font-medium ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-800">Payout History</h2>
        </div>
        {historyQuery.error ? (
          <div className="p-8 text-center text-sm text-rose-700" role="alert">
            <p>{historyQuery.error.response?.data?.message || 'Failed to load withdrawal history.'}</p>
            <button className="mt-2 font-medium underline" onClick={() => historyQuery.refetch()} type="button">Retry</button>
          </div>
        ) : historyQuery.isLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading transaction history...</p>
        ) : withdrawals.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No withdrawal requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="p-4">Date</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Bank Snapshot</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {withdrawals.map((item) => (
                  <tr className="transition hover:bg-slate-50/80" key={item._id}>
                    <td className="p-4 text-slate-600">
                      {new Date(item.createdAt).toLocaleDateString('en-ZA', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="p-4 font-semibold text-slate-800">
                      R{Number(item.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-xs text-slate-500">
                      {item.payoutSnapshot?.bankName || 'N/A'} (••• {item.payoutSnapshot?.accountNumber?.slice(-4) || 'N/A'})
                    </td>
                    <td className="p-4"><StatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-800">Commission Earnings</h2>
          <p className="mt-1 text-xs text-slate-500">Commissions are credited to your available balance when a lead is marked Closed Won.</p>
        </div>
        {ledgerQuery.error ? (
          <div className="p-6 text-sm text-rose-700" role="alert">
            <p>{ledgerQuery.error.response?.data?.message || 'Failed to load commission history.'}</p>
            <button className="mt-2 font-medium underline" onClick={() => ledgerQuery.refetch()} type="button">Retry</button>
          </div>
        ) : ledgerQuery.isLoading ? (
          <p className="p-6 text-center text-sm text-slate-500">Loading earnings...</p>
        ) : commissionEntries.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No commission credits recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="p-4">Credited</th>
                  <th className="p-4">Lead</th>
                  <th className="p-4">Commission</th>
                  <th className="p-4">Balance after credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {commissionEntries.map((entry) => (
                  <tr key={entry._id}>
                    <td className="p-4 text-slate-600">{new Date(entry.createdAt).toLocaleDateString('en-ZA')}</td>
                    <td className="p-4 font-medium text-slate-800">{entry.lead?.clientName || `Lead ${String(entry.lead?._id || entry.lead || '').slice(-8)}`}</td>
                    <td className="p-4 font-semibold text-emerald-700">R{Number(entry.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                    <td className="p-4 text-slate-600">R{Number(entry.availableBalanceAfter).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
