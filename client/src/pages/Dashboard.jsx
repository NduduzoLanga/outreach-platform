import { Link, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import InstitutionalHero from '../components/InstitutionalHero';
import StatCard from '../components/StatCard';
import API from '../services/api';

export default function Dashboard() {
  const { user } = useAuth();
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', user?.role],
    enabled: Boolean(user?.role),
    queryFn: async () => {
      const requests = [API.get('/leads'), API.get('/tickets')];
      if (user?.role === 'consultant') requests.push(API.get('/withdrawals'));
      const [leadsResponse, ticketsResponse, withdrawalsResponse] = await Promise.all(requests);
      return {
        leads: leadsResponse.data,
        tickets: ticketsResponse.data,
        withdrawals: withdrawalsResponse?.data || [],
      };
    },
  });
  const leads = dashboardQuery.data?.leads || [];
  const tickets = dashboardQuery.data?.tickets || [];
  const withdrawals = dashboardQuery.data?.withdrawals || [];

  if (user?.role === 'admin') return <Navigate to="/admin" replace />;

  const isSpecialist = user?.role === 'specialist';
  const activeLeads = leads.filter((lead) => !['Closed Won', 'Closed Lost'].includes(lead.stage));
  const openTickets = tickets.filter((ticket) => ['Open', 'In Progress'].includes(ticket.status));
  const unassignedLeads = leads.filter((lead) => !lead.assignedSpecialist).length;
  const pendingWithdrawals = withdrawals.filter((withdrawal) => ['Pending', 'Approved'].includes(withdrawal.status)).length;
  const now = new Date();
  const scheduledAppointments = leads.flatMap((lead) => lead.appointments || [])
    .filter((appointment) => ['scheduled', 'rescheduled'].includes(appointment.status) && new Date(appointment.scheduledFor) > now);
  const legacyMeetingCount = leads.flatMap((lead) => lead.activityTimeline || [])
    .filter((activity) => activity.type === 'meeting' && activity.scheduledAt && new Date(activity.scheduledAt) > now).length;
  const upcomingMeetings = scheduledAppointments.length || legacyMeetingCount;
  const weightedPipeline = leads.reduce(
    (total, lead) => total + Number(lead.estimatedValue || 0) * Number(lead.conversionProbability ?? 10) / 100,
    0
  );
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || '';

  return (
    <section className="space-y-6">
      <InstitutionalHero
        description={isSpecialist
          ? 'Claim unassigned leads, guide early learning centres through your pipeline, and move opportunities toward successful closure.'
          : 'Build trusted relationships with early learning centres, follow every referral, and manage your earnings in one place.'}
        title={isSpecialist
          ? `Welcome to your lead queue${fullName ? `, ${fullName}` : ''}`
          : `Welcome${fullName ? `, ${fullName}` : ''}`}
      />

      {dashboardQuery.error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">{dashboardQuery.error.response?.data?.message || 'Could not load dashboard activity.'}</p>}
      {dashboardQuery.isLoading ? (
        <p className="py-8 text-center text-slate-500">Loading your activity...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isSpecialist ? (
            <>
              <StatCard label="Assigned / Available Leads" value={`${leads.length - unassignedLeads} / ${unassignedLeads}`} />
              <StatCard label="Active Deals" value={activeLeads.length} />
              <StatCard label="Closed Won" value={leads.filter((lead) => lead.stage === 'Closed Won').length} />
              <StatCard label="Upcoming Meetings" value={upcomingMeetings} />
              <StatCard label="Weighted Pipeline" value={`R${weightedPipeline.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`} />
              <StatCard label="Open Support Tickets" value={openTickets.length} />
            </>
          ) : (
            <>
              <StatCard label="My Leads" value={leads.length} />
              <StatCard label="Leads In Progress" value={activeLeads.length} />
              <StatCard label="Closed Won" value={leads.filter((lead) => lead.stage === 'Closed Won').length} />
              <StatCard
                label="Commission Earned"
                value={`R${leads.reduce((sum, lead) => sum + Number(lead.commissionEarned || 0), 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`}
              />
              <StatCard label="Pending Payout Requests" value={pendingWithdrawals} />
              <StatCard label="Open Support Tickets" value={openTickets.length} />
              <StatCard label="Available Balance" value={`R${Number(user?.balance || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`} />
            </>
          )}
        </div>
      )}

      <section className="rounded-xl border border-institute-forest/10 bg-white p-5 shadow-[0_3px_14px_rgba(6,60,43,0.04)]">
        <h2 className="font-semibold text-institute-deep">{isSpecialist ? 'Next steps' : 'Quick actions'}</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="rounded-lg bg-institute-forest px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-institute-deep focus:outline-none focus:ring-2 focus:ring-institute-gold focus:ring-offset-2" to="/leads">
            {isSpecialist ? 'Open lead work queue' : 'Capture or review leads'}
          </Link>
          {!isSpecialist && (
            <Link className="rounded-lg border border-institute-forest/25 px-4 py-2 text-sm font-medium text-institute-forest transition hover:border-institute-gold hover:bg-institute-paper focus:outline-none focus:ring-2 focus:ring-institute-gold focus:ring-offset-2" to="/withdrawals">
              Request a payout
            </Link>
          )}
          <Link className="rounded-lg border border-institute-forest/25 px-4 py-2 text-sm font-medium text-institute-forest transition hover:border-institute-gold hover:bg-institute-paper focus:outline-none focus:ring-2 focus:ring-institute-gold focus:ring-offset-2" to="/support">
            Contact support
          </Link>
        </div>
      </section>
    </section>
  );
}
