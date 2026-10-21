const PIPELINE_STAGES = [
  '1_new_unclaimed',
  '2_specialist_contacted',
  '3_demo_meeting_scheduled',
  '4_proposal_negotiation',
  '5_closed_won_pending_payout',
];

const LEGACY_STAGE_BY_PIPELINE = {
  '1_new_unclaimed': 'New',
  '2_specialist_contacted': 'Contacted',
  '3_demo_meeting_scheduled': 'In Progress',
  '4_proposal_negotiation': 'Proposal Sent',
  '5_closed_won_pending_payout': 'Closed Won',
};

const PIPELINE_STAGE_BY_LEGACY = {
  New: '1_new_unclaimed',
  Contacted: '2_specialist_contacted',
  'In Progress': '3_demo_meeting_scheduled',
  'Proposal Sent': '4_proposal_negotiation',
  'Closed Won': '5_closed_won_pending_payout',
  'Closed Lost': '4_proposal_negotiation',
};

const PIPELINE_STAGE_LABELS = {
  '1_new_unclaimed': '1 · New / Unclaimed',
  '2_specialist_contacted': '2 · Specialist Contacted',
  '3_demo_meeting_scheduled': '3 · Demo / Meeting Scheduled',
  '4_proposal_negotiation': '4 · Proposal / Negotiation',
  '5_closed_won_pending_payout': '5 · Closed Won / Payout Pending',
};

function getPipelineStageFromLegacy(stage) {
  return PIPELINE_STAGE_BY_LEGACY[stage] || PIPELINE_STAGES[0];
}

function getLegacyStageFromPipeline(pipelineStage) {
  return LEGACY_STAGE_BY_PIPELINE[pipelineStage];
}

module.exports = {
  PIPELINE_STAGES,
  PIPELINE_STAGE_BY_LEGACY,
  PIPELINE_STAGE_LABELS,
  getPipelineStageFromLegacy,
  getLegacyStageFromPipeline,
};
