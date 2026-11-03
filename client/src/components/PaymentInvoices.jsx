import { useEffect, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import API from '../services/api';

const PAYMENT_LABELS = {
  commission_earned: 'Closed-won deal commission',
  referral_additional_incentive: 'Referral additional incentive',
  performance_based_incentive: 'Performance-based incentive',
  gratuity_incentive: 'Gratuity incentive',
  salary: 'Salary',
};
const currency = (amount) => `R${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function downloadInvoice(invoice, format) {
  const content = format === 'html' ? invoice.htmlContent : invoice.textContent;
  const type = format === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8';
  const blobUrl = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${invoice.invoiceNumber}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export default function PaymentInvoices() {
  const [selectedId, setSelectedId] = useState('');
  const [olderInvoices, setOlderInvoices] = useState([]);
  const [olderCursor, setOlderCursor] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState('');
  const invoicesQuery = useQuery({
    queryKey: ['payment-invoices'],
    queryFn: async () => (await API.get('/invoices')).data,
  });
  const invoiceQuery = useQuery({
    queryKey: ['payment-invoice', selectedId],
    queryFn: async () => (await API.get(`/invoices/${selectedId}`)).data,
    enabled: Boolean(selectedId),
  });
  const { invoices: currentInvoices = [], nextCursor = null } = invoicesQuery.data || {};
  const invoices = [...currentInvoices, ...olderInvoices];
  const selected = invoiceQuery.data;

  useEffect(() => {
    setOlderInvoices([]);
    setOlderCursor(null);
    setOlderError('');
  }, [currentInvoices]);

  async function loadOlderInvoices() {
    const cursor = olderCursor === null ? nextCursor : olderCursor;
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    setOlderError('');
    try {
      const { data } = await API.get('/invoices', { params: { limit: 100, cursor } });
      setOlderInvoices((current) => [...current, ...data.invoices]);
      setOlderCursor(data.nextCursor || '');
    } catch (error) {
      setOlderError(error.response?.data?.message || 'Older invoices could not be loaded.');
    } finally {
      setLoadingOlder(false);
    }
  }
  const hasOlderInvoices = olderCursor === null ? Boolean(nextCursor) : Boolean(olderCursor);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
        <span className="rounded-lg bg-emerald-100 p-2 text-institute-forest"><FileText aria-hidden="true" size={18} /></span>
        <div><h2 className="font-bold text-slate-900">Payment invoices</h2><p className="mt-1 text-sm text-slate-600">Standalone records for admin-assigned payments and closed-won commissions. These are separate from statements.</p></div>
      </header>
      {invoicesQuery.error ? (
        <div className="p-5 text-sm text-rose-700" role="alert"><p>{invoicesQuery.error.response?.data?.message || 'Payment invoices could not be loaded.'}</p><button className="mt-2 underline" onClick={() => invoicesQuery.refetch()} type="button">Retry</button></div>
      ) : invoicesQuery.isLoading ? (
        <p className="p-6 text-center text-sm text-slate-500">Loading invoices…</p>
      ) : invoices.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">No payment invoices have been issued to this account yet.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {invoices.map((invoice) => (
            <article className={`flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${selectedId === invoice._id ? 'bg-emerald-50/60' : ''}`} key={invoice._id}>
              <div>
                <p className="font-semibold text-slate-900">{invoice.invoiceNumber} <span className="font-normal text-slate-500">· {currency(invoice.amount)}</span></p>
                <p className="mt-1 text-xs text-slate-600">{PAYMENT_LABELS[invoice.paymentType] || 'Platform payment'} · {new Date(invoice.issuedAt).toLocaleDateString('en-ZA')}{invoice.referenceSnapshot ? ` · ${invoice.referenceSnapshot}` : ''}{invoice.settlementStatus && invoice.settlementStatus !== 'not_applicable' ? ` · ${invoice.settlementStatus.replaceAll('_', ' ')} (${currency(invoice.settlementPaidAmount || 0)} deposited)` : ''}</p>
              </div>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setSelectedId(invoice._id)} type="button">View / download</button>
            </article>
          ))}
        </div>
      )}
      {olderError && <p className="border-t border-rose-100 px-5 py-3 text-sm text-rose-700" role="alert">{olderError}</p>}
      {hasOlderInvoices && <div className="border-t border-slate-200 p-4 text-center"><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={loadingOlder} onClick={loadOlderInvoices} type="button">{loadingOlder ? 'Loading…' : 'Load older invoices'}</button></div>}
      {selectedId && (
        <div className="border-t border-slate-200 p-5">
          {invoiceQuery.error ? <p className="text-sm text-rose-700" role="alert">{invoiceQuery.error.response?.data?.message || 'This invoice could not be opened.'}<button className="ml-2 underline" onClick={() => invoiceQuery.refetch()} type="button">Retry</button></p> : invoiceQuery.isLoading ? <p className="text-sm text-slate-500">Opening invoice…</p> : selected && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold text-slate-900">{selected.invoiceNumber}</h3>
                <div className="flex gap-2">
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => downloadInvoice(selected, 'html')} type="button"><Download size={14} /> Download HTML</button>
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={() => downloadInvoice(selected, 'txt')} type="button"><Download size={14} /> Download TXT</button>
                </div>
              </div>
              <iframe className="h-[560px] w-full rounded-lg border border-slate-200 bg-white" sandbox="" srcDoc={selected.htmlContent} title={`Invoice ${selected.invoiceNumber}`} />
              {selected.settlementEvents?.length > 0 && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"><p className="font-semibold text-slate-800">Scheduled deposit history</p><ol className="mt-2 space-y-1">{selected.settlementEvents.map((event, index) => <li key={`${event.createdAt}-${index}`}>R{Number(event.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })} deposited · {new Date(event.createdAt).toLocaleString('en-ZA')}{event.actor?.name ? ` · ${event.actor.name}` : ''}{event.note ? ` · ${event.note}` : ''}</li>)}</ol></div>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
