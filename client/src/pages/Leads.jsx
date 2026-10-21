import { useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { DndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext';
import API from '../services/api';

const PIPELINE_STAGES = [
  '1_new_unclaimed',
  '2_specialist_contacted',
  '3_demo_meeting_scheduled',
  '4_proposal_negotiation',
  '5_closed_won_pending_payout',
];
const STAGES = ['All', ...PIPELINE_STAGES, 'Closed Lost'];
const STAGE_LABELS = {
  All: 'All',
  '1_new_unclaimed': '1 · New / Unclaimed',
  '2_specialist_contacted': '2 · Specialist Contacted',
  '3_demo_meeting_scheduled': '3 · Demo / Meeting',
  '4_proposal_negotiation': '4 · Proposal / Negotiation',
  '5_closed_won_pending_payout': '5 · Won / Payout Pending',
  'Closed Lost': 'Closed Lost',
};
const LEGACY_TO_PIPELINE = {
  New: '1_new_unclaimed',
  Contacted: '2_specialist_contacted',
  'In Progress': '3_demo_meeting_scheduled',
  'Proposal Sent': '4_proposal_negotiation',
  'Closed Won': '5_closed_won_pending_payout',
  'Closed Lost': 'Closed Lost',
};
const getLeadPipelineStage = (lead) => lead.pipelineStage || LEGACY_TO_PIPELINE[lead.stage] || '1_new_unclaimed';
const EMPTY_FORM = {
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  companyName: '',
  centerName: '',
  address: '',
  townshipRegion: '',
  registrationStatus: 'DBE Registered',
  principalName: '',
  primaryMobile: '',
  whatsappNumber: '',
  emailAddress: '',
  preferredContactMethod: 'whatsapp',
  studentCount: 0,
  staffCount: 0,
  currentAdminMethod: 'Paper',
  primaryPainPoint: 'Admin Chaos',
  ownerPersona: 'overwhelmed_survivor',
  qualificationTier: 'warm',
  initialEncounterNotes: '',
  popiaConsentVerbalConfirmed: false,
  zeroChildrenDataCertified: false,
  expectedContractValue: '',
  conversionProbability: 10,
  notes: '',
};
const leadSchema = z.object({
  clientName: z.string(),
  clientEmail: z.string(),
  clientPhone: z.string(),
  companyName: z.string(),
  centerName: z.string().trim().min(1, 'Center name is required.').max(255),
  address: z.string().trim().min(1, 'Center address is required.').max(1000),
  townshipRegion: z.string().trim().min(1, 'Township or region is required.').max(100),
  registrationStatus: z.enum(['DBE Registered', 'Conditionally Registered', 'Informal', 'Other']),
  principalName: z.string().trim().min(1, 'Decision-maker name is required.').max(255),
  primaryMobile: z.string().trim().min(7, 'Enter a valid mobile number.').max(20).regex(/^[+()\d\s.-]+$/, 'Use a valid mobile number.'),
  whatsappNumber: z.string().trim().max(20).refine((value) => !value || /^[+()\d\s.-]+$/.test(value), 'Use a valid WhatsApp number.'),
  emailAddress: z.string().trim().max(255).refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address.'),
  preferredContactMethod: z.enum(['whatsapp', 'phone', 'email', 'in_person']),
  studentCount: z.coerce.number().int().min(0).max(100000),
  staffCount: z.coerce.number().int().min(0).max(10000),
  currentAdminMethod: z.enum(['Paper', 'Spreadsheets', 'Informal', 'Software', 'Other']),
  primaryPainPoint: z.enum(['Admin Chaos', 'Curriculum Gaps', 'Staff Upskilling', 'Compliance', 'Other']),
  ownerPersona: z.enum(['defensive_guard', 'ambitious_innovator', 'skeptical_veteran', 'overwhelmed_survivor']),
  qualificationTier: z.enum(['hot', 'warm', 'cold']),
  initialEncounterNotes: z.string().trim().min(15, 'Capture at least 15 characters of verified handoff context.').max(5000),
  popiaConsentVerbalConfirmed: z.boolean().refine(Boolean, 'Confirm verbal POPIA consent before submission.'),
  zeroChildrenDataCertified: z.boolean().refine(Boolean, 'Confirm no personal information about children is recorded.'),
  expectedContractValue: z.coerce.number().finite().min(0, 'Value cannot be negative.'),
  conversionProbability: z.coerce.number().int().min(0).max(100),
  notes: z.string(),
});
const activitySchema = z.object({
  type: z.enum(['note', 'call', 'email', 'meeting']),
  text: z.string().trim().min(1, 'Add a note about this touchpoint.'),
  scheduledAt: z.string(),
  meetingTitle: z.string().trim().max(180),
  meetingUrl: z.string().trim().refine((value) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:';
    } catch {
      return !/^[a-z][a-z\d+.-]*:/i.test(value);
    }
  }, 'Use an HTTPS link or enter a physical meeting location.'),
  appointmentType: z.enum(['Product Demo', 'Contract Signing', 'Onboarding Workshop', 'Discovery Meeting', 'Other']),
  scheduledFollowUp: z.string(),
}).superRefine((value, context) => {
  if (value.type === 'meeting') {
    if (value.text.trim().length < 15) {
      context.addIssue({ code: 'custom', path: ['text'], message: 'Include at least 15 characters of meeting outcome or next-step context.' });
    }
    if (!value.scheduledAt) {
      context.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Choose a meeting date and time.' });
    }
  }
});
const specialistLeadSchema = z.object({
  conversionProbability: z.coerce.number().int().min(0).max(100),
  notes: z.string(),
});
const adminLeadSchema = z.object({}).passthrough();
const STAGE_COLORS = {
  '1_new_unclaimed': 'bg-blue-100 text-blue-800',
  '2_specialist_contacted': 'bg-purple-100 text-purple-800',
  '3_demo_meeting_scheduled': 'bg-yellow-100 text-yellow-800',
  '4_proposal_negotiation': 'bg-indigo-100 text-indigo-800',
  '5_closed_won_pending_payout': 'bg-green-100 text-green-800',
  'Closed Lost': 'bg-red-100 text-red-800',
};

