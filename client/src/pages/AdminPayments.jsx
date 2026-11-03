import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, BadgeDollarSign, Banknote, ChevronDown, CircleDollarSign, RefreshCw, Wallet } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import API from '../services/api';

const CURRENCY = (amount) => `R${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAYMENT_TYPES = {
  commission_earned: 'Automatic deal commission',
  income_assigned: 'Admin-assigned bonus',
  withdrawal_reserved: 'Payout requested',
  withdrawal_approved: 'Payout approved',
  withdrawal_paid: 'Payout processed',
  withdrawal_refunded: 'Payout returned',
};

function paymentLeadName(lead) {
  return lead?.centerName || lead?.clientName || (lead?._id ? `Lead ${String(lead._id).slice(-8)}` : '—');
}

export default function AdminPayments() {
  const queryClient = useQueryClient();
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [olderRows, setOlderRows] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const paymentsQuery = useQuery({
    queryKey: ['admin-payments'],
    queryFn: async () => {
      const [paymentsResponse, statsResponse, leadsResponse] = await Promise.all([
        API.get('/admin/payments', { params: { limit: 100 } }),
        API.get('/admin/stats'),
        API.get('/leads'),
      ]);
      return {
        ...paymentsResponse.data,
        stats: statsResponse.data,
        leads: leadsResponse.data,
      };
    },
  });
  const { payments = [], nextCursor = null, stats, leads = [] } = paymentsQuery.data || {};
  const closedDeals = useMemo(
    () => leads.filter((lead) => lead.stage === 'Closed Won' && lead.commissionCreditedAt),
    [leads]
  );
  const selectedLead = closedDeals.find((lead) => lead._id === selectedLeadId);
  const recipients = selectedLead
    ? [
      ...(selectedLead.consultant?.accountStatus === 'active' ? [{ ...selectedLead.consultant, paymentRole: 'Consultant' }] : []),
      ...(selectedLead.assignedSpecialist?.accountStatus === 'active' && selectedLead.assignedSpecialist._id !== selectedLead.consultant?._id
        ? [{ ...selectedLead.assignedSpecialist, paymentRole: 'Lead specialist' }]
        : []),
    ]
    : [];
  const rows = [...payments, ...olderRows].filter((entry) => (
    filter === 'all'
    || (filter === 'income' && ['commission_earned', 'income_assigned'].includes(entry.type))
    || (filter === 'payouts' && entry.type.startsWith('withdrawal_'))
  ));

  useEffect(() => {
    setOlderRows([]);
    setOlderCursor(null);
  }, [payments]);

  async function assignIncome(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      const { data } = await API.post('/admin/payments/assign-income', {
        leadId: selectedLeadId,
        recipientId,
        amount: Number(amount),
        reason,
      });
      setNotice({ type: 'success', text: data.message });
      setSelectedLeadId('');
      setRecipientId('');
      setAmount('');
      setReason('');
      setOlderRows([]);
      setOlderCursor(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-payments'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'The income bonus could not be assigned.' });
    } finally {
      setBusy(false);
    }
  }

  async function loadOlderPayments() {
    const cursor = olderCursor === null ? nextCursor : olderCursor;
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setNotice({ type: '', text: '' });
    try {
      const { data } = await API.get('/admin/payments', { params: { limit: 100, cursor } });
      setOlderRows((current) => [...current, ...data.payments]);
      setOlderCursor(data.nextCursor || '');
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Older payment records could not be loaded.' });
    } finally {
      setLoadingOlder(false);
    }
  }

  const pendingPayoutValue = Number(stats?.finance?.pendingPayoutAmount || 0);
  const assignedIncomeValue = Number(stats?.finance?.assignedIncome || 0);
  const earnedValue = Number(stats?.finance?.commissionEarned || 0);
  const hasOlderPayments = olderCursor === null ? Boolean(nextCursor) : Boolean(olderCursor);

  if (paymentsQuery.isLoading) return <p className="p-8 text-center text-slate-500">Loading payment operations...</p>;

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-2 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-institute-deep to-institute-forest p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Finance operations</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payments &amp; income</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-200">Review the append-only payment ledger, manage payout requests, and assign documented deal bonuses.</p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-3 py-2 text-sm font-medium hover:bg-white/10" onClick={() => queryClient.invalidateQueries({ queryKey: ['admin-payments'] })} type="button">
            <RefreshCw size={15} /> Refresh records
          </button>
        </div>
      </header>

      {(notice.text || paymentsQuery.error) && (
        <p className={`rounded-lg border p-3 text-sm ${notice.type === 'error' || paymentsQuery.error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role={notice.type === 'error' || paymentsQuery.error ? 'alert' : 'status'}>
          {notice.text || paymentsQuery.error?.response?.data?.message || 'Payment data could not be loaded.'}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Automatic deal commissions', value: CURRENCY(earnedValue), note: 'Package amounts credited at close-won', Icon: BadgeDollarSign },
          { label: 'Additional bonuses assigned', value: CURRENCY(assignedIncomeValue), note: 'Separate from the automatic package commission', Icon: CircleDollarSign },
          { label: 'Payout requests in progress', value: CURRENCY(pendingPayoutValue), note: `${stats?.finance?.pendingCount || 0} pending or approved`, Icon: Banknote },
          { label: 'Closed-won deals', value: stats?.leads?.closedWon ?? 0, note: 'Eligible for documented bonus assignment', Icon: Wallet },
        ].map(({ label, value, note, Icon }) => (
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={label}>
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>
              <Icon aria-hidden="true" className="text-institute-forest" size={22} />
            </div>
          </article>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <h2 className="font-bold text-slate-900">Assign a deal bonus</h2>
          <p className="mt-1 text-sm text-slate-600">This creates an additional, auditable income credit. It does not reduce or replace the automatic consultant commission.</p>
        </header>
        <form className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4" onSubmit={assignIncome}>
          <label className="text-sm font-medium text-slate-700">
            Closed-won deal
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => { setSelectedLeadId(event.target.value); setRecipientId(''); }} required value={selectedLeadId}>
              <option value="">Select a credited deal</option>
              {closedDeals.map((lead) => <option key={lead._id} value={lead._id}>{paymentLeadName(lead)} · {lead.consultant?.name || 'Consultant'} · auto {CURRENCY(lead.commissionEarned)}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Recipient
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" disabled={!selectedLead} onChange={(event) => setRecipientId(event.target.value)} required value={recipientId}>
              <option value="">Select a lead participant</option>
              {recipients.map((recipient) => <option key={recipient._id} value={recipient._id}>{recipient.name} · {recipient.paymentRole}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Additional amount (R)
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" min="0.01" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" value={amount} />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Reason for assignment
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={2000} minLength={10} onChange={(event) => setReason(event.target.value)} placeholder="Document contribution or approval context" required value={reason} />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-4">
            <button className="rounded-lg bg-institute-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-institute-deep disabled:opacity-50" disabled={busy || !closedDeals.length} type="submit">{busy ? 'Recording bonus…' : 'Assign and record bonus'}</button>
            <span className="text-xs text-slate-500">Only the lead owner or currently assigned specialist can receive a deal bonus.</span>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <div><h2 className="font-bold text-slate-900">Complete payment ledger</h2><p className="mt-1 text-sm text-slate-600">Every commission credit and payout state transition appears as its own immutable record.</p></div>
          <label className="text-xs font-semibold text-slate-600">Show
            <select className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" onChange={(event) => setFilter(event.target.value)} value={filter}>
              <option value="all">All transactions</option><option value="income">Income only</option><option value="payouts">Payouts only</option>
            </select>
          </label>
        </header>
        {paymentsQuery.error ? (
          <div className="p-8 text-center text-sm text-rose-700"><p>{paymentsQuery.error.response?.data?.message || 'Payment ledger could not be loaded.'}</p><button className="mt-2 underline" onClick={() => paymentsQuery.refetch()} type="button">Retry</button></div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No matching payment records are available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600">
                <tr><th className="p-3">Recorded</th><th className="p-3">Recipient / reference</th><th className="p-3">Transaction</th><th className="p-3">Amount</th><th className="p-3">Balance before → after</th><th className="p-3">Payment details</th><th className="p-3">Recorded by</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((entry) => {
                  const payout = entry.withdrawal;
                  return (
                    <tr className="align-top hover:bg-slate-50" key={entry._id}>
                      <td className="whitespace-nowrap p-3 text-xs text-slate-600">{new Date(entry.createdAt).toLocaleString('en-ZA')}</td>
                      <td className="p-3"><p className="font-semibold text-slate-900">{entry.consultant?.name || 'Former account'}</p><p className="text-xs text-slate-500">{entry.consultant?.email || '—'}{entry.lead ? ` · ${paymentLeadName(entry.lead)}` : ''}</p></td>
                      <td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{PAYMENT_TYPES[entry.type] || entry.type}</span>{payout && <p className="mt-1 text-xs text-slate-600">Status: {payout.status}</p>}</td>
                      <td className={`whitespace-nowrap p-3 font-bold ${entry.type.startsWith('withdrawal_') ? 'text-amber-700' : 'text-emerald-700'}`}>{CURRENCY(entry.amount)}</td>
                      <td className="whitespace-nowrap p-3 text-xs text-slate-600">{CURRENCY(entry.availableBalanceBefore)} <span aria-hidden="true">→</span> <strong className="text-slate-800">{CURRENCY(entry.availableBalanceAfter)}</strong></td>
                      <td className="max-w-xs p-3 text-xs text-slate-600">
                        {payout ? (
                          <details>
                            <summary className="flex cursor-pointer items-center gap-1 font-semibold text-institute-forest">Payout details <ChevronDown size={13} /></summary>
                            <div className="mt-2 space-y-1">
                              <p>{payout.payoutSnapshot?.accountHolder || entry.payoutSnapshot?.accountHolder || 'Account holder not recorded'}</p>
                              <p>{payout.payoutSnapshot?.bankName || entry.payoutSnapshot?.bankName || 'Bank not recorded'} · branch {payout.payoutSnapshot?.branchCode || entry.payoutSnapshot?.branchCode || '—'} · account ending {payout.payoutSnapshot?.accountNumber?.slice(-4) || entry.payoutSnapshot?.accountNumber?.slice(-4) || '—'}</p>
                              {payout.processedAt && <p>Processed {new Date(payout.processedAt).toLocaleString('en-ZA')}</p>}
                              {payout.adminNotes && <p className="whitespace-normal">Admin note: {payout.adminNotes}</p>}
                              <ul className="mt-1 border-t border-slate-200 pt-1">{(payout.statusEvents || []).map((statusEvent, index) => <li key={`${statusEvent.status}-${statusEvent.createdAt}-${index}`}>{statusEvent.status} · {new Date(statusEvent.createdAt).toLocaleString('en-ZA')}{statusEvent.actor?.name ? ` · by ${statusEvent.actor.name}` : ''}{statusEvent.note ? ` · ${statusEvent.note}` : ''}</li>)}</ul>
                            </div>
                          </details>
                        ) : (
                          <div>{entry.lead?.dealPackage ? <p>Package: {entry.lead.dealPackage.replaceAll('_', ' ')}</p> : null}{entry.assignmentReason && <p className="whitespace-normal">Reason: {entry.assignmentReason}</p>}</div>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-600">{entry.actor?.name || entry.actor?.email || 'System'}<p className="text-slate-400">{entry.actor?.role || ''}</p></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hasOlderPayments && (
          <div className="border-t border-slate-200 p-4 text-center">
            <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={loadingOlder} onClick={loadOlderPayments} type="button">
              <ArrowDownToLine size={15} /> {loadingOlder ? 'Loading…' : 'Load older records'}
            </button>
          </div>
        )}
      </section>
    </section>
  );
}
