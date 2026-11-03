import { useMemo, useState } from 'react';
import { CalendarClock, CalendarPlus, ExternalLink, Video } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

const APPOINTMENT_TYPES = ['Product Demo', 'Contract Signing', 'Onboarding Workshop', 'Discovery Meeting', 'Other'];
const initialMeetingTime = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function appointmentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

export default function Conferencing() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [leadId, setLeadId] = useState('');
  const [title, setTitle] = useState('');
  const [appointmentType, setAppointmentType] = useState('Product Demo');
  const [scheduledFor, setScheduledFor] = useState(initialMeetingTime);
  const [meetingLinkOrAddress, setMeetingLinkOrAddress] = useState('');
  const [progressSummary, setProgressSummary] = useState('');
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: async () => (await API.get('/leads')).data,
  });
  const assignedLeads = (leadsQuery.data || []).filter((lead) => lead.assignedSpecialist?._id === user?._id);
  const meetings = useMemo(() => assignedLeads.flatMap((lead) => (lead.appointments || []).map((appointment) => ({ ...appointment, lead })))
    .sort((left, right) => new Date(left.scheduledFor) - new Date(right.scheduledFor)), [assignedLeads]);
  const upcoming = meetings.filter((meeting) => ['scheduled', 'rescheduled'].includes(meeting.status) && new Date(meeting.scheduledFor) >= new Date());
  const selectedLead = assignedLeads.find((lead) => lead._id === leadId);

  async function scheduleMeeting(event) {
    event.preventDefault();
    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      const { data } = await API.post(`/leads/${leadId}/appointments`, {
        title,
        appointmentType,
        scheduledFor: new Date(scheduledFor).toISOString(),
        meetingLinkOrAddress,
        progressSummary,
      });
      setNotice({ type: 'success', text: data.meetingLinkOrAddress ? 'Meeting scheduled. Your meeting link is ready.' : 'Meeting saved. Calendar sync may take a moment or may be unavailable for this account.' });
      setTitle('');
      setMeetingLinkOrAddress('');
      setProgressSummary('');
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'The meeting could not be scheduled.' });
    } finally {
      setBusy(false);
    }
  }

  async function updateMeeting(lead, meeting, status) {
    setNotice({ type: '', text: '' });
    try {
      await API.patch(`/leads/${lead._id}/appointments/${meeting._id}`, { status });
      setNotice({ type: 'success', text: `Meeting marked ${status}.` });
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.message || 'Meeting status could not be updated.' });
    }
  }

  if (leadsQuery.isLoading) return <p className="p-8 text-center text-slate-500">Loading conferencing workspace...</p>;

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-2 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-950 via-institute-deep to-institute-forest p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">Lead specialist tools</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-bold tracking-tight">Conferencing</h1><p className="mt-2 max-w-2xl text-sm text-slate-200">Schedule client meetings, keep appointment details with the lead, and join your next conversation from one workspace.</p></div>
          {user?.calendlyUrl && <a className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-institute-deep hover:bg-emerald-50" href={user.calendlyUrl} rel="noreferrer" target="_blank"><CalendarClock size={16} /> Open Calendly <ExternalLink size={13} /></a>}
        </div>
      </header>

      {leadsQuery.error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{leadsQuery.error.response?.data?.message || 'Lead and appointment data could not be loaded.'}<button className="ml-3 underline" onClick={() => leadsQuery.refetch()} type="button">Retry</button></p>}
      {notice.text && <p className={`rounded-lg border p-3 text-sm ${notice.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</p>}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Assigned leads</p><p className="mt-2 text-3xl font-bold text-slate-900">{assignedLeads.length}</p><p className="mt-1 text-xs text-slate-500">Available for meeting follow-up</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Upcoming meetings</p><p className="mt-2 text-3xl font-bold text-institute-forest">{upcoming.length}</p><p className="mt-1 text-xs text-slate-500">Scheduled or rescheduled</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase text-slate-500">Scheduling links</p><p className="mt-2 text-sm font-semibold text-slate-800">{user?.calendlyUrl ? 'Calendly connected' : 'Calendly link not set'}</p><a className="mt-2 inline-block text-xs font-semibold text-institute-forest hover:underline" href="/profile">{user?.calendlyUrl ? 'Manage scheduling link' : 'Add your Calendly link in Profile'}</a></article>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-bold text-slate-900">Schedule a client meeting</h2><p className="mt-1 text-sm text-slate-600">Google Calendar can generate a Meet link when configured. You may also provide a Meet link or physical venue.</p></header>
        <form className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3" onSubmit={scheduleMeeting}>
          <label className="text-sm font-medium text-slate-700">Assigned lead
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => setLeadId(event.target.value)} required value={leadId}><option value="">Select a lead</option>{assignedLeads.filter((lead) => !['Closed Won', 'Closed Lost'].includes(lead.stage)).map((lead) => <option key={lead._id} value={lead._id}>{lead.centerName || lead.clientName} · {lead.pipelineStage?.replaceAll('_', ' ') || lead.stage}</option>)}</select>
          </label>
          <label className="text-sm font-medium text-slate-700">Meeting title
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={180} onChange={(event) => setTitle(event.target.value)} required value={title} />
          </label>
          <label className="text-sm font-medium text-slate-700">Meeting type
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" onChange={(event) => setAppointmentType(event.target.value)} value={appointmentType}>{APPOINTMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select>
          </label>
          <label className="text-sm font-medium text-slate-700">Date and time
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" min={initialMeetingTime()} onChange={(event) => setScheduledFor(event.target.value)} required type="datetime-local" value={scheduledFor} />
          </label>
          <label className="text-sm font-medium text-slate-700">Meet link or venue <span className="font-normal text-slate-500">(optional)</span>
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={2048} onChange={(event) => setMeetingLinkOrAddress(event.target.value)} placeholder="https://meet.google.com/... or venue" value={meetingLinkOrAddress} />
          </label>
          <label className="text-sm font-medium text-slate-700">Progress summary / next steps
            <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" maxLength={5000} minLength={15} onChange={(event) => setProgressSummary(event.target.value)} required value={progressSummary} />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2 xl:col-span-3">
            <button className="inline-flex items-center gap-2 rounded-lg bg-institute-forest px-4 py-2.5 text-sm font-semibold text-white hover:bg-institute-deep disabled:opacity-50" disabled={busy || !assignedLeads.some((lead) => !['Closed Won', 'Closed Lost'].includes(lead.stage))} type="submit"><CalendarPlus size={16} />{busy ? 'Scheduling…' : 'Schedule meeting'}</button>
            <span className="text-xs text-slate-500">{selectedLead ? `This also updates ${selectedLead.centerName || selectedLead.clientName}'s lead timeline.` : 'Only leads assigned to you can be scheduled here.'}</span>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-5 py-4"><h2 className="font-bold text-slate-900">Your meeting schedule</h2><p className="mt-1 text-sm text-slate-600">Open meeting links, mark completed sessions, or cancel meetings from the timeline.</p></header>
        {meetings.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No meetings scheduled for your assigned leads yet.</p> : (
          <div className="divide-y divide-slate-100">
            {meetings.map((meeting) => {
              const link = appointmentUrl(meeting.meetingLinkOrAddress);
              return (
                <article className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" key={`${meeting.lead._id}-${meeting._id}`}>
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{meeting.title}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium capitalize text-slate-600">{meeting.status}</span></div><p className="mt-1 text-sm text-slate-600">{meeting.lead.centerName || meeting.lead.clientName} · {meeting.appointmentType}</p><p className="mt-1 text-xs text-slate-500">{new Date(meeting.scheduledFor).toLocaleString('en-ZA')}</p>{meeting.providerStatus === 'local_only' && <p className="mt-1 text-xs text-amber-700">Saved locally. Google Calendar sync is not configured; add a Meet link manually if needed.</p>}{meeting.providerStatus === 'sync_failed' && <p className="mt-1 text-xs text-amber-700">Calendar sync failed, but the meeting is saved. Add or share a meeting link manually.</p>}</div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {link && <a className="inline-flex items-center gap-1.5 rounded-lg bg-institute-forest px-3 py-2 text-xs font-semibold text-white hover:bg-institute-deep" href={link} rel="noreferrer" target="_blank"><Video size={14} /> Join meeting <ExternalLink size={12} /></a>}
                    {['scheduled', 'rescheduled'].includes(meeting.status) && <><button className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50" onClick={() => updateMeeting(meeting.lead, meeting, 'completed')} type="button">Mark complete</button><button className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={() => updateMeeting(meeting.lead, meeting, 'cancelled')} type="button">Cancel</button></>}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
