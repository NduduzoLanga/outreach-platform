const mongoose = require('mongoose');
const tenantPlugin = require('../security/tenantPlugin');
const { PIPELINE_STAGES, getPipelineStageFromLegacy } = require('../services/leadPipeline');
const { COMMISSION_PACKAGES } = require('../services/commissionPackages');

const OWNER_PERSONAS = [
  'defensive_guard',
  'ambitious_innovator',
  'skeptical_veteran',
  'overwhelmed_survivor',
];
const QUALIFICATION_TIERS = ['hot', 'warm', 'cold'];
const REGISTRATION_STATUSES = ['DBE Registered', 'Conditionally Registered', 'Informal', 'Other'];
const ADMIN_METHODS = ['Paper', 'Spreadsheets', 'Informal', 'Software', 'Other'];
const PAIN_POINTS = [
  'Admin Chaos',
  'Curriculum Gaps',
  'Staff Upskilling',
  'Compliance',
  'Other',
];
const CONTACT_METHODS = ['whatsapp', 'phone', 'email', 'in_person'];

const activitySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['note', 'call', 'email', 'meeting', 'stage_change', 'lead_captured'], required: true },
    text: { type: String, required: true, trim: true },
    scheduledAt: { type: Date, default: null },
    scheduledFollowUp: { type: Date, default: null },
    stageAtTime: { type: String, enum: PIPELINE_STAGES, default: null },
    interactionType: { type: String, enum: ['Call', 'WhatsApp', 'In-Person Meeting', 'Demo', 'Email', 'Note'], default: null },
    meetingTitle: { type: String, default: '', trim: true, maxlength: 180 },
    meetingUrl: { type: String, default: '', trim: true, maxlength: 2048 },
    googleEventId: { type: String, default: '', trim: true, maxlength: 256 },
    meetingProviderStatus: { type: String, enum: ['manual', 'local_only', 'synced', 'sync_failed'], default: 'manual' },
  },
  { timestamps: true }
);

const stageHistorySchema = new mongoose.Schema(
  {
    fromStage: { type: String, enum: ['New', 'Contacted', 'In Progress', 'Proposal Sent', 'Closed Won', 'Closed Lost'], required: true },
    toStage: { type: String, enum: ['New', 'Contacted', 'In Progress', 'Proposal Sent', 'Closed Won', 'Closed Lost'], required: true },
    fromPipelineStage: { type: String, enum: [...PIPELINE_STAGES, null], default: null },
    toPipelineStage: { type: String, enum: [...PIPELINE_STAGES, null], default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reportSummary: { type: String, required: true, trim: true, minlength: 15, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const appointmentSchema = new mongoose.Schema(
  {
    specialist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 255 },
    appointmentType: { type: String, enum: ['Product Demo', 'Contract Signing', 'Onboarding Workshop', 'Discovery Meeting', 'Other'], required: true },
    scheduledFor: { type: Date, required: true },
    meetingLinkOrAddress: { type: String, default: '', trim: true, maxlength: 2048 },
    googleEventId: { type: String, default: '', trim: true, maxlength: 256 },
    providerStatus: { type: String, enum: ['manual', 'local_only', 'synced', 'sync_failed'], default: 'manual' },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'], default: 'scheduled' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const leadSchema = new mongoose.Schema(
  {
    consultant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedSpecialist: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    clientName: { type: String, required: true, trim: true, maxlength: 255 },
    clientEmail: { type: String, default: '', trim: true, lowercase: true, maxlength: 254, match: /^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    clientPhone: { type: String, required: true, trim: true, maxlength: 32, match: /^[+()\d\s.-]+$/ },
    companyName: { type: String, default: '', trim: true, maxlength: 255 },
    centerName: { type: String, default: '', trim: true, maxlength: 255 },
    address: { type: String, default: '', trim: true, maxlength: 1000 },
    townshipRegion: { type: String, default: '', trim: true, maxlength: 100 },
    registrationStatus: { type: String, enum: REGISTRATION_STATUSES, default: 'Other' },
    principalName: { type: String, default: '', trim: true, maxlength: 255 },
    primaryMobile: { type: String, default: '', trim: true, maxlength: 20 },
    whatsappNumber: { type: String, default: '', trim: true, maxlength: 20 },
    emailAddress: { type: String, default: '', trim: true, lowercase: true, maxlength: 254, match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'] },
    preferredContactMethod: { type: String, enum: CONTACT_METHODS, default: 'whatsapp' },
    studentCount: { type: Number, default: 0, min: 0, max: 100000, validate: Number.isInteger },
    staffCount: { type: Number, default: 0, min: 0, max: 10000, validate: Number.isInteger },
    currentAdminMethod: { type: String, enum: ADMIN_METHODS, default: 'Other' },
    primaryPainPoint: { type: String, enum: PAIN_POINTS, default: 'Other' },
    ownerPersona: { type: String, enum: OWNER_PERSONAS, default: 'overwhelmed_survivor' },
    qualificationTier: { type: String, enum: QUALIFICATION_TIERS, default: 'warm' },
    initialEncounterNotes: { type: String, default: '', trim: true, maxlength: 5000 },
    popiaConsentVerbalConfirmed: { type: Boolean, default: false },
    popiaConsentConfirmedAt: { type: Date, default: null },
    popiaConsentConfirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    zeroChildrenDataCertified: { type: Boolean, default: false },
    childrenDataCertifiedAt: { type: Date, default: null },
    childrenDataCertifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    estimatedValue: { type: Number, default: 0, min: 0 },
    expectedContractValue: { type: Number, default: 0, min: 0 },
    commissionRate: { type: Number, default: 10, min: 0, max: 100 },
    commissionEarned: { type: Number, default: 0, min: 0 },
    commissionCreditedAt: { type: Date, default: null },
    dealPackage: { type: String, enum: ['', ...Object.keys(COMMISSION_PACKAGES)], default: '' },
    customCommissionAmount: { type: Number, default: null, min: 1500, max: 3000 },
    conversionProbability: { type: Number, default: 10, min: 0, max: 100 },
    stage: {
      type: String,
      enum: ['New', 'Contacted', 'In Progress', 'Proposal Sent', 'Closed Won', 'Closed Lost'],
      default: 'New',
    },
    pipelineStage: {
      type: String,
      enum: PIPELINE_STAGES,
      default() {
        return getPipelineStageFromLegacy(this.stage);
      },
    },
    claimedAt: { type: Date, default: null },
    commissionAmountAllocated: { type: Number, default: 0, min: 0 },
    isCommissionPaid: { type: Boolean, default: false },
    closedAt: { type: Date, default: null },
    notes: { type: String, default: '', maxlength: 5000 },
    activityTimeline: { type: [activitySchema], default: [] },
    appointments: { type: [appointmentSchema], default: [] },
    stageHistory: { type: [stageHistorySchema], default: [] },
    transferHistory: [{
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      reason: { type: String, default: '' },
      changedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

leadSchema.plugin(tenantPlugin);
leadSchema.index({ tenantId: 1, consultant: 1, createdAt: -1 });
leadSchema.index({ tenantId: 1, assignedSpecialist: 1, stage: 1 });
leadSchema.index({ tenantId: 1, pipelineStage: 1, qualificationTier: 1, createdAt: -1 });
leadSchema.index({ tenantId: 1, 'appointments.scheduledFor': 1 });

module.exports = mongoose.model('Lead', leadSchema);
