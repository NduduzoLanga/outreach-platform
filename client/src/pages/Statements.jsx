import { useState } from 'react';
import { CheckCircle, Download, FileText, Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import API from '../services/api';

function formatCurrency(value) {
  return `R${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

export default function Statements() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const statementQuery = useQuery({
    queryKey: ['statement-summary', month],
    queryFn: async () => (await API.get('/statements/summary', { params: { month } })).data,
  });
  const summary = statementQuery.data;

  function downloadCsv() {
    if (!summary) return;
    const rows = [
      ['Outreach Platform - Consultant Account Summary'],
      ['Statement date', new Date().toLocaleDateString('en-ZA')],
      ['Statement month', summary.period?.month || month],
      ['Consultant', summary.consultant?.name || ''],
      ['Email', summary.consultant?.email || ''],
      [],
      ['Metric', 'Value'],
      ['Total leads logged', summary.metrics?.totalLeads ?? 0],
      ['Closed won', summary.metrics?.closedWonCount ?? 0],
      ['Estimated value of leads captured', formatCurrency(summary.metrics?.totalPipelineValue)],
      ['Commission earned', formatCurrency(summary.metrics?.totalCommissionEarned)],
      ['Total withdrawals requested', formatCurrency(summary.metrics?.totalWithdrawalsRequested)],
      ['Total paid out', formatCurrency(summary.metrics?.totalPaidOut)],
      ['Current balance', formatCurrency(summary.consultant?.currentBalance)],
      [],
      ['Recent withdrawal date', 'Amount', 'Status'],
      ...(summary.recentWithdrawals || []).map((withdrawal) => [
        new Date(withdrawal.createdAt).toLocaleDateString('en-ZA'),
        formatCurrency(withdrawal.amount),
        withdrawal.status,
      ]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `outreach-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (statementQuery.isLoading) {
    return <p className="p-8 text-center text-slate-500">Generating statement summary...</p>;
  }

  if (statementQuery.error) {
    return (
      <section className="mx-auto max-w-4xl rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">
        <p>{statementQuery.error.response?.data?.message || 'Failed to fetch statement summary.'}</p>
        <button className="mt-3 font-medium underline" onClick={() => statementQuery.refetch()} type="button">Retry</button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6 p-2 sm:p-6">
      <header className="flex flex-col justify-between gap-4 print:hidden sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Account Statements</h1>
          <p className="text-sm text-slate-500">Review and export your monthly consultant account activity.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="statement-month">Statement month</label>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            id="statement-month"
            max={new Date().toISOString().slice(0, 7)}
            onChange={(event) => setMonth(event.target.value)}
            type="month"
            value={month}
          />
          <button
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            onClick={() => window.print()}
            type="button"
          >
            <Printer aria-hidden="true" size={16} />
            Print / Save PDF
          </button>
          <button
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={downloadCsv}
            type="button"
          >
            <Download aria-hidden="true" size={16} />
            CSV
          </button>
        </div>
      </header>

      <article className="space-y-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm print:border-none print:p-0 print:shadow-none sm:p-8">
        <header className="flex items-start justify-between border-b border-slate-200 pb-6">
          <div className="flex items-center gap-3">
            <FileText aria-hidden="true" className="text-blue-600" size={28} />
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">Outreach Platform</h2>
              <p className="text-xs text-slate-500">Monthly Consultant Account Summary</p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Statement month: {summary?.period?.month || month}</p>
            <p className="mt-1 inline-flex items-center gap-1">
              <CheckCircle aria-hidden="true" className="text-emerald-600" size={13} />
              Active Consultant
            </p>
          </div>
        </header>

        <section aria-label="Consultant details" className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <span className="block text-xs font-semibold uppercase text-slate-500">Consultant Name</span>
            <span className="font-medium text-slate-800">{summary?.consultant?.name || '—'}</span>
          </div>
          <div>
            <span className="block text-xs font-semibold uppercase text-slate-500">Email Address</span>
            <span className="font-medium text-slate-800">{summary?.consultant?.email || '—'}</span>
          </div>
        </section>

        <section aria-label="Account metrics" className="grid grid-cols-2 gap-4 text-center md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase text-slate-500">Total Leads Logged</span>
            <p className="mt-1 text-2xl font-bold text-slate-800">{summary?.metrics?.totalLeads ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase text-slate-500">Closed Won</span>
            <p className="mt-1 text-2xl font-bold text-emerald-600">{summary?.metrics?.closedWonCount ?? 0}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase text-slate-500">Lead Value Captured</span>
            <p className="mt-1 text-xl font-bold text-slate-800">{formatCurrency(summary?.metrics?.totalPipelineValue)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase text-slate-500">Commission Earned</span>
            <p className="mt-1 text-xl font-bold text-blue-700">{formatCurrency(summary?.metrics?.totalCommissionEarned)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <span className="text-xs font-semibold uppercase text-slate-500">Total Paid Out</span>
            <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(summary?.metrics?.totalPaidOut)}</p>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold text-slate-800">Withdrawal Transactions Snapshot</h3>
          {summary?.recentWithdrawals?.length ? (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {summary.recentWithdrawals.map((withdrawal) => (
                    <tr key={withdrawal._id}>
                      <td className="p-3">{new Date(withdrawal.createdAt).toLocaleDateString('en-ZA')}</td>
                      <td className="p-3 font-semibold">{formatCurrency(withdrawal.amount)}</td>
                      <td className="p-3">{withdrawal.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              No withdrawal transactions yet.
            </p>
          )}
        </section>
      </article>
    </section>
  );
}
