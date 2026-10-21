import { useState } from 'react';
import { AlertTriangle, CheckCircle, DollarSign, Shield, Target, Users, XCircle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import API from '../services/api';

const ROLES = ['consultant', 'specialist', 'admin'];
const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved', 'Closed'];

function MetricCard({ label, value, detail, Icon, tone }) {
  return (
    <article className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
        <p className={`mt-1 text-2xl font-extrabold ${tone || 'text-slate-800'}`}>{value}</p>
        {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
      </div>
      <Icon aria-hidden="true" className={tone || 'text-blue-500'} size={30} />
    </article>
  );
}

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [ticketReplies, setTicketReplies] = useState({});
  const [assignmentReasons, setAssignmentReasons] = useState({});
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState('');

  const adminQuery = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const [statsRes, usersRes, leadsRes, withdrawalsRes, ticketsRes, auditRes, healthRes] = await Promise.all([
        API.get('/admin/stats'),
        API.get('/admin/users'),
        API.get('/leads'),
        API.get('/withdrawals'),
        API.get('/admin/tickets'),
        API.get('/admin/audit-logs'),
        API.get('/health'),
      ]);
      return {
        stats: statsRes.data,
        users: usersRes.data,
        leads: leadsRes.data,
        withdrawals: withdrawalsRes.data,
        tickets: ticketsRes.data,
        auditLogs: auditRes.data.logs,
        health: healthRes.data,
      };
    },
  });
  const { stats, users = [], leads = [], withdrawals = [], tickets = [], auditLogs = [], health } = adminQuery.data || {};
  const fetchAdminData = () => queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });

  async function runAction(key, action, successMessage) {
    setBusyKey(key);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await fetchAdminData();
      return true;
    } catch (err) {
      setError(err.response?.data?.message || 'The requested action failed.');
      return false;
    } finally {
      setBusyKey('');
    }
  }

  const pendingWithdrawals = withdrawals.filter((withdrawal) => ['Pending', 'Approved'].includes(withdrawal.status));
  const specialists = users.filter((user) => user.role === 'specialist');
  const leadStageData = ['New', 'Contacted', 'In Progress', 'Proposal Sent', 'Closed Won', 'Closed Lost']
    .map((stage) => ({ stage, count: leads.filter((lead) => lead.stage === stage).length }));
  const roleData = ROLES.map((role) => ({ name: role, users: users.filter((user) => user.role === role).length }));

  if (adminQuery.isLoading) {
    return <p className="p-8 text-center text-slate-500">Loading master admin panel...</p>;
  }

  return (
    <section className="mx-auto max-w-7xl space-y-8 p-2 sm:p-6">
      <header className="flex items-center gap-3">
        <Shield aria-hidden="true" className="text-blue-600" size={30} />
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Master Admin Control Panel</h1>
          <p className="text-sm text-slate-500">System oversight, role permissions, lead assignments, payouts, and support.</p>
        </div>
      </header>

      {(error || notice || adminQuery.error) && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${
            (error || adminQuery.error) ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
          role={error || adminQuery.error ? 'alert' : 'status'}
        >
          <span>{error || adminQuery.error?.response?.data?.message || notice}</span>
          {(error || adminQuery.error) && <button className="font-medium underline" onClick={fetchAdminData} type="button">Retry</button>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard
          detail={`${stats?.users?.consultants || 0} Consultants · ${stats?.users?.specialists || 0} Specialists`}
          Icon={Users}
          label="Total Users"
          value={stats?.users?.total ?? 0}
        />
        <MetricCard
          detail={`${stats?.leads?.closedWon || 0} Deals Closed Won`}
          Icon={Target}
          label="Platform Leads"
          value={stats?.leads?.total ?? 0}
          tone="text-emerald-600"
        />
        <MetricCard
          detail={`${stats?.finance?.pendingCount || 0} requests awaiting review`}
          Icon={DollarSign}
          label="Pending Payouts"
          value={`R${Number(stats?.finance?.pendingPayoutAmount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`}
          tone="text-amber-600"
        />
        <MetricCard
          detail="Credited to consultant balances"
          Icon={DollarSign}
          label="Commissions Earned"
          value={`R${Number(stats?.finance?.commissionEarned || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`}
          tone="text-blue-600"
        />
        <MetricCard
          detail="Open or in-progress cases"
          Icon={AlertTriangle}
          label="Support Queue"
          value={stats?.support?.openTickets ?? 0}
          tone="text-blue-600"
        />
        <MetricCard
          detail={`Database: ${health?.database || 'unknown'}`}
          Icon={CheckCircle}
          label="Platform Health"
          value={health?.status === 'operational' ? 'Operational' : 'Degraded'}
          tone={health?.status === 'operational' ? 'text-emerald-600' : 'text-rose-600'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800">Lead Pipeline Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadStageData} margin={{ top: 8, right: 8, left: -20, bottom: 35 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="stage" angle={-25} textAnchor="end" interval={0} tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-bold text-slate-800">User Role Distribution</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={roleData} dataKey="users" nameKey="name" cx="50%" cy="50%" outerRadius={88} label>
                  {roleData.map((entry, index) => (
                    <Cell key={entry.name} fill={['#2563eb', '#7c3aed', '#059669'][index]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-800">Payout Requests</h2>
          <p className="mt-1 text-xs text-slate-500">Approve requests, mark approved payments as processed, or reject and return reserved funds.</p>
        </header>
        {pendingWithdrawals.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">No payout requests need action.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="p-4">Consultant</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Payout Destination</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pendingWithdrawals.map((withdrawal) => (
                  <tr key={withdrawal._id}>
                    <td className="p-4">
                      <p className="font-semibold text-slate-800">{withdrawal.consultant?.name || withdrawal.payoutSnapshot?.accountHolder}</p>
                      <p className="text-xs text-slate-500">{withdrawal.consultant?.email}</p>
                    </td>
                    <td className="p-4 font-bold text-emerald-700">
                      R{Number(withdrawal.amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-xs text-slate-500">
                      {withdrawal.payoutSnapshot?.bankName} · •••• {withdrawal.payoutSnapshot?.accountNumber?.slice(-4)}
                    </td>
                    <td className="p-4">{withdrawal.status}</td>
                    <td className="space-x-2 p-4 text-right">
                      {withdrawal.status === 'Pending' ? (
                        <button
                          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          disabled={busyKey === withdrawal._id}
                          onClick={() => runAction(withdrawal._id, () => API.put(`/admin/withdrawals/${withdrawal._id}/status`, { status: 'Approved' }), 'Payout approved.')}
                          type="button"
                        >
                          Approve
                        </button>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          disabled={busyKey === withdrawal._id}
                          onClick={() => runAction(withdrawal._id, () => API.put(`/admin/withdrawals/${withdrawal._id}/status`, { status: 'Processed' }), 'Payout marked as processed.')}
                          type="button"
                        >
                          <CheckCircle aria-hidden="true" size={13} /> Mark Paid
                        </button>
                      )}
                      <button
                        className="inline-flex items-center gap-1 rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                        disabled={busyKey === withdrawal._id}
                        onClick={() => runAction(withdrawal._id, () => API.put(`/admin/withdrawals/${withdrawal._id}/status`, { status: 'Rejected' }), 'Payout rejected and reserved funds returned.')}
                        type="button"
                      >
                        <XCircle aria-hidden="true" size={13} /> Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-800">User Roles &amp; Permissions</h2>
          <p className="mt-1 text-xs text-slate-500">Consultants capture leads and request payouts; specialists work assigned leads; admins oversee operations.</p>
        </header>
        {users.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
                <tr><th className="p-4">User</th><th className="p-4">Email</th><th className="p-4">Role</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((user) => (
                  <tr key={user._id}>
                    <td className="p-4 font-medium text-slate-800">{user.name}</td>
                    <td className="p-4 text-slate-600">{user.email}</td>
                    <td className="p-4">
                      <label className="sr-only" htmlFor={`role-${user._id}`}>Role for {user.name}</label>
                      <select
                        className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                        disabled={busyKey === `role-${user._id}`}
                        id={`role-${user._id}`}
                        onChange={(event) => {
                          const nextRole = event.target.value;
                          if (nextRole !== user.role) {
                            runAction(`role-${user._id}`, () => API.put(`/admin/users/${user._id}/role`, { role: nextRole }), `${user.name}'s role updated.`);
                          }
                        }}
                        value={user.role}
                      >
                        {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-800">Lead Specialist Assignments</h2>
          <p className="mt-1 text-xs text-slate-500">Assign or unassign a specialist. Specialists can also claim unassigned leads from their queue.</p>
        </header>
        {leads.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No leads have been submitted.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
                <tr><th className="p-4">Lead</th><th className="p-4">Consultant</th><th className="p-4">Stage</th><th className="p-4">Assigned Specialist</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {leads.map((lead) => (
                  <tr key={lead._id}>
                    <td className="p-4">
                      <p className="font-semibold text-slate-800">{lead.clientName}</p>
                      <p className="text-xs text-slate-500">{lead.companyName || lead.clientEmail}</p>
                    </td>
                    <td className="p-4 text-slate-600">{lead.consultant?.name || '—'}</td>
                    <td className="p-4 text-slate-600">{lead.stage}</td>
                    <td className="p-4">
                      <label className="sr-only" htmlFor={`assign-${lead._id}`}>Assign specialist to {lead.clientName}</label>
                      <div className="space-y-2">
                        <label className="sr-only" htmlFor={`reason-${lead._id}`}>Reason for assignment change to {lead.clientName}</label>
                        <input
                          className="w-full min-w-56 rounded border border-slate-300 px-2 py-1.5 text-xs"
                          id={`reason-${lead._id}`}
                          maxLength={2000}
                          onChange={(event) => setAssignmentReasons((current) => ({ ...current, [lead._id]: event.target.value }))}
                          placeholder="Reason required (at least 5 characters)"
                          value={assignmentReasons[lead._id] || ''}
                        />
                        <label className="sr-only" htmlFor={`assign-${lead._id}`}>Assign specialist to {lead.clientName}</label>
                        <select
                          className="max-w-56 rounded border border-slate-300 px-2 py-1.5 text-sm"
                          disabled={busyKey === `lead-${lead._id}`}
                          id={`assign-${lead._id}`}
                          onChange={async (event) => {
                            const specialistId = event.target.value || null;
                            const reason = (assignmentReasons[lead._id] || '').trim();
                            if (reason.length < 5) {
                              setError('Enter a reason of at least 5 characters before changing a lead assignment.');
                              return;
                            }
                            const updated = await runAction(
                              `lead-${lead._id}`,
                              () => API.put(`/admin/leads/${lead._id}/assign`, { specialistId, reason }),
                              'Lead assignment updated.'
                            );
                            if (updated) setAssignmentReasons((current) => ({ ...current, [lead._id]: '' }));
                          }}
                          value={lead.assignedSpecialist?._id || ''}
                        >
                          <option value="">Unassigned</option>
                          {specialists.map((specialist) => (
                            <option key={specialist._id} value={specialist._id}>{specialist.name}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-800">Support Ticket Queue</h2>
          <p className="mt-1 text-xs text-slate-500">Respond to requester messages and manage the ticket status.</p>
        </header>
        {tickets.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No support tickets found.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {tickets.map((ticket) => (
              <article className="space-y-3 p-5" key={ticket._id}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <h3 className="font-semibold text-slate-800">{ticket.subject}</h3>
                    <p className="text-xs text-slate-500">
                      {ticket.consultant?.name} · {ticket.consultant?.role || 'requester'} · {ticket.category} · {ticket.priority}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Status
                    <select
                      className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                      disabled={busyKey === `ticket-status-${ticket._id}`}
                      onChange={(event) => runAction(`ticket-status-${ticket._id}`, () => API.put(`/admin/tickets/${ticket._id}/status`, { status: event.target.value }), 'Ticket status updated.')}
                      value={ticket.status}
                    >
                      {TICKET_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
                <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3">
                  {(ticket.messages || []).map((message, index) => (
                    <p className="text-sm text-slate-700" key={`${message.createdAt}-${index}`}>
                      <span className="font-semibold">{message.senderName || message.senderRole || message.sender}: </span>{message.text}
                    </p>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const text = ticketReplies[ticket._id] || '';
                    if (!text.trim()) return;
                    const sent = await runAction(
                      `ticket-reply-${ticket._id}`,
                      () => API.post(`/admin/tickets/${ticket._id}/reply`, { text }),
                      'Support reply sent.'
                    );
                    if (sent) setTicketReplies((current) => ({ ...current, [ticket._id]: '' }));
                  }}
                >
                  <label className="sr-only" htmlFor={`reply-${ticket._id}`}>Reply to {ticket.subject}</label>
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    id={`reply-${ticket._id}`}
                    onChange={(event) => setTicketReplies((current) => ({ ...current, [ticket._id]: event.target.value }))}
                    placeholder="Write a support response..."
                    value={ticketReplies[ticket._id] || ''}
                  />
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    disabled={busyKey === `ticket-reply-${ticket._id}` || !(ticketReplies[ticket._id] || '').trim()}
                    type="submit"
                  >
                    Reply
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-800">Immutable Audit Activity</h2>
          <p className="mt-1 text-xs text-slate-500">Latest 100 privileged and operational events, with actor and request context.</p>
        </header>
        {auditLogs.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No audit activity recorded.</p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-100 text-xs uppercase text-slate-600">
                <tr><th className="p-3">When</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Resource</th><th className="p-3">Changes</th><th className="p-3">Request</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map((entry) => (
                  <tr key={entry._id}>
                    <td className="whitespace-nowrap p-3 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="p-3 text-xs">{entry.actor?.name || entry.actor?.email || 'System'}</td>
                    <td className="p-3 font-medium text-slate-800">{entry.action}</td>
                    <td className="p-3 text-xs text-slate-600">{entry.resourceType} · {String(entry.resourceId).slice(-8)}</td>
                    <td className="max-w-sm p-3 text-xs">
                      <details>
                        <summary className="cursor-pointer text-blue-700">View changes</summary>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[10px] text-slate-600">
                          {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                        </pre>
                      </details>
                    </td>
                    <td className="p-3 font-mono text-[10px] text-slate-400">{entry.requestId || entry.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
