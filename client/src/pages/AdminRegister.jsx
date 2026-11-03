import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import API from '../services/api';

export default function AdminRegister() {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const usersQuery = useQuery({
    queryKey: ['admin-register'],
    queryFn: async () => (await API.get('/admin/users')).data,
  });
  const users = usersQuery.data || [];
  const visibleUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch = !query || [user.name, user.email, user.phone].some((value) => value?.toLowerCase().includes(query));
      return matchesSearch && (role === 'all' || user.role === role) && (status === 'all' || (user.accountStatus || 'active') === status);
    });
  }, [users, search, role, status]);
  const activeUsers = users.filter((user) => (user.accountStatus || 'active') === 'active').length;
  const pendingUsers = users.filter((user) => user.accountStatus === 'pending_invitation').length;

  if (usersQuery.isLoading) return <p className="p-8 text-center text-slate-500">Loading registered users...</p>;

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-2 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-institute-deep to-institute-forest p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">People &amp; access</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Registered user directory</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-200">A dedicated view of everyone on the platform, independent of payment activity. Review role, onboarding, contact details and contribution at a glance.</p>
      </header>

      {usersQuery.error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{usersQuery.error.response?.data?.message || 'Registered users could not be loaded.'}<button className="ml-3 underline" onClick={() => usersQuery.refetch()} type="button">Retry</button></p>}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['All registered', users.length, 'Consultants, specialists and administrators'],
          ['Active accounts', activeUsers, 'Currently enabled to access the workspace'],
          ['Invitations pending', pendingUsers, 'Accounts awaiting first-time setup'],
        ].map(([label, value, detail]) => <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={label}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>)}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2"><Users aria-hidden="true" className="text-institute-forest" size={18} /><div><h2 className="font-bold text-slate-900">People register</h2><p className="text-xs text-slate-500">{visibleUsers.length} of {users.length} accounts</p></div></div>
          <div className="flex flex-wrap gap-2">
            <label className="relative"><span className="sr-only">Search users</span><Search aria-hidden="true" className="absolute left-3 top-2.5 text-slate-400" size={15} /><input className="w-56 rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or phone" value={search} /></label>
            <label><span className="sr-only">Filter by role</span><select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onChange={(event) => setRole(event.target.value)} value={role}><option value="all">All roles</option><option value="consultant">Consultants</option><option value="specialist">Lead specialists</option><option value="admin">Administrators</option></select></label>
            <label><span className="sr-only">Filter by status</span><select className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" onChange={(event) => setStatus(event.target.value)} value={status}><option value="all">All statuses</option><option value="active">Active</option><option value="pending_invitation">Pending invitation</option><option value="suspended">Suspended</option></select></label>
          </div>
        </header>
        {visibleUsers.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No accounts match the selected filters.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-600"><tr><th className="p-3">Person &amp; contact</th><th className="p-3">Role / status</th><th className="p-3">Onboarded</th><th className="p-3">Lead activity</th><th className="p-3">Account setup</th><th className="p-3">Invited by</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map((user) => {
                  const displayStatus = (user.accountStatus || 'active').replaceAll('_', ' ');
                  const leadCount = user.role === 'specialist' ? user.assignedLeadCount : user.consultantLeadCount;
                  return (
                    <tr className="align-top hover:bg-slate-50" key={user._id}>
                      <td className="p-3"><p className="font-semibold text-slate-900">{user.name}</p><a className="text-xs text-institute-forest hover:underline" href={`mailto:${user.email}`}>{user.email}</a><p className="text-xs text-slate-500">{user.phone || 'Phone not provided'}</p></td>
                      <td className="p-3"><p className="capitalize text-slate-800">{user.role === 'specialist' ? 'Lead specialist' : user.role}</p><span className={`mt-1 inline-block rounded-full px-2 py-1 text-[11px] font-semibold ${user.accountStatus === 'active' || !user.accountStatus ? 'bg-emerald-100 text-emerald-800' : user.accountStatus === 'suspended' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-900'}`}>{displayStatus}</span></td>
                      <td className="p-3 text-xs text-slate-600"><p>Joined {new Date(user.createdAt).toLocaleDateString('en-ZA')}</p>{user.invitedAt && <p className="mt-1">Invited {new Date(user.invitedAt).toLocaleDateString('en-ZA')}</p>}<p className="mt-1 text-slate-400">Updated {new Date(user.updatedAt).toLocaleDateString('en-ZA')}</p></td>
                      <td className="p-3 text-xs text-slate-700"><p>{leadCount || 0} {user.role === 'specialist' ? 'assigned' : 'captured'} leads</p></td>
                      <td className="p-3 text-xs text-slate-700">{user.setupComplete ? 'Password configured' : user.invitedAt ? 'Invitation setup incomplete' : 'Existing account'}</td>
                      <td className="p-3 text-xs text-slate-600">{user.invitedBy?.name || 'Self-registered / legacy'}<p className="text-slate-400">{user.invitedBy?.email || ''}</p></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
