import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, FileText, Filter, RefreshCw, Search, ShieldAlert, UserCheck } from 'lucide-react';
import API from '../services/api';

const FILTERS = ['All', 'ROLE', 'PAYOUT', 'LEAD'];
const PAGE_SIZE = 50;

function getActionIcon(action) {
  const normalizedAction = action.toLowerCase();
  if (normalizedAction.includes('role')) return <UserCheck aria-hidden="true" className="text-purple-600" size={16} />;
  if (normalizedAction.includes('payout') || normalizedAction.includes('withdrawal')) {
    return <DollarSign aria-hidden="true" className="text-emerald-600" size={16} />;
  }
  return <FileText aria-hidden="true" className="text-blue-600" size={16} />;
}

function getAuditDetails(log) {
  return JSON.stringify({ before: log.before, after: log.after }).toLowerCase();
}

export default function AuditLogs() {
  const queryClient = useQueryClient();
  const [filterAction, setFilterAction] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const auditQuery = useInfiniteQuery({
    queryKey: ['admin-audit-logs'],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const params = { limit: PAGE_SIZE };
      if (pageParam) params.cursor = pageParam;
      const { data } = await API.get('/admin/audit-logs', { params });
      return data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  });
  const logs = auditQuery.data?.pages.flatMap((page) => page.logs) || [];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredLogs = logs.filter((log) => {
    const normalizedAction = log.action.toLowerCase();
    const matchesAction = filterAction === 'All'
      || (filterAction === 'ROLE' && normalizedAction.includes('role'))
      || (filterAction === 'PAYOUT' && (normalizedAction.includes('payout') || normalizedAction.includes('withdrawal')))
      || (filterAction === 'LEAD' && normalizedAction.includes('lead'));
    const searchableValues = [
      log.actor?.name,
      log.actor?.email,
      log.action,
      log.resourceType,
      log.resourceId,
      log.ipAddress,
      log.requestId,
      getAuditDetails(log),
    ];
    const matchesSearch = searchableValues.some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    return matchesAction && matchesSearch;
  });

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <ShieldAlert aria-hidden="true" className="text-slate-800" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">System Audit Trail</h1>
            <p className="text-sm text-slate-500">Review tenant audit events, privileged actions, and recorded before/after states.</p>
          </div>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          disabled={auditQuery.isFetching}
          onClick={() => queryClient.resetQueries({ queryKey: ['admin-audit-logs'] })}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
          Refresh trail
        </button>
      </header>

      {auditQuery.error && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          <span>{auditQuery.error.response?.data?.message || 'Failed to load the audit trail.'}</span>
          <button className="shrink-0 font-medium underline" onClick={() => auditQuery.refetch()} type="button">Retry</button>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row">
        <div aria-label="Filter audit events" className="flex items-center gap-2 overflow-x-auto" role="group">
          <Filter aria-hidden="true" className="shrink-0 text-slate-400" size={16} />
          {FILTERS.map((filter) => (
            <button
              aria-pressed={filterAction === filter}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                filterAction === filter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              key={filter}
              onClick={() => setFilterAction(filter)}
              type="button"
            >
              {filter}
            </button>
          ))}
        </div>
        <label className="relative w-full md:w-80">
          <span className="sr-only">Search audit trail</span>
          <Search aria-hidden="true" className="absolute left-3 top-3 text-slate-400" size={16} />
          <input
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search actor, event, details, or IP..."
            type="search"
            value={searchTerm}
          />
        </label>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {auditQuery.isLoading ? (
          <p className="p-8 text-center text-sm text-slate-500">Fetching audit trail...</p>
        ) : filteredLogs.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            {logs.length ? 'No audit events match these filters.' : 'No audit events are available.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-4">Timestamp</th>
                  <th className="p-4">Actor</th>
                  <th className="p-4">Action event</th>
                  <th className="p-4">Resource and changes</th>
                  <th className="p-4">IP / request</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLogs.map((log) => (
                  <tr className="align-top transition hover:bg-slate-50/80" key={log._id}>
                    <td className="whitespace-nowrap p-4 text-xs text-slate-500">
                      {new Date(log.createdAt).toLocaleString('en-ZA')}
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-slate-800">{log.actor?.name || 'System / automated'}</p>
                      {log.actor?.email && <p className="mt-1 text-xs text-slate-500">{log.actor.email}</p>}
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center gap-2 font-mono text-xs font-bold text-slate-700">
                        {getActionIcon(log.action)}
                        {log.action}
                      </span>
                    </td>
                    <td className="max-w-xl p-4 text-xs text-slate-600">
                      <p className="font-medium">{log.resourceType} · {String(log.resourceId).slice(-8)}</p>
                      <details className="mt-2">
                        <summary className="cursor-pointer select-none text-blue-700">View recorded changes</summary>
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-[11px] text-slate-600">
                          {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="p-4 text-xs text-slate-500">
                      <p className="font-mono">{log.ipAddress || '—'}</p>
                      {log.requestId && <p className="mt-1 break-all font-mono text-[10px] text-slate-400">{log.requestId}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {auditQuery.hasNextPage && (
          <div className="border-t border-slate-200 p-4 text-center">
            <button
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              disabled={auditQuery.isFetchingNextPage}
              onClick={() => auditQuery.fetchNextPage()}
              type="button"
            >
              {auditQuery.isFetchingNextPage ? 'Loading events...' : 'Load older events'}
            </button>
          </div>
        )}
        {!auditQuery.hasNextPage && logs.length > 0 && (
          <p className="border-t border-slate-200 p-3 text-center text-xs text-slate-400">End of audit trail.</p>
        )}
      </section>
    </section>
  );
}