export default function Leads() {
  const queryClient = useQueryClient();
  const { user, setUser } = useAuth();
  const isConsultant = user?.role === 'consultant';
  const isSpecialist = user?.role === 'specialist';
  const isAdmin = user?.role === 'admin';
  const [error, setError] = useState('');
  const [selectedStage, setSelectedStage] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [busyLeadId, setBusyLeadId] = useState(null);
  const [view, setView] = useState('board');
  const [specialistQueueView, setSpecialistQueueView] = useState('mine');
  const [activityLead, setActivityLead] = useState(null);
  const [appointmentLead, setAppointmentLead] = useState(null);
  const [stageChange, setStageChange] = useState(null);
  const [stageReport, setStageReport] = useState('');
  const [stageReportError, setStageReportError] = useState('');
  const [historyLead, setHistoryLead] = useState(null);
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: async () => (await API.get('/leads')).data,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });
  const leads = leadsQuery.data || [];
  const { register, reset, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(isSpecialist && editingLead
      ? specialistLeadSchema
      : isAdmin && editingLead
        ? adminLeadSchema
        : leadSchema),
    defaultValues: EMPTY_FORM,
  });
  const {
    register: registerActivity,
    reset: resetActivity,
    handleSubmit: submitActivityForm,
    watch: watchActivity,
    formState: { errors: activityErrors, isSubmitting: activitySubmitting },
  } = useForm({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      type: 'call',
      text: '',
      scheduledAt: '',
      meetingTitle: '',
      meetingUrl: '',
      appointmentType: 'Product Demo',
      scheduledFollowUp: '',
    },
  });

  function openModal(lead = null) {
    setEditingLead(lead);
    reset(lead ? {
      ...EMPTY_FORM,
      clientName: lead.clientName || '',
      clientEmail: lead.clientEmail || '',
      clientPhone: lead.clientPhone || '',
      companyName: lead.centerName || lead.companyName || '',
      centerName: lead.centerName || lead.companyName || '',
      address: lead.address || '',
      townshipRegion: lead.townshipRegion || '',
      registrationStatus: lead.registrationStatus || 'Other',
      principalName: lead.principalName || lead.clientName || '',
      primaryMobile: lead.primaryMobile || lead.clientPhone || '',
      whatsappNumber: lead.whatsappNumber || '',
      emailAddress: lead.emailAddress || lead.clientEmail || '',
      preferredContactMethod: lead.preferredContactMethod || 'whatsapp',
      studentCount: lead.studentCount ?? 0,
      staffCount: lead.staffCount ?? 0,
      currentAdminMethod: lead.currentAdminMethod || 'Other',
      primaryPainPoint: lead.primaryPainPoint || 'Other',
      ownerPersona: lead.ownerPersona || 'overwhelmed_survivor',
      qualificationTier: lead.qualificationTier || 'warm',
      initialEncounterNotes: lead.initialEncounterNotes || lead.notes || '',
      popiaConsentVerbalConfirmed: lead.popiaConsentVerbalConfirmed === true,
      zeroChildrenDataCertified: lead.zeroChildrenDataCertified === true,
      expectedContractValue: lead.expectedContractValue ?? lead.estimatedValue ?? 0,
      conversionProbability: lead.conversionProbability ?? 10,
      notes: lead.notes || '',
    } : EMPTY_FORM);
    setError('');
    setIsModalOpen(true);
  }

  const saveLead = useMutation({
    mutationFn: async (payload) => {
      if (editingLead) {
        return API.put(`/leads/${editingLead._id}`, payload);
      }
      return API.post('/leads', payload);
    },
    onSuccess: async () => {
      setIsModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to save lead.'),
  });

  const stageMutation = useMutation({
    mutationFn: ({ leadId, stage, reportSummary }) => API.put(`/leads/${leadId}`, { pipelineStage: stage, reportSummary }),
    onSuccess: async ({ data }) => {
      if (data.commissionCreditedAt) {
        try {
          const { data: refreshedUser } = await API.get('/auth/profile');
          setUser(refreshedUser);
        } catch {
          setError('The lead and commission were saved, but your displayed balance could not refresh. Reload your profile before requesting a payout.');
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['withdrawal-ledger'] }),
        queryClient.invalidateQueries({ queryKey: ['statement-summary'] }),
      ]);
    },
    onMutate: async ({ leadId, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previousLeads = queryClient.getQueryData(['leads']);
      queryClient.setQueryData(['leads'], (current = []) => current.map((lead) => (
        lead._id === leadId ? { ...lead, pipelineStage: stage } : lead
      )));
      return { previousLeads };
    },
    onError: (err, _variables, context) => {
      if (context?.previousLeads) queryClient.setQueryData(['leads'], context.previousLeads);
      setError(err.response?.data?.message || 'Failed to update lead stage.');
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  });

  const claimMutation = useMutation({
    mutationFn: (leadId) => API.put(`/leads/${leadId}/claim`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: async (err) => {
      setError(err.response?.data?.message || 'Failed to claim this lead.');
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (leadId) => API.delete(`/leads/${leadId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (err) => setError(err.response?.data?.message || 'Failed to delete lead.'),
  });

  const activityMutation = useMutation({
    mutationFn: ({ leadId, activity }) => {
      if (activity.type === 'meeting') {
        return API.post(`/leads/${leadId}/appointments`, {
          title: activity.meetingTitle || 'Consultation meeting',
          appointmentType: activity.appointmentType,
          scheduledFor: activity.scheduledAt,
          meetingLinkOrAddress: activity.meetingUrl || '',
          progressSummary: activity.text,
        });
      }
      return API.post(`/leads/${leadId}/activities`, {
        ...activity,
        scheduledAt: null,
        scheduledFollowUp: activity.scheduledFollowUp || null,
      });
    },
    onSuccess: async () => {
      setActivityLead(null);
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (err) => setError(err.response?.data?.message || 'Failed to log lead activity.'),
  });

  const appointmentMutation = useMutation({
    mutationFn: ({ leadId, appointmentId, status, scheduledFor }) => API.patch(
      `/leads/${leadId}/appointments/${appointmentId}`,
      { status, scheduledFor }
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (err) => setError(err.response?.data?.message || 'Failed to update appointment status.'),
  });

  async function submitLead(values) {
    setError('');
    let payload = isSpecialist
      ? { conversionProbability: values.conversionProbability, notes: values.notes }
      : { ...values, estimatedValue: values.expectedContractValue };
    if (editingLead) {
      payload = Object.fromEntries(Object.entries(payload).filter(([field, value]) => (
        !['popiaConsentVerbalConfirmed', 'zeroChildrenDataCertified'].includes(field) || value === true
      )));
    }
    await saveLead.mutateAsync(payload);
  }

  function requestStageChange(leadId, stage) {
    const currentLead = leads.find((lead) => lead._id === leadId);
    if (!currentLead || getLeadPipelineStage(currentLead) === stage) return;
    setStageChange({ leadId, stage, clientName: currentLead.clientName });
    setStageReport('');
    setStageReportError('');
  }

  async function handleStageChange(leadId, stage, reportSummary) {
    setBusyLeadId(leadId);
    setError('');
    try {
      await stageMutation.mutateAsync({ leadId, stage, reportSummary });
      return true;
    } catch {
      // The mutation reports its error in the page alert.
      return false;
    } finally {
      setBusyLeadId(null);
    }
  }

  async function submitStageChange(event) {
    event.preventDefault();
    const report = stageReport.trim();
    if (report.length < 15) {
      setStageReportError('Please enter a stage report of at least 15 characters.');
      return;
    }
    if (stageChange && await handleStageChange(stageChange.leadId, stageChange.stage, report)) {
      setStageChange(null);
      setStageReport('');
    }
  }

  async function handleClaim(leadId) {
    setBusyLeadId(leadId);
    setError('');
    try {
      await claimMutation.mutateAsync(leadId);
    } catch {
      // The mutation reports its error in the page alert.
    } finally {
      setBusyLeadId(null);
    }

  }

  async function updateAppointmentStatus(leadId, appointmentId, status, scheduledFor) {
    try {
      setError('');
      await appointmentMutation.mutateAsync({ leadId, appointmentId, status, scheduledFor });
    } catch {
      // The mutation reports its error in the page alert.
    }
  }

  async function handleDelete(leadId) {
    if (!window.confirm('Delete this lead?')) return;
    setBusyLeadId(leadId);
    setError('');
    try {
      await deleteMutation.mutateAsync(leadId);
    } catch {
      // The mutation reports its error in the page alert.
    } finally {
      setBusyLeadId(null);
    }
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const queueLeads = isSpecialist
    ? leads.filter((lead) => {
      const assignedToMe = lead.assignedSpecialist?._id === user?._id || lead.assignedSpecialist === user?._id;
      if (specialistQueueView === 'available') return !lead.assignedSpecialist;
      if (specialistQueueView === 'all') return assignedToMe || !lead.assignedSpecialist;
      return assignedToMe;
    })
    : leads;
  const availableLeadCount = isSpecialist ? leads.filter((lead) => !lead.assignedSpecialist).length : 0;
  const assignedLeadCount = isSpecialist ? leads.filter((lead) => (
    lead.assignedSpecialist?._id === user?._id || lead.assignedSpecialist === user?._id
  )).length : 0;
  const filteredLeads = queueLeads.filter((lead) => (
    (selectedStage === 'All' || getLeadPipelineStage(lead) === selectedStage || lead.stage === selectedStage)
    && [lead.clientName, lead.centerName, lead.companyName, lead.townshipRegion, lead.clientEmail, lead.emailAddress]
      .some((field) => (field || '').toLowerCase().includes(normalizedSearch))
  ));

  const pageTitle = isSpecialist ? 'Lead Specialist Work Queue' : isAdmin ? 'Platform Lead Oversight' : 'My Leads Pipeline';
  const pageDescription = isSpecialist
    ? 'Claim an unassigned lead, then manage its progress through to deal closure.'
    : isAdmin
      ? 'Review leads across the platform. Assign specialists from the Master Admin panel.'
      : 'Capture new client opportunities and follow progress with your lead specialist.';

  return (
    <section className="mx-auto max-w-7xl space-y-6 p-2 sm:p-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{pageTitle}</h1>
          <p className="text-sm text-slate-500">{pageDescription}</p>
        </div>
        {isConsultant && (
          <button
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm transition hover:bg-blue-700"
            onClick={() => openModal()}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            Capture New Lead
          </button>
        )}
      </header>

      {(error || leadsQuery.error) && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          <span>{error || leadsQuery.error?.response?.data?.message || 'Failed to load leads.'}</span>
          {leadsQuery.error && <button className="shrink-0 font-medium underline" onClick={() => leadsQuery.refetch()} type="button">Retry</button>}
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row">
        <div aria-label="Filter leads by stage" className="flex w-full items-center gap-1 overflow-x-auto pb-2 md:w-auto md:pb-0" role="group">
          {STAGES.map((stage) => (
            <button
              aria-pressed={selectedStage === stage}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${
                selectedStage === stage ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              key={stage}
              onClick={() => setSelectedStage(stage)}
              type="button"
            >
              {STAGE_LABELS[stage] || stage}
            </button>
          ))}
        </div>
        {isSpecialist && (
          <div className="flex shrink-0 rounded-lg border border-slate-200 p-1" role="group" aria-label="Filter specialist queue">
            {[
              { id: 'mine', label: `My leads (${assignedLeadCount})` },
              { id: 'available', label: `Available (${availableLeadCount})` },
              { id: 'all', label: 'All queue' },
            ].map((option) => (
              <button
                aria-pressed={specialistQueueView === option.id}
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ${specialistQueueView === option.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                key={option.id}
                onClick={() => setSpecialistQueueView(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <label className="relative w-full md:w-64">
          <span className="sr-only">Search leads</span>
          <Search aria-hidden="true" className="absolute left-3 top-3 text-slate-400" size={16} />
          <input
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search leads..."
            type="search"
            value={searchTerm}
          />
        </label>
        <div className="flex rounded-lg border border-slate-200 p-1" role="group" aria-label="Lead view">
          {['board', 'table'].map((mode) => (
            <button
              aria-pressed={view === mode}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${view === mode ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              key={mode}
              onClick={() => setView(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {leadsQuery.isLoading ? (
        <p className="py-12 text-center text-slate-500">Loading leads...</p>
      ) : filteredLeads.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <p className="mb-4 text-slate-500">
            {isSpecialist && specialistQueueView === 'mine' && assignedLeadCount === 0
              ? 'No leads are assigned to you yet. Check the Available queue to claim a lead.'
              : isSpecialist && specialistQueueView === 'available' && availableLeadCount === 0
                ? 'There are no unassigned leads available to claim.'
                : leads.length ? 'No leads match the selected filters.' : isSpecialist ? 'No leads are available in your queue.' : 'No leads found.'}
          </p>
          {isConsultant && (
            <button className="text-sm font-medium text-blue-600 hover:underline" onClick={() => openModal()} type="button">
              + Capture your first lead
            </button>
          )}
        </div>
      ) : view === 'board' ? (
        <DndContext onDragEnd={({ active, over }) => {
          if (!over) return;
          const nextStage = String(over.id).replace(/^stage:/, '');
          const lead = filteredLeads.find((item) => item._id === active.id);
          if (lead && getLeadPipelineStage(lead) !== nextStage) requestStageChange(lead._id, nextStage);
        }}>
          <div className="grid gap-4 overflow-x-auto pb-2 lg:grid-cols-3 2xl:grid-cols-6">
            {[...PIPELINE_STAGES, 'Closed Lost'].map((stage) => (
              <LeadStageColumn
                key={stage}
                stage={stage}
                leads={filteredLeads.filter((lead) => getLeadPipelineStage(lead) === stage || (stage === 'Closed Lost' && lead.stage === stage))}
                canMove={(isAdmin || isSpecialist) && stage !== 'Closed Lost'}
                userId={user?._id}
                role={user?.role}
                isSpecialist={isSpecialist}
                busyLeadId={busyLeadId}
                onClaim={handleClaim}
                onEdit={openModal}
                onActivity={(lead) => {
                  setActivityLead(lead);
                  resetActivity({ type: 'call', text: '', scheduledAt: '', meetingTitle: '', meetingUrl: '', appointmentType: 'Product Demo', scheduledFollowUp: '' });
                }}
                onHistory={setHistoryLead}
                onDelete={handleDelete}
                onAppointmentStatus={updateAppointmentStatus}
              />
            ))}
          </div>
        </DndContext>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="p-4">Client / Company</th>
                  <th className="p-4">Contact Info</th>
                  {(isAdmin || isSpecialist) && <th className="p-4">Sourced by</th>}
                  <th className="p-4">Est. Value</th>
                  <th className="p-4">Win Probability</th>
                  <th className="p-4">Pipeline Stage</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredLeads.map((lead) => {
                  const assignedToMe = lead.assignedSpecialist?._id === user?._id || lead.assignedSpecialist === user?._id;
                  const unassigned = !lead.assignedSpecialist;
                  const canEdit = isAdmin || (isConsultant && unassigned) || (isSpecialist && assignedToMe);
                  const canClaim = isSpecialist && unassigned && lead.pipelineStage !== '5_closed_won_pending_payout' && !['Closed Won', 'Closed Lost'].includes(lead.stage);
                  const canChangeStage = !lead.commissionCreditedAt && (isAdmin || (isSpecialist && assignedToMe));
                  return (
                    <tr className="hover:bg-slate-50/80" key={lead._id}>
                      <td className="p-4">
                        <p className="font-semibold text-slate-800">{lead.principalName || lead.clientName}</p>
                        <p className="text-xs text-slate-500">{lead.centerName || lead.companyName || 'No center listed'}</p>
                        {lead.townshipRegion && <p className="text-xs text-slate-500">{lead.townshipRegion}</p>}
                        {isConsultant && (!lead.popiaConsentVerbalConfirmed || !lead.zeroChildrenDataCertified) && (
                          <p className="mt-1 text-xs font-semibold text-amber-700">Compliance verification required before specialist handoff</p>
                        )}
                        {isSpecialist && lead.assignedSpecialist && (
                          <p className="mt-1 text-xs text-slate-500">
                            {assignedToMe ? 'Assigned to you' : `Assigned to ${lead.assignedSpecialist.name || 'another specialist'}`}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <p className="text-slate-700">{lead.emailAddress || lead.clientEmail || 'No email recorded'}</p>
                        <p className="text-xs text-slate-500">{lead.primaryMobile || lead.clientPhone}</p>
                      </td>
                      {(isAdmin || isSpecialist) && <td className="p-4 text-slate-600">{lead.consultant?.name || '—'}</td>}
                      <td className="p-4 font-medium text-slate-800">
                        R{Number(lead.estimatedValue || 0).toLocaleString('en-ZA')}
                      </td>
                      <td className="p-4 text-slate-600">{lead.conversionProbability ?? 10}%</td>
                      <td className="p-4">
                        {canChangeStage ? (
                          <select
                            aria-label={`Pipeline stage for ${lead.clientName}`}
                            className={`rounded-full border-0 px-3 py-1 text-xs font-semibold focus:ring-2 focus:ring-blue-500 ${STAGE_COLORS[getLeadPipelineStage(lead)] || 'bg-slate-100 text-slate-800'}`}
                            disabled={busyLeadId === lead._id}
                            onChange={(event) => requestStageChange(lead._id, event.target.value)}
                            value={getLeadPipelineStage(lead)}
                          >
                            {PIPELINE_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                          </select>
                        ) : (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STAGE_COLORS[getLeadPipelineStage(lead)] || 'bg-slate-100 text-slate-800'}`}>
                            {STAGE_LABELS[getLeadPipelineStage(lead)] || lead.stage}
                          </span>
                        )}
                      </td>
                      <td className="space-x-2 p-4 text-right">
                        {isSpecialist && assignedToMe && (lead.appointments || []).filter((appointment) => ['scheduled', 'rescheduled'].includes(appointment.status)).map((appointment) => (
                          <AppointmentActions
                            key={appointment._id}
                            appointment={appointment}
                            onChange={(status, scheduledFor) => updateAppointmentStatus(lead._id, appointment._id, status, scheduledFor)}
                          />
                        ))}
                        {canClaim && (
                          <button
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            disabled={busyLeadId === lead._id}
                            onClick={() => handleClaim(lead._id)}
                            type="button"
                          >
                            {busyLeadId === lead._id ? 'Claiming...' : 'Claim lead'}
                          </button>
                        )}
                        {canEdit && (
                          <button
                            aria-label={`Edit ${lead.clientName}`}
                            className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                            onClick={() => openModal(lead)}
                            title="Edit lead"
                            type="button"
                          >
                            <Edit3 aria-hidden="true" size={16} />
                          </button>
                        )}
                        {isSpecialist && assignedToMe && (
                          <button
                            className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                            onClick={() => {
                              setActivityLead(lead);
                              resetActivity({ type: 'call', text: '', scheduledAt: '', meetingTitle: '', meetingUrl: '', appointmentType: 'Product Demo', scheduledFollowUp: '' });
                            }}
                            type="button"
                          >
                            Log touchpoint
                          </button>
                        )}
                        {isConsultant && unassigned && (
                          <button
                            aria-label={`Delete ${lead.clientName}`}
                            className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => handleDelete(lead._id)}
                            title="Delete lead"
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        )}
                        <button
                          className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          onClick={() => setHistoryLead(lead)}
                          type="button"
                        >
                          History
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section aria-labelledby="lead-modal-title" aria-modal="true" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl" role="dialog">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-800" id="lead-modal-title">
                {editingLead ? (isSpecialist ? 'Manage Lead' : 'Edit Lead Details') : 'Capture New Lead'}
              </h2>
              <button aria-label="Close dialog" className="text-slate-400 hover:text-slate-600" onClick={() => setIsModalOpen(false)} type="button">
                <X aria-hidden="true" size={20} />
              </button>
            </header>
            <form className="space-y-4 p-6" onSubmit={handleSubmit(submitLead)}>
              {isSpecialist && editingLead ? (
                <div className="space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
                  <p><span className="font-semibold">Center:</span> {editingLead.centerName || editingLead.companyName}</p>
                  <p><span className="font-semibold">Principal:</span> {editingLead.principalName || editingLead.clientName}</p>
                  <p><span className="font-semibold">Region:</span> {editingLead.townshipRegion || 'Not recorded'}</p>
                  <p><span className="font-semibold">Address:</span> {editingLead.address || 'Not recorded'}</p>
                  <p><span className="font-semibold">Sourced by:</span> {editingLead.consultant?.name || 'Consultant'}</p>
                  <p><span className="font-semibold">Qualification:</span> {editingLead.qualificationTier || 'warm'} · {editingLead.ownerPersona?.replaceAll('_', ' ') || 'Persona not assessed'}</p>
                  <p><span className="font-semibold">Initial encounter:</span> {editingLead.initialEncounterNotes || editingLead.notes || 'No handoff notes'}</p>
                  <p className="text-xs text-slate-500">Source profile and compliance certification are retained as submitted by the consultant.</p>
                </div>
              ) : (
                <>
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold text-slate-800">Center details</legend>
                    <label className="block text-xs font-medium text-slate-700">
                      Center name *
                      <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={255} {...register('centerName')} />
                      {errors.centerName && <span className="mt-1 block text-rose-600">{errors.centerName.message}</span>}
                    </label>
                    <label className="block text-xs font-medium text-slate-700">
                      Street address *
                      <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={1000} rows={2} {...register('address')} />
                      {errors.address && <span className="mt-1 block text-rose-600">{errors.address.message}</span>}
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-700">
                        Township / region *
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={100} {...register('townshipRegion')} />
                        {errors.townshipRegion && <span className="mt-1 block text-rose-600">{errors.townshipRegion.message}</span>}
                      </label>
                      <label className="block text-xs font-medium text-slate-700">
                        Registration status *
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('registrationStatus')}>
                          {['DBE Registered', 'Conditionally Registered', 'Informal', 'Other'].map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                    </div>
                  </fieldset>
                  <fieldset className="space-y-3 border-t border-slate-200 pt-3">
                    <legend className="text-sm font-semibold text-slate-800">Decision maker</legend>
                    <label className="block text-xs font-medium text-slate-700">
                      Principal / decision-maker name *
                      <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={255} {...register('principalName')} />
                      {errors.principalName && <span className="mt-1 block text-rose-600">{errors.principalName.message}</span>}
                    </label>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-700">
                        Primary mobile *
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={20} type="tel" {...register('primaryMobile')} />
                        {errors.primaryMobile && <span className="mt-1 block text-rose-600">{errors.primaryMobile.message}</span>}
                      </label>
                      <label className="block text-xs font-medium text-slate-700">
                        WhatsApp number
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={20} type="tel" {...register('whatsappNumber')} />
                        {errors.whatsappNumber && <span className="mt-1 block text-rose-600">{errors.whatsappNumber.message}</span>}
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-700">
                        Email address (optional)
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={255} type="email" {...register('emailAddress')} />
                        {errors.emailAddress && <span className="mt-1 block text-rose-600">{errors.emailAddress.message}</span>}
                      </label>
                      <label className="block text-xs font-medium text-slate-700">
                        Preferred contact method
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('preferredContactMethod')}>
                          <option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option><option value="in_person">In person</option>
                        </select>
                      </label>
                    </div>
                  </fieldset>
                  <fieldset className="space-y-3 border-t border-slate-200 pt-3">
                    <legend className="text-sm font-semibold text-slate-800">Center qualification</legend>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-700">Student count
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" max="100000" min="0" type="number" {...register('studentCount', { valueAsNumber: true })} />
                        {errors.studentCount && <span className="mt-1 block text-rose-600">{errors.studentCount.message}</span>}
                      </label>
                      <label className="block text-xs font-medium text-slate-700">Staff count
                        <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" max="10000" min="0" type="number" {...register('staffCount', { valueAsNumber: true })} />
                        {errors.staffCount && <span className="mt-1 block text-rose-600">{errors.staffCount.message}</span>}
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-700">Current admin method *
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('currentAdminMethod')}>
                          {['Paper', 'Spreadsheets', 'Informal', 'Software', 'Other'].map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-slate-700">Primary pain point *
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('primaryPainPoint')}>
                          {['Admin Chaos', 'Curriculum Gaps', 'Staff Upskilling', 'Compliance', 'Other'].map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-700">Owner persona
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('ownerPersona')}>
                          <option value="defensive_guard">Defensive guard</option><option value="ambitious_innovator">Ambitious innovator</option><option value="skeptical_veteran">Skeptical veteran</option><option value="overwhelmed_survivor">Overwhelmed survivor</option>
                        </select>
                      </label>
                      <label className="block text-xs font-medium text-slate-700">Lead qualification
                        <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" {...register('qualificationTier')}>
                          <option value="hot">Hot</option><option value="warm">Warm</option><option value="cold">Cold</option>
                        </select>
                      </label>
                    </div>
                    <label className="block text-xs font-medium text-slate-700">Expected contract value (R)
                      <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" disabled={Boolean(editingLead?.commissionCreditedAt)} min="0" step="0.01" type="number" {...register('expectedContractValue')} />
                      {errors.expectedContractValue && <span className="mt-1 block text-rose-600">{errors.expectedContractValue.message}</span>}
                    </label>
                  </fieldset>
                  <label className="block text-xs font-medium text-slate-700">
                    Initial encounter / specialist handoff notes *
                    <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" maxLength={5000} minLength={15} rows={4} {...register('initialEncounterNotes')} />
                    {errors.initialEncounterNotes && <span className="mt-1 block text-rose-600">{errors.initialEncounterNotes.message}</span>}
                  </label>
                  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs font-semibold text-amber-900">Privacy and compliance</p>
                    <label className="flex items-start gap-2 text-xs text-slate-700">
                      <input className="mt-0.5" type="checkbox" {...register('popiaConsentVerbalConfirmed')} />
                      Verbal POPIA consent was obtained from the adult contact for API to follow up.
                    </label>
                    {errors.popiaConsentVerbalConfirmed && <span className="block text-rose-700">{errors.popiaConsentVerbalConfirmed.message}</span>}
                    <label className="flex items-start gap-2 text-xs text-slate-700">
                      <input className="mt-0.5" type="checkbox" {...register('zeroChildrenDataCertified')} />
                      I certify no personal information identifying children is included in this lead.
                    </label>
                    {errors.zeroChildrenDataCertified && <span className="block text-rose-700">{errors.zeroChildrenDataCertified.message}</span>}
                    <p className="text-[11px] text-amber-900">Do not enter children’s names, contact details, health information, photos, or other identifying records.</p>
                  </div>
                </>
              )}
              {isSpecialist && editingLead ? (
                <p className="text-sm text-slate-600">
                  Estimated value: <span className="font-semibold">R{Number(editingLead.estimatedValue || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>. Ask an admin to correct the deal value.
                </p>
              ) : (
                <label className="block text-xs font-medium text-slate-700">
                  Estimated Value (R)
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                    disabled={Boolean(editingLead?.commissionCreditedAt)}
                    min="0"
                    step="0.01"
                    type="number"
                    {...register('expectedContractValue')}
                  />
                  {editingLead?.commissionCreditedAt && <span className="mt-1 block text-xs text-slate-500">Locked after commission credit.</span>}
                  {errors.expectedContractValue && <span className="mt-1 block text-rose-600">{errors.expectedContractValue.message}</span>}
                </label>
              )}
              {editingLead && !isConsultant && (
                <p className="text-sm text-slate-600">
                  Pipeline stage: <span className="font-semibold">{STAGE_LABELS[getLeadPipelineStage(editingLead)]}</span>. Use the board or table stage control to add a required progress report.
                </p>
              )}
              {!isConsultant && (
                <label className="block text-xs font-medium text-slate-700">
                  Conversion probability: {watch('conversionProbability') ?? 10}%
                  <input className="mt-2 w-full accent-blue-600" max="100" min="0" step="5" type="range" {...register('conversionProbability', { valueAsNumber: true })} />
                </label>
              )}
              <label className="block text-xs font-medium text-slate-700">
                Notes / Handoff Details
                <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" rows={4} {...register('notes')} />
              </label>
              <footer className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50" disabled={isSubmitting} onClick={() => setIsModalOpen(false)} type="button">
                  Cancel
                </button>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50" disabled={isSubmitting || saveLead.isPending} type="submit">
                  {isSubmitting || saveLead.isPending ? 'Saving...' : editingLead ? 'Save Changes' : 'Submit Lead'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {stageChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section aria-labelledby="stage-report-title" aria-modal="true" className="w-full max-w-lg rounded-xl bg-white shadow-xl" role="dialog">
            <header className="border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-800" id="stage-report-title">Stage report required</h2>
              <p className="mt-1 text-sm text-slate-500">{stageChange.clientName}: {STAGE_LABELS[stageChange.stage] || stageChange.stage}</p>
            </header>
            <form className="space-y-4 p-6" onSubmit={submitStageChange}>
              <label className="block text-sm font-medium text-slate-700">
                Summarize the client interaction, outcome, and next step
                <textarea
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  maxLength={5000}
                  minLength={15}
                  onChange={(event) => { setStageReport(event.target.value); setStageReportError(''); }}
                  required
                  rows={5}
                  value={stageReport}
                />
              </label>
              <p aria-live="polite" className={`text-xs ${stageReportError ? 'text-rose-600' : 'text-slate-500'}`}>
                {stageReportError || `${stageReport.trim().length}/5000 characters (minimum 15)`}
              </p>
              <footer className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setStageChange(null)} type="button">Cancel</button>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={busyLeadId === stageChange.leadId} type="submit">
                  {busyLeadId === stageChange.leadId ? 'Saving...' : 'Save stage report'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {activityLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <section aria-labelledby="activity-modal-title" aria-modal="true" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl" role="dialog">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800" id="activity-modal-title">Log lead touchpoint</h2>
                <p className="mt-1 text-xs text-slate-500">{activityLead.clientName}</p>
              </div>
              <button aria-label="Close dialog" className="text-slate-400 hover:text-slate-600" onClick={() => setActivityLead(null)} type="button"><X size={20} /></button>
            </header>
            <form
              className="space-y-4 p-6"
              onSubmit={submitActivityForm(async (values) => {
                setError('');
                await activityMutation.mutateAsync({
                  leadId: activityLead._id,
                  activity: { ...values, scheduledAt: values.type === 'meeting' ? values.scheduledAt || null : null },
                });
              })}
            >
              <label className="block text-sm font-medium text-slate-700">
                Touchpoint type
                <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" {...registerActivity('type')}>
                  <option value="call">Call</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                  <option value="note">Note</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Details
                <textarea className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" rows={4} {...registerActivity('text')} />
                {activityErrors.text && <span className="mt-1 block text-rose-600">{activityErrors.text.message}</span>}
              </label>
              {watchActivity('type') === 'meeting' && (
                <>
                  <label className="block text-sm font-medium text-slate-700">
                    Meeting title
                    <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" maxLength={180} {...registerActivity('meetingTitle')} />
                    {activityErrors.meetingTitle && <span className="mt-1 block text-rose-600">{activityErrors.meetingTitle.message}</span>}
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Scheduled date and time *
                    <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="datetime-local" {...registerActivity('scheduledAt')} />
                    {activityErrors.scheduledAt && <span className="mt-1 block text-rose-600">{activityErrors.scheduledAt.message}</span>}
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Appointment type
                    <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" {...registerActivity('appointmentType')}>
                      <option>Product Demo</option><option>Contract Signing</option><option>Onboarding Workshop</option><option>Discovery Meeting</option><option>Other</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Meeting link or physical location <span className="font-normal text-slate-400">(optional)</span>
                    <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" placeholder="https://... or center address" {...registerActivity('meetingUrl')} />
                    {activityErrors.meetingUrl && <span className="mt-1 block text-rose-600">{activityErrors.meetingUrl.message}</span>}
                  </label>
                </>
              )}
              {watchActivity('type') !== 'meeting' && (
                <label className="block text-sm font-medium text-slate-700">
                  Next follow-up <span className="font-normal text-slate-400">(optional)</span>
                  <input className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" type="datetime-local" {...registerActivity('scheduledFollowUp')} />
                </label>
              )}
              <footer className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setActivityLead(null)} type="button">Cancel</button>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={activitySubmitting || activityMutation.isPending} type="submit">
                  {activitySubmitting || activityMutation.isPending ? 'Saving...' : watchActivity('type') === 'meeting' ? 'Schedule appointment' : 'Save touchpoint'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
      {historyLead && (
        <LeadHistoryDialog lead={historyLead} onClose={() => setHistoryLead(null)} />
      )}
    </section>
  );
}

function LeadStageColumn({ stage, leads, canMove, userId, role, busyLeadId, onClaim, onEdit, onActivity, onHistory, onDelete, onAppointmentStatus, isSpecialist }) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${stage}` });
  return (
    <section className={`min-w-64 rounded-xl border p-3 ${isOver ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-slate-100/70'}`}>
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">{STAGE_LABELS[stage] || stage}</h2>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{leads.length}</span>
      </header>
      <div className="min-h-32 space-y-2" ref={setNodeRef}>
        {leads.map((lead) => {
          const assignedToMe = lead.assignedSpecialist?._id === userId || lead.assignedSpecialist === userId;
          const unassigned = !lead.assignedSpecialist;
          const canEdit = role === 'admin' || (role === 'consultant' && unassigned) || (role === 'specialist' && assignedToMe);
          return (
            <LeadBoardCard
              key={lead._id}
              lead={lead}
              isSpecialist={isSpecialist}
              disabled={Boolean(lead.commissionCreditedAt) || !(role === 'admin' || (canMove && role === 'specialist' && assignedToMe)) || busyLeadId === lead._id}
              onEdit={canEdit ? () => onEdit(lead) : null}
              onActivity={role === 'specialist' && assignedToMe ? () => onActivity(lead) : null}
              onHistory={() => onHistory(lead)}
              onClaim={role === 'specialist' && unassigned && !['Closed Won', 'Closed Lost'].includes(lead.stage) ? () => onClaim(lead._id) : null}
              onDelete={role === 'consultant' && unassigned ? () => onDelete(lead._id) : null}
              onAppointmentStatus={role === 'specialist' && assignedToMe
                ? (appointmentId, status) => onAppointmentStatus(lead._id, appointmentId, status)
                : null}
            />
          );
        })}
        {leads.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No leads</p>}
      </div>
    </section>
  );
}

function LeadBoardCard({ lead, disabled, onEdit, onActivity, onHistory, onClaim, onDelete, onAppointmentStatus, isSpecialist }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead._id,
    disabled,
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const stageStartedAt = [...(lead.activityTimeline || [])].reverse()
    .find((activity) => activity.type === 'stage_change')?.createdAt || lead.createdAt;
  const lastActivity = lead.activityTimeline?.[lead.activityTimeline.length - 1];
  return (
    <article
      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${isDragging ? 'z-20 opacity-50' : ''}`}
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{lead.principalName || lead.clientName}</h3>
        <span className="shrink-0 text-xs font-semibold text-emerald-700">R{Number(lead.estimatedValue || 0).toLocaleString('en-ZA')}</span>
      </div>
      <p className="mt-2 text-xs font-medium text-violet-700">Win probability: {lead.conversionProbability ?? 10}%</p>
      <p className="mt-1 truncate text-xs text-slate-500">{lead.centerName || lead.companyName || lead.emailAddress || lead.clientEmail}</p>
      {lead.townshipRegion && <p className="mt-1 text-xs text-slate-500">{lead.townshipRegion}</p>}
      {isSpecialist && <p className="mt-1 text-xs text-slate-600">Sourced by {lead.consultant?.name || 'consultant'}</p>}
      {lead.qualificationTier && <p className="mt-1 text-xs font-medium capitalize text-slate-600">Qualification: {lead.qualificationTier}</p>}
      <p className="mt-2 line-clamp-2 text-xs text-slate-600">{lead.initialEncounterNotes || lead.notes || 'No recent notes'}</p>
      {stageStartedAt && (
        <p className="mt-2 text-[11px] font-medium text-amber-700">
          In stage: {formatElapsed(stageStartedAt)}
        </p>
      )}
      {lastActivity && (
        <p className="mt-2 text-[11px] text-slate-400">
          Latest {lastActivity.type}: {lastActivity.text}
          {lastActivity.scheduledAt && ` · ${new Date(lastActivity.scheduledAt).toLocaleString()}`}
        </p>
      )}
      {lastActivity?.scheduledFollowUp && (
        <p className="mt-1 text-[11px] font-semibold text-amber-700">
          Follow up: {new Date(lastActivity.scheduledFollowUp).toLocaleString()}
        </p>
      )}
      {(lead.appointments || []).filter((appointment) => ['scheduled', 'rescheduled'].includes(appointment.status)).map((appointment) => (
        <div className="mt-2 rounded bg-blue-50 p-2 text-[11px] text-blue-900" key={appointment._id}>
          <p className="font-semibold">{appointment.title} · {appointment.appointmentType}</p>
          <p>{new Date(appointment.scheduledFor).toLocaleString()}</p>
          {appointment.meetingLinkOrAddress && <p className="truncate">{appointment.meetingLinkOrAddress}</p>}
          {onAppointmentStatus && (
            <AppointmentActions
              appointment={appointment}
              onChange={(status, scheduledFor) => onAppointmentStatus(appointment._id, status, scheduledFor)}
            />
          )}
        </div>
      ))}
      {(onEdit || onActivity || onClaim || onDelete || onHistory) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-2">
          {onClaim && <button className="text-xs font-semibold text-blue-700" onClick={onClaim} type="button">Claim lead</button>}
          {onEdit && <button className="text-xs font-semibold text-slate-600" onClick={onEdit} type="button">Open</button>}
          {onActivity && <button className="text-xs font-semibold text-blue-700" onClick={onActivity} type="button">Log touchpoint</button>}
          {onHistory && <button className="text-xs font-semibold text-slate-600" onClick={onHistory} type="button">History</button>}
          {onDelete && <button aria-label={`Delete ${lead.clientName}`} className="ml-auto text-slate-400 hover:text-rose-600" onClick={onDelete} type="button"><Trash2 size={14} /></button>}
        </div>
      )}
    </article>
  );
}

function AppointmentActions({ appointment, onChange }) {
  const [scheduledFor, setScheduledFor] = useState(() => {
    const date = new Date(appointment.scheduledFor);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const minDateTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

  function reschedule(event) {
    event.preventDefault();
    const date = new Date(scheduledFor);
    if (Number.isNaN(date.getTime())) return;
    onChange('rescheduled', date.toISOString());
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-1">
      <div className="flex gap-2">
        <button className="font-semibold text-emerald-700" onClick={() => onChange('completed')} type="button">Mark complete</button>
        <button className="font-semibold text-rose-700" onClick={() => onChange('cancelled')} type="button">Cancel</button>
      </div>
      <form className="flex items-center gap-1" onSubmit={reschedule}>
        <label className="sr-only" htmlFor={`reschedule-${appointment._id}`}>New appointment time</label>
        <input
          className="w-44 rounded border border-blue-200 bg-white px-1.5 py-1 text-[10px] text-slate-700"
          id={`reschedule-${appointment._id}`}
          min={minDateTime}
          onChange={(event) => setScheduledFor(event.target.value)}
          required
          type="datetime-local"
          value={scheduledFor}
        />
        <button className="font-semibold text-blue-700" type="submit">Reschedule</button>
      </form>
    </div>
  );
}

function LeadHistoryDialog({ lead, onClose }) {
  const stageEvents = (lead.stageHistory || []).map((event) => ({
    ...event,
    eventType: 'stage',
    date: event.createdAt,
    title: `${event.fromStage} → ${event.toStage}`,
    detail: event.reportSummary,
    actorName: event.completedBy?.name,
  }));
  const activityEvents = (lead.activityTimeline || []).map((event) => ({
    ...event,
    eventType: event.type,
    date: event.createdAt,
    title: event.type.replaceAll('_', ' '),
    detail: event.text,
    actorName: event.actor?.name,
  }));
  const transferEvents = (lead.transferHistory || []).map((event) => ({
    ...event,
    eventType: 'transfer',
    date: event.changedAt,
    title: 'Lead assignment changed',
    detail: event.reason || 'No reason was recorded.',
    actorName: event.changedBy?.name,
    fromName: event.from?.name || 'Unassigned',
    toName: event.to?.name || 'Unassigned',
  }));
  const appointmentEvents = (lead.appointments || []).map((event) => ({
    ...event,
    eventType: 'appointment',
    date: event.createdAt,
    title: `Appointment ${event.status}`,
    detail: `${event.title} · ${event.appointmentType}`,
    actorName: event.specialist?.name,
    scheduledAt: event.scheduledFor,
  }));
  const events = [...stageEvents, ...activityEvents, ...transferEvents, ...appointmentEvents]
    .sort((first, second) => new Date(second.date) - new Date(first.date));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <section aria-labelledby="lead-history-title" aria-modal="true" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl" role="dialog">
        <header className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800" id="lead-history-title">Lead activity history</h2>
            <p className="text-sm text-slate-500">{lead.clientName}</p>
          </div>
          <button aria-label="Close lead history" className="text-slate-400 hover:text-slate-600" onClick={onClose} type="button"><X size={20} /></button>
        </header>
        <div className="space-y-4 p-6">
          {events.length === 0 ? (
            <p className="text-sm text-slate-500">No activity has been recorded yet.</p>
          ) : events.map((event, index) => (
            <article className="border-l-2 border-blue-200 pl-4" key={`${event._id || event.date}-${index}`}>
              <p className="text-sm font-semibold capitalize text-slate-800">{event.title}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{event.detail}</p>
              {event.eventType === 'transfer' && (
                <p className="mt-1 text-xs text-slate-500">{event.fromName} → {event.toName}</p>
              )}
              {event.meetingTitle && <p className="mt-1 text-xs text-slate-500">Meeting: {event.meetingTitle}</p>}
              {event.scheduledAt && <p className="mt-1 text-xs text-slate-500">Scheduled: {new Date(event.scheduledAt).toLocaleString()}</p>}
              {event.scheduledFollowUp && <p className="mt-1 text-xs font-medium text-amber-700">Follow-up: {new Date(event.scheduledFollowUp).toLocaleString()}</p>}
              {event.eventType === 'appointment' && event.meetingLinkOrAddress && <p className="mt-1 text-xs text-slate-500">{event.meetingLinkOrAddress}</p>}
              {event.meetingUrl && <a className="mt-1 inline-block text-xs font-medium text-blue-700 underline" href={event.meetingUrl} rel="noopener noreferrer" target="_blank">Open Google Meet</a>}
              {event.type === 'meeting' && event.meetingProviderStatus === 'local_only' && <p className="mt-1 text-xs text-amber-700">Saved locally; Google Calendar sync is not configured.</p>}
              {event.type === 'meeting' && event.meetingProviderStatus === 'sync_failed' && <p className="mt-1 text-xs text-amber-700">Google Calendar sync failed; the meeting remains saved locally.</p>}
              <p className="mt-1 text-[11px] text-slate-400">
                {event.actorName || (event.eventType === 'stage' ? 'Team member' : 'Activity')} · {new Date(event.date).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatElapsed(startedAt) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
