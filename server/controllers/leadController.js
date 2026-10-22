const mongoose = require('mongoose');
const Lead = require('../models/Lead');
const User = require('../models/User');
const LedgerEntry = require('../models/LedgerEntry');
const { applyLeadRLS } = require('../middleware/roleMiddleware');
const { runInTransaction } = require('../services/transactionService');
const { writeAuditLog } = require('../services/auditService');
const { respondWithControllerError } = require('../middleware/controllerError');
const { toCurrency } = require('../services/money');
const { calculatePackageCommission } = require('../services/commissionPackages');
const { createGoogleMeetEvent, updateGoogleMeetEvent } = require('../services/googleCalendarService');
const {
  PIPELINE_STAGES,
  getLegacyStageFromPipeline,
  getPipelineStageFromLegacy,
} = require('../services/leadPipeline');

const LEAD_TEXT_LIMITS = {
  centerName: 255,
  address: 1000,
  townshipRegion: 100,
  registrationStatus: 100,
  principalName: 255,
  primaryMobile: 20,
  whatsappNumber: 20,
  emailAddress: 254,
  currentAdminMethod: 100,
  primaryPainPoint: 255,
  initialEncounterNotes: 5000,
};

function validateNewLead(input) {
  const requiredFields = [
    'centerName',
    'address',
    'townshipRegion',
    'registrationStatus',
    'principalName',
    'primaryMobile',
    'currentAdminMethod',
    'primaryPainPoint',
    'ownerPersona',
    'initialEncounterNotes',
  ];
  for (const field of requiredFields) {
    if (typeof input[field] !== 'string' || !input[field].trim()) {
      return `${field} is required.`;
    }
    if (LEAD_TEXT_LIMITS[field] && input[field].length > LEAD_TEXT_LIMITS[field]) {
      return `${field} exceeds the allowed length.`;
    }
  }
  for (const [field, schemaPath] of [
    ['registrationStatus', 'registrationStatus'],
    ['currentAdminMethod', 'currentAdminMethod'],
    ['primaryPainPoint', 'primaryPainPoint'],
    ['ownerPersona', 'ownerPersona'],
    ['qualificationTier', 'qualificationTier'],
    ['preferredContactMethod', 'preferredContactMethod'],
  ]) {
    if (input[field] !== undefined && !Lead.schema.path(schemaPath).enumValues.includes(input[field])) {
      return `Choose a valid ${field}.`;
    }
  }
  if (input.popiaConsentVerbalConfirmed !== true) {
    return 'Confirm that verbal POPIA consent was obtained before submitting this lead.';
  }
  if (input.zeroChildrenDataCertified !== true) {
    return 'Certify that no information identifying children is included.';
  }
  for (const field of ['studentCount', 'staffCount']) {
    if (input[field] !== undefined && (!Number.isInteger(Number(input[field])) || Number(input[field]) < 0)) {
      return `${field} must be a non-negative whole number.`;
    }
  }
  if (input.emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.emailAddress.trim())) {
    return 'Enter a valid email address or leave it blank.';
  }
  for (const field of ['primaryMobile', 'whatsappNumber']) {
    if (input[field] && (input[field].trim().length < 7 || !/^[+()\d\s.-]+$/.test(input[field].trim()))) {
      return `${field} must be a valid phone number.`;
    }
  }
  return null;
}

function stageForPipeline(pipelineStage) {
  if (!PIPELINE_STAGES.includes(pipelineStage)) return null;
  return getLegacyStageFromPipeline(pipelineStage);
}

async function lockSpecialistAccount(req, session) {
  if (req.user.role !== 'specialist') return;
  const specialist = await User.findOneAndUpdate(
    { _id: req.user._id, role: 'specialist' },
    { $inc: { assignmentVersion: 1 } },
    { new: true, session }
  ).select('_id');
  if (!specialist) {
    const error = new Error('Your specialist access is no longer active.');
    error.statusCode = 403;
    throw error;
  }
}

const createLead = async (req, res) => {
  try {
    const input = req.body;
    const validationMessage = validateNewLead(input);
    if (validationMessage) return res.status(400).json({ message: validationMessage });

    const clientEmail = input.emailAddress?.trim().toLowerCase() || '';
    const parsedValue = Number(input.expectedContractValue ?? input.estimatedValue ?? 0);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      return res.status(400).json({ message: 'Expected contract value must be a non-negative number.' });
    }

    const lead = await runInTransaction(async (session) => {
      const [createdLead] = await Lead.create([{
        consultant: req.user._id,
        clientName: input.principalName.trim(),
        principalName: input.principalName.trim(),
        clientEmail,
        emailAddress: clientEmail,
        clientPhone: input.primaryMobile.trim(),
        primaryMobile: input.primaryMobile.trim(),
        whatsappNumber: input.whatsappNumber?.trim() || '',
        preferredContactMethod: input.preferredContactMethod || 'whatsapp',
        companyName: input.centerName.trim(),
        centerName: input.centerName.trim(),
        address: input.address.trim(),
        townshipRegion: input.townshipRegion.trim(),
        registrationStatus: input.registrationStatus,
        studentCount: Number(input.studentCount || 0),
        staffCount: Number(input.staffCount || 0),
        currentAdminMethod: input.currentAdminMethod,
        primaryPainPoint: input.primaryPainPoint,
        ownerPersona: input.ownerPersona,
        qualificationTier: input.qualificationTier || 'warm',
        initialEncounterNotes: input.initialEncounterNotes.trim(),
        popiaConsentVerbalConfirmed: true,
        popiaConsentConfirmedAt: new Date(),
        popiaConsentConfirmedBy: req.user._id,
        zeroChildrenDataCertified: true,
        childrenDataCertifiedAt: new Date(),
        childrenDataCertifiedBy: req.user._id,
        estimatedValue: parsedValue,
        expectedContractValue: parsedValue,
        pipelineStage: '1_new_unclaimed',
        stage: 'New',
        notes: input.initialEncounterNotes.trim(),
        activityTimeline: [{
          actor: req.user._id,
          type: 'lead_captured',
          interactionType: 'In-Person Meeting',
          stageAtTime: '1_new_unclaimed',
          text: input.initialEncounterNotes.trim(),
        }],
      }], { session });

      await writeAuditLog({
        req,
        action: 'lead.created',
        resourceType: 'Lead',
        resourceId: createdLead._id,
        after: {
          consultant: req.user._id,
          stage: createdLead.stage,
          pipelineStage: createdLead.pipelineStage,
          conversionProbability: createdLead.conversionProbability,
          clientName: createdLead.clientName,
          popiaConsentVerbalConfirmed: createdLead.popiaConsentVerbalConfirmed,
          zeroChildrenDataCertified: createdLead.zeroChildrenDataCertified,
        },
        session,
      });
      return createdLead;
    });
    return res.status(201).json(lead);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const getMyLeads = async (req, res) => {
  try {
    const leads = await Lead.find(applyLeadRLS(req))
      .populate('consultant', 'name email')
      .populate('assignedSpecialist', 'name email')
      .populate('activityTimeline.actor', 'name email')
      .populate('appointments.specialist', 'name email')
      .populate('stageHistory.completedBy', 'name email')
      .populate('transferHistory.from', 'name email')
      .populate('transferHistory.to', 'name email')
      .populate('transferHistory.changedBy', 'name email')
      .sort({ createdAt: -1 });
    return res.json(leads);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const updateLead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lead ID' });
    }

    const updatedLead = await runInTransaction(async (session) => {
      await lockSpecialistAccount(req, session);
      const lead = await Lead.findById(req.params.id).session(session);
      if (!lead) {
        const error = new Error('Lead not found');
        error.statusCode = 404;
        throw error;
      }
      if (req.user.role === 'consultant' && lead.consultant.toString() !== req.user._id.toString()) {
        const error = new Error('Not authorized to update this lead');
        error.statusCode = 403;
        throw error;
      }
      if (req.user.role === 'consultant' && lead.assignedSpecialist) {
        const error = new Error('This lead is assigned and can no longer be edited by the consultant.');
        error.statusCode = 403;
        throw error;
      }
      if (req.user.role === 'specialist' && lead.assignedSpecialist?.toString() !== req.user._id.toString()) {
        const error = new Error('Claim this lead before updating it.');
        error.statusCode = 403;
        throw error;
      }
      if (
        lead.commissionCreditedAt
        && (req.body.stage !== undefined && req.body.stage !== lead.stage
          || req.body.estimatedValue !== undefined && Number(req.body.estimatedValue) !== lead.estimatedValue)
      ) {
        const error = new Error('A commission-credited won deal cannot have its stage or value changed.');
        error.statusCode = 409;
        throw error;
      }
      if (
        req.user.role === 'specialist'
        && req.body.estimatedValue !== undefined
        && Number(req.body.estimatedValue) !== lead.estimatedValue
      ) {
        const error = new Error('Only the consultant before assignment or an admin may change the lead value.');
        error.statusCode = 403;
        throw error;
      }

      const previous = {
        stage: lead.stage,
        pipelineStage: lead.pipelineStage || '1_new_unclaimed',
        popiaConsentVerbalConfirmed: lead.popiaConsentVerbalConfirmed,
        zeroChildrenDataCertified: lead.zeroChildrenDataCertified,
        clientName: lead.clientName,
        clientEmail: lead.clientEmail,
        clientPhone: lead.clientPhone,
        companyName: lead.companyName,
        estimatedValue: lead.estimatedValue,
        conversionProbability: lead.conversionProbability,
        notes: lead.notes,
        dealPackage: lead.dealPackage,
        customCommissionAmount: lead.customCommissionAmount,
      };
      const {
        clientName,
        clientEmail,
        clientPhone,
        companyName,
        estimatedValue,
        conversionProbability,
        stage,
        pipelineStage,
        notes,
        reportSummary,
        dealPackage,
        customCommissionAmount,
      } = req.body;
      const stageFields = ['stage', 'pipelineStage', 'reportSummary', 'conversionProbability', 'notes', 'dealPackage', 'customCommissionAmount'];
      if (req.user.role === 'specialist') {
        const forbiddenFields = Object.keys(req.body).filter((field) => !stageFields.includes(field));
        if (forbiddenFields.length) {
          const error = new Error('Specialists may update pipeline progress and notes, but not the consultant-captured lead profile.');
          error.statusCode = 403;
          throw error;
        }
      }
      if (
        (clientName !== undefined && typeof clientName !== 'string')
        || (clientEmail !== undefined && typeof clientEmail !== 'string')
        || (clientPhone !== undefined && typeof clientPhone !== 'string')
        || (companyName !== undefined && typeof companyName !== 'string')
        || (notes !== undefined && typeof notes !== 'string')
      ) {
        const error = new Error('Lead fields must use the expected text formats.');
        error.statusCode = 400;
        throw error;
      }
      const profileTextLimits = {
        ...LEAD_TEXT_LIMITS,
        emailAddress: 254,
      };
      const profileEnumFields = [
        'registrationStatus',
        'preferredContactMethod',
        'currentAdminMethod',
        'primaryPainPoint',
        'ownerPersona',
        'qualificationTier',
      ];
      for (const [field, limit] of Object.entries(profileTextLimits)) {
        if (req.body[field] !== undefined && (typeof req.body[field] !== 'string' || req.body[field].length > limit)) {
          const error = new Error(`${field} must be text of at most ${limit} characters.`);
          error.statusCode = 400;
          throw error;
        }
      }
      for (const field of profileEnumFields) {
        if (req.body[field] !== undefined && !Lead.schema.path(field).enumValues.includes(req.body[field])) {
          const error = new Error(`Choose a valid ${field}.`);
          error.statusCode = 400;
          throw error;
        }
      }
      for (const field of ['studentCount', 'staffCount']) {
        if (req.body[field] !== undefined && (!Number.isInteger(Number(req.body[field])) || Number(req.body[field]) < 0)) {
          const error = new Error(`${field} must be a non-negative whole number.`);
          error.statusCode = 400;
          throw error;
        }
      }
      if (req.body.emailAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.emailAddress.trim())) {
        const error = new Error('Enter a valid email address or leave it blank.');
        error.statusCode = 400;
        throw error;
      }
      for (const field of ['primaryMobile', 'whatsappNumber']) {
        if (req.body[field] && !/^[+()\d\s.-]+$/.test(req.body[field].trim())) {
          const error = new Error(`${field} must be a valid phone number.`);
          error.statusCode = 400;
          throw error;
        }
      }
      if (req.body.popiaConsentVerbalConfirmed !== undefined && req.body.popiaConsentVerbalConfirmed !== true) {
        const error = new Error('Verbal POPIA consent cannot be removed from a submitted lead.');
        error.statusCode = 400;
        throw error;
      }
      if (req.body.zeroChildrenDataCertified !== undefined && req.body.zeroChildrenDataCertified !== true) {
        const error = new Error('A lead cannot include information identifying children.');
        error.statusCode = 400;
        throw error;
      }
      if (req.body.popiaConsentVerbalConfirmed === true && lead.popiaConsentVerbalConfirmed !== true) {
        lead.popiaConsentVerbalConfirmed = true;
        lead.popiaConsentConfirmedAt = new Date();
        lead.popiaConsentConfirmedBy = req.user._id;
      }
      if (req.body.zeroChildrenDataCertified === true && lead.zeroChildrenDataCertified !== true) {
        lead.zeroChildrenDataCertified = true;
        lead.childrenDataCertifiedAt = new Date();
        lead.childrenDataCertifiedBy = req.user._id;
      }
      if (
        (clientName !== undefined && clientName.length > 160)
        || (clientEmail !== undefined && clientEmail.length > 254)
        || (clientPhone !== undefined && clientPhone.length > 32)
        || (companyName !== undefined && companyName.length > 160)
        || (notes !== undefined && notes.length > 5000)
      ) {
        const error = new Error('One or more lead fields exceed the allowed length.');
        error.statusCode = 400;
        throw error;
      }
      if (estimatedValue !== undefined && (!Number.isFinite(Number(estimatedValue)) || Number(estimatedValue) < 0)) {
        const error = new Error('Estimated value must be a non-negative number.');
        error.statusCode = 400;
        throw error;
      }
      if (
        conversionProbability !== undefined
        && (!Number.isInteger(Number(conversionProbability)) || Number(conversionProbability) < 0 || Number(conversionProbability) > 100)
      ) {
        const error = new Error('Conversion probability must be a whole number between 0 and 100.');
        error.statusCode = 400;
        throw error;
      }
      if (clientName !== undefined) lead.clientName = clientName;
      if (clientEmail !== undefined) lead.clientEmail = clientEmail;
      if (clientPhone !== undefined) lead.clientPhone = clientPhone;
      if (companyName !== undefined) lead.companyName = companyName;
      const profileFields = [
        'address',
        'townshipRegion',
        'registrationStatus',
        'whatsappNumber',
        'preferredContactMethod',
        'studentCount',
        'staffCount',
        'currentAdminMethod',
        'primaryPainPoint',
        'ownerPersona',
        'qualificationTier',
        'initialEncounterNotes',
      ];
      for (const field of profileFields) {
        if (req.body[field] !== undefined) lead[field] = typeof req.body[field] === 'string' ? req.body[field].trim() : Number(req.body[field]);
      }
      if (req.body.centerName !== undefined) {
        lead.centerName = req.body.centerName.trim();
        lead.companyName = lead.centerName;
      } else if (companyName !== undefined) {
        lead.centerName = companyName.trim();
      }
      if (req.body.principalName !== undefined) {
        lead.principalName = req.body.principalName.trim();
        lead.clientName = lead.principalName;
      } else if (clientName !== undefined) {
        lead.principalName = clientName.trim();
      }
      if (req.body.primaryMobile !== undefined) {
        lead.primaryMobile = req.body.primaryMobile.trim();
        lead.clientPhone = lead.primaryMobile;
      } else if (clientPhone !== undefined) {
        lead.primaryMobile = clientPhone.trim();
      }
      if (req.body.emailAddress !== undefined) {
        lead.emailAddress = req.body.emailAddress.trim().toLowerCase();
        lead.clientEmail = lead.emailAddress;
      } else if (clientEmail !== undefined) {
        lead.emailAddress = clientEmail.trim().toLowerCase();
      }
      if (estimatedValue !== undefined) {
        lead.estimatedValue = estimatedValue;
        lead.expectedContractValue = estimatedValue;
      }
      if (conversionProbability !== undefined && req.user.role !== 'consultant') {
        lead.conversionProbability = conversionProbability;
      }
      if (dealPackage !== undefined) lead.dealPackage = dealPackage;
      if (customCommissionAmount !== undefined) lead.customCommissionAmount = Number(customCommissionAmount);
      if (notes !== undefined) lead.notes = notes;
      const requestedPipelineStage = pipelineStage !== undefined
        ? pipelineStage
        : stage !== undefined && req.user.role !== 'consultant'
          ? (Lead.schema.path('stage').enumValues.includes(stage) ? null : stage)
          : null;
      if (requestedPipelineStage) {
        const mappedStage = stageForPipeline(requestedPipelineStage);
        if (!mappedStage) {
          const error = new Error('Choose a valid pipeline stage.');
          error.statusCode = 400;
          throw error;
        }
        if (req.user.role !== 'consultant') {
          if (req.user.role === 'specialist') {
            const currentIndex = PIPELINE_STAGES.indexOf(previous.pipelineStage);
            const requestedIndex = PIPELINE_STAGES.indexOf(requestedPipelineStage);
            if (requestedIndex !== currentIndex + 1) {
              const error = new Error('Specialists must progress the lead one pipeline step at a time.');
              error.statusCode = 409;
              throw error;
            }
            if (
              requestedPipelineStage === '3_demo_meeting_scheduled'
              && !lead.appointments.some((appointment) => ['scheduled', 'rescheduled'].includes(appointment.status))
            ) {
              const error = new Error('Schedule a demo or meeting before moving the lead into stage 3.');
              error.statusCode = 409;
              throw error;
            }
          }
          lead.pipelineStage = requestedPipelineStage;
          lead.stage = mappedStage;
        }
      } else if (stage !== undefined && req.user.role !== 'consultant') {
        if (!Lead.schema.path('stage').enumValues.includes(stage)) {
          const error = new Error('Choose a valid pipeline stage.');
          error.statusCode = 400;
          throw error;
        }
        if (req.user.role === 'specialist') {
          const nextPipelineStage = getPipelineStageFromLegacy(stage);
          const currentIndex = PIPELINE_STAGES.indexOf(previous.pipelineStage);
          const requestedIndex = PIPELINE_STAGES.indexOf(nextPipelineStage);
          if (requestedIndex !== currentIndex + 1) {
            const error = new Error('Specialists must progress the lead one pipeline step at a time.');
            error.statusCode = 409;
            throw error;
          }
          if (
            nextPipelineStage === '3_demo_meeting_scheduled'
            && !lead.appointments.some((appointment) => ['scheduled', 'rescheduled'].includes(appointment.status))
          ) {
            const error = new Error('Schedule a demo or meeting before moving the lead into stage 3.');
            error.statusCode = 409;
            throw error;
          }
        }
        lead.stage = stage;
        lead.pipelineStage = getPipelineStageFromLegacy(stage);
      }

      const isClosingDeal = lead.pipelineStage === '5_closed_won_pending_payout'
        && previous.pipelineStage !== '5_closed_won_pending_payout';
      let selectedCommission;
      if (isClosingDeal) {
        try {
          selectedCommission = calculatePackageCommission(lead.dealPackage, lead.customCommissionAmount);
        } catch (error) {
          error.statusCode = 400;
          throw error;
        }
      }
      if (lead.stage !== previous.stage || lead.pipelineStage !== previous.pipelineStage) {
        if (typeof reportSummary !== 'string' || reportSummary.trim().length < 15 || reportSummary.trim().length > 5000) {
          const error = new Error('A stage report of at least 15 characters is required to progress a lead.');
          error.statusCode = 400;
          throw error;
        }
        lead.stageHistory.push({
          fromStage: previous.stage,
          toStage: lead.stage,
          fromPipelineStage: previous.pipelineStage,
          toPipelineStage: lead.pipelineStage,
          completedBy: req.user._id,
          reportSummary: reportSummary.trim(),
        });
        lead.activityTimeline.push({
          actor: req.user._id,
          type: 'stage_change',
          stageAtTime: lead.pipelineStage,
          text: `Stage changed from ${previous.pipelineStage} to ${lead.pipelineStage}. ${reportSummary.trim()}`,
        });
      }
      if (typeof notes === 'string' && notes !== previous.notes && notes.trim()) {
        lead.activityTimeline.push({
          actor: req.user._id,
          type: 'note',
          stageAtTime: lead.pipelineStage,
          text: notes.trim(),
        });
      }

      await lead.save({ session });
      if (isClosingDeal && !lead.commissionCreditedAt) {
        const commission = selectedCommission.amount;
        lead.commissionEarned = commission;
        lead.commissionAmountAllocated = commission;
        lead.commissionCreditedAt = new Date();
        lead.closedAt = new Date();
        await lead.save({ session });

        if (commission > 0) {
          const consultant = await User.findOneAndUpdate(
            { _id: lead.consultant },
            { $inc: { balance: commission } },
            { new: true, session }
          );
          if (!consultant) {
            const error = new Error('The lead owner could not be found to credit commission.');
            error.statusCode = 409;
            throw error;
          }
          const balanceBefore = toCurrency(consultant.balance - commission);
          consultant.balance = toCurrency(consultant.balance);
          await consultant.save({ session });
          await LedgerEntry.create([{
            consultant: consultant._id,
            lead: lead._id,
            actor: req.user._id,
            type: 'commission_earned',
            amount: commission,
            availableBalanceBefore: balanceBefore,
            availableBalanceAfter: consultant.balance,
          }], { session });
          await writeAuditLog({
            req,
            action: 'lead.commission_credited',
            resourceType: 'Lead',
            resourceId: lead._id,
            before: { consultantBalance: balanceBefore, commissionEarned: 0 },
            after: {
              consultantBalance: consultant.balance,
              commissionEarned: commission,
              dealPackage: selectedCommission.packageKey,
              packageLabel: selectedCommission.packageLabel,
            },
            session,
          });
        }
      }
      await writeAuditLog({
        req,
        action: 'lead.updated',
        resourceType: 'Lead',
        resourceId: lead._id,
        before: previous,
        after: {
          stage: lead.stage,
          pipelineStage: lead.pipelineStage,
          clientName: lead.clientName,
          clientEmail: lead.clientEmail,
          companyName: lead.companyName,
          estimatedValue: lead.estimatedValue,
          conversionProbability: lead.conversionProbability,
          notes: lead.notes,
          dealPackage: lead.dealPackage,
          customCommissionAmount: lead.customCommissionAmount,
          popiaConsentVerbalConfirmed: lead.popiaConsentVerbalConfirmed,
          popiaConsentConfirmedAt: lead.popiaConsentConfirmedAt,
          zeroChildrenDataCertified: lead.zeroChildrenDataCertified,
          childrenDataCertifiedAt: lead.childrenDataCertifiedAt,
        },
        session,
      });
      return lead;
    });
    return res.json(updatedLead);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const deleteLead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lead ID' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    if (req.user.role !== 'consultant' || lead.consultant.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this lead' });
    }
    if (lead.assignedSpecialist) {
      return res.status(409).json({ message: 'An assigned lead cannot be deleted.' });
    }

    await runInTransaction(async (session) => {
      await writeAuditLog({
        req,
        action: 'lead.deleted',
        resourceType: 'Lead',
        resourceId: lead._id,
        before: { consultant: lead.consultant, clientName: lead.clientName, stage: lead.stage },
        session,
      });
      await lead.deleteOne({ session });
    });
    return res.json({ message: 'Lead removed successfully' });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const claimLead = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lead ID' });
    }

    const lead = await runInTransaction(async (session) => {
      await lockSpecialistAccount(req, session);
      const currentLead = await Lead.findById(req.params.id).session(session);
      if (!currentLead || currentLead.assignedSpecialist) return null;
      if (!currentLead.popiaConsentVerbalConfirmed || !currentLead.zeroChildrenDataCertified) {
        const error = new Error('This lead is missing its POPIA consent or no-children-data certification. Ask the originating consultant to verify compliance before claiming it.');
        error.statusCode = 409;
        throw error;
      }
      if (['Closed Won', 'Closed Lost'].includes(currentLead.stage)) {
        const error = new Error('Closed leads cannot be claimed from the work queue.');
        error.statusCode = 409;
        throw error;
      }
      const previousStage = currentLead.stage;
      const previousPipelineStage = currentLead.pipelineStage || '1_new_unclaimed';
      const nextStage = previousStage === 'New' ? 'Contacted' : previousStage;
      const claimedLead = await Lead.findOneAndUpdate(
        { _id: req.params.id, assignedSpecialist: null, stage: previousStage, pipelineStage: previousPipelineStage },
        {
          $set: {
            assignedSpecialist: req.user._id,
            claimedAt: new Date(),
            stage: nextStage,
            pipelineStage: '2_specialist_contacted',
            ...(previousStage === 'New' ? { conversionProbability: 25 } : {}),
          },
          $push: {
            transferHistory: { from: null, to: req.user._id, changedBy: req.user._id, reason: 'Claimed by specialist' },
            activityTimeline: { actor: req.user._id, type: 'stage_change', stageAtTime: '2_specialist_contacted', text: `Lead claimed by ${req.user.name}.` },
            ...(previousPipelineStage !== '2_specialist_contacted' ? {
              stageHistory: {
                fromStage: previousStage,
                toStage: nextStage,
                fromPipelineStage: previousPipelineStage,
                toPipelineStage: '2_specialist_contacted',
                completedBy: req.user._id,
                reportSummary: `Lead claimed from the shared queue by ${req.user.name}.`,
              },
            } : {}),
          },
        },
        { new: true, runValidators: true, session }
      );
      if (!claimedLead) return null;
      await writeAuditLog({
        req,
        action: 'lead.specialist_claimed',
        resourceType: 'Lead',
        resourceId: claimedLead._id,
        before: { assignedSpecialist: null, stage: previousStage },
        after: { assignedSpecialist: req.user._id, stage: claimedLead.stage, pipelineStage: claimedLead.pipelineStage, claimedAt: claimedLead.claimedAt },
        session,
      });
      return Lead.populate(claimedLead, [
        { path: 'consultant', select: 'name email' },
        { path: 'assignedSpecialist', select: 'name email' },
      ]);
    });
    if (lead) return res.json(lead);

    const existingLead = await Lead.findById(req.params.id);
    if (!existingLead) return res.status(404).json({ message: 'Lead not found' });
    if (existingLead.assignedSpecialist?.toString() === req.user._id.toString()) {
      return res.json(existingLead);
    }
    return res.status(409).json({ message: 'This lead has already been assigned to another specialist.' });
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const createLeadAppointment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lead ID.' });
    }
    const { title, appointmentType, scheduledFor, meetingLinkOrAddress = '', progressSummary } = req.body;
    const appointmentTypes = Lead.schema.path('appointments').schema.path('appointmentType').enumValues;
    const scheduledDate = new Date(scheduledFor);
    if (
      typeof title !== 'string' || !title.trim() || title.length > 180
      || !appointmentTypes.includes(appointmentType)
      || Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()
      || typeof meetingLinkOrAddress !== 'string' || meetingLinkOrAddress.length > 2048
      || typeof progressSummary !== 'string' || progressSummary.trim().length < 15 || progressSummary.trim().length > 5000
    ) {
      return res.status(400).json({ message: 'Provide a valid appointment title, type, future date, and progress summary of at least 15 characters.' });
    }

    let created = await runInTransaction(async (session) => {
      await lockSpecialistAccount(req, session);
      const lead = await Lead.findById(req.params.id).session(session);
      if (!lead) {
        const error = new Error('Lead not found.');
        error.statusCode = 404;
        throw error;
      }
      if (req.user.role !== 'admin' && lead.assignedSpecialist?.toString() !== req.user._id.toString()) {
        const error = new Error('Only the assigned specialist can schedule an appointment.');
        error.statusCode = 403;
        throw error;
      }
      if (!lead.popiaConsentVerbalConfirmed || !lead.zeroChildrenDataCertified) {
        const error = new Error('This lead cannot be contacted until the required privacy certifications are verified.');
        error.statusCode = 409;
        throw error;
      }
      if (!lead.assignedSpecialist) {
        const error = new Error('Assign a specialist to the lead before scheduling an appointment.');
        error.statusCode = 409;
        throw error;
      }
      if (lead.pipelineStage === '5_closed_won_pending_payout' || lead.stage === 'Closed Lost') {
        const error = new Error('Appointments cannot be added to a closed lead.');
        error.statusCode = 409;
        throw error;
      }

      lead.appointments.push({
        specialist: lead.assignedSpecialist,
        title: title.trim(),
        appointmentType,
        scheduledFor: scheduledDate,
        meetingLinkOrAddress: meetingLinkOrAddress.trim(),
        providerStatus: meetingLinkOrAddress ? 'manual' : 'local_only',
      });
      const appointment = lead.appointments[lead.appointments.length - 1];
      lead.activityTimeline.push({
        actor: req.user._id,
        type: appointmentType === 'Product Demo' ? 'meeting' : 'note',
        interactionType: appointmentType === 'Product Demo' ? 'Demo' : 'In-Person Meeting',
        stageAtTime: lead.pipelineStage,
        text: `Scheduled ${appointmentType}: ${title.trim()}. ${progressSummary.trim()}`,
        scheduledAt: scheduledDate,
        meetingTitle: title.trim(),
        meetingUrl: /^https:\/\/meet\.google\.com\//i.test(meetingLinkOrAddress.trim()) ? meetingLinkOrAddress.trim() : '',
      });
      const previousPipelineStage = lead.pipelineStage || '1_new_unclaimed';
      if (['1_new_unclaimed', '2_specialist_contacted'].includes(previousPipelineStage)) {
        lead.pipelineStage = '3_demo_meeting_scheduled';
        lead.stage = 'In Progress';
        lead.stageHistory.push({
          fromStage: previousPipelineStage === '1_new_unclaimed' ? 'New' : 'Contacted',
          toStage: 'In Progress',
          fromPipelineStage: previousPipelineStage,
          toPipelineStage: '3_demo_meeting_scheduled',
          completedBy: req.user._id,
          reportSummary: progressSummary.trim(),
        });
      }
      await lead.save({ session });
      await writeAuditLog({
        req,
        action: 'lead.appointment_scheduled',
        resourceType: 'Lead',
        resourceId: lead._id,
        after: { appointmentId: appointment._id, title: appointment.title, appointmentType, scheduledFor: scheduledDate, pipelineStage: lead.pipelineStage },
        session,
      });
      return { appointment: appointment.toObject(), pipelineStage: lead.pipelineStage };
    });

    const calendarEvent = await createGoogleMeetEvent({ scheduledAt: scheduledDate });
    created = await runInTransaction(async (session) => {
      const lead = await Lead.findById(req.params.id).session(session);
      const appointment = lead?.appointments.id(created.appointment._id);
      if (!appointment) {
        const error = new Error('Appointment was saved but its calendar metadata could not be updated.');
        error.statusCode = 409;
        throw error;
      }
      appointment.googleEventId = calendarEvent.eventId;
      appointment.providerStatus = calendarEvent.status;
      if (calendarEvent.googleMeetLink && !appointment.meetingLinkOrAddress) {
        appointment.meetingLinkOrAddress = calendarEvent.googleMeetLink;
      }
      const activity = [...lead.activityTimeline].reverse().find((entry) => (
        entry.meetingTitle === appointment.title && entry.scheduledAt?.getTime() === scheduledDate.getTime()
      ));
      if (activity) {
        activity.googleEventId = calendarEvent.eventId;
        activity.meetingProviderStatus = calendarEvent.status;
        activity.meetingUrl = calendarEvent.googleMeetLink || activity.meetingUrl;
      }
      await lead.save({ session });
      await writeAuditLog({
        req,
        action: 'lead.appointment_calendar_updated',
        resourceType: 'Lead',
        resourceId: lead._id,
        after: { appointmentId: appointment._id, googleEventId: appointment.googleEventId, providerStatus: appointment.providerStatus },
        session,
      });
      return appointment;
    });
    return res.status(201).json(created);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const updateLeadAppointment = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.appointmentId)) {
      return res.status(400).json({ message: 'Invalid lead or appointment ID.' });
    }
    const { status, scheduledFor } = req.body;
    const statuses = Lead.schema.path('appointments').schema.path('status').enumValues;
    if (!statuses.includes(status)) {
      return res.status(400).json({ message: 'Choose a valid appointment status.' });
    }
    const nextDate = scheduledFor === undefined ? null : new Date(scheduledFor);
    if (status === 'rescheduled' && (!nextDate || Number.isNaN(nextDate.getTime()) || nextDate <= new Date())) {
      return res.status(400).json({ message: 'A rescheduled appointment requires a valid future date.' });
    }

    const appointmentSnapshot = await runInTransaction(async (session) => {
      await lockSpecialistAccount(req, session);
      const lead = await Lead.findById(req.params.id).session(session);
      const current = lead?.appointments.id(req.params.appointmentId);
      if (!lead || !current) {
        const error = new Error('Lead or appointment not found.');
        error.statusCode = 404;
        throw error;
      }
      if (req.user.role !== 'admin' && lead.assignedSpecialist?.toString() !== req.user._id.toString()) {
        const error = new Error('Only the assigned specialist can manage this appointment.');
        error.statusCode = 403;
        throw error;
      }
      if (!lead.popiaConsentVerbalConfirmed || !lead.zeroChildrenDataCertified) {
        const error = new Error('This lead cannot be contacted until the required privacy certifications are verified.');
        error.statusCode = 409;
        throw error;
      }
      if (current.status === 'completed' || current.status === 'cancelled') {
        const error = new Error('Completed or cancelled appointments cannot be changed.');
        error.statusCode = 409;
        throw error;
      }
      const before = { status: current.status, scheduledFor: current.scheduledFor };
      current.status = status;
      if (status === 'rescheduled') current.scheduledFor = nextDate;
      current.updatedAt = new Date();
      lead.activityTimeline.push({
        actor: req.user._id,
        type: 'note',
        interactionType: 'Note',
        stageAtTime: lead.pipelineStage,
        text: `Appointment "${current.title}" ${status}${status === 'rescheduled' ? ` to ${nextDate.toISOString()}` : ''}.`,
        scheduledAt: status === 'rescheduled' ? nextDate : null,
      });
      await lead.save({ session });
      await writeAuditLog({
        req,
        action: `lead.appointment_${status}`,
        resourceType: 'Lead',
        resourceId: lead._id,
        before: { appointmentId: current._id, ...before },
        after: { appointmentId: current._id, status: current.status, scheduledFor: current.scheduledFor },
        session,
      });
      return current.toObject();
    });
    if (
      ['cancelled', 'rescheduled'].includes(status)
      && appointmentSnapshot.providerStatus === 'synced'
      && appointmentSnapshot.googleEventId
    ) {
      const calendarUpdate = await updateGoogleMeetEvent({
        eventId: appointmentSnapshot.googleEventId,
        scheduledAt: status === 'rescheduled' ? nextDate : appointmentSnapshot.scheduledFor,
        status,
      });
      appointmentSnapshot.providerStatus = calendarUpdate.status;
      await runInTransaction(async (session) => {
        await lockSpecialistAccount(req, session);
        const lead = await Lead.findById(req.params.id).session(session);
        const current = lead?.appointments.id(req.params.appointmentId);
        if (!current || current.googleEventId !== appointmentSnapshot.googleEventId) {
          const error = new Error('Appointment changed while its calendar event was being updated.');
          error.statusCode = 409;
          throw error;
        }
        current.providerStatus = calendarUpdate.status;
        await lead.save({ session });
        await writeAuditLog({
          req,
          action: 'lead.appointment_calendar_sync_updated',
          resourceType: 'Lead',
          resourceId: lead._id,
          after: {
            appointmentId: current._id,
            googleEventId: current.googleEventId,
            providerStatus: current.providerStatus,
          },
          session,
        });
        Object.assign(appointmentSnapshot, current.toObject());
      });
    }
    return res.json(appointmentSnapshot);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

const addLeadActivity = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid lead ID.' });
    }
    const { type, text, scheduledAt, scheduledFollowUp } = req.body;
    if (!['note', 'call', 'email', 'meeting'].includes(type) || typeof text !== 'string' || !text.trim() || text.length > 10000) {
      return res.status(400).json({ message: 'Choose a valid activity type and provide details.' });
    }
    if (type === 'meeting' && scheduledAt && (
      Number.isNaN(Date.parse(scheduledAt)) || new Date(scheduledAt) <= new Date()
    )) {
      return res.status(400).json({ message: 'Scheduled meeting time must be a valid future date.' });
    }
    if (scheduledFollowUp && (
      Number.isNaN(Date.parse(scheduledFollowUp)) || new Date(scheduledFollowUp) <= new Date()
    )) {
      return res.status(400).json({ message: 'Follow-up time must be a valid future date.' });
    }
    const { meetingTitle = '', meetingUrl = '' } = req.body;
    if (
      typeof meetingTitle !== 'string'
      || meetingTitle.length > 180
      || typeof meetingUrl !== 'string'
      || meetingUrl.length > 2048
    ) {
      return res.status(400).json({ message: 'Meeting title or link is invalid.' });
    }
    if (meetingUrl) {
      let parsedUrl;
      try {
        parsedUrl = new URL(meetingUrl);
      } catch {
        return res.status(400).json({ message: 'Enter a valid Google Meet URL.' });
      }
      if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'meet.google.com') {
        return res.status(400).json({ message: 'Meeting links must use the secure meet.google.com domain.' });
      }
    }

    let activity = await runInTransaction(async (session) => {
      await lockSpecialistAccount(req, session);
      const lead = await Lead.findById(req.params.id).session(session);
      if (!lead) {
        const error = new Error('Lead not found.');
        error.statusCode = 404;
        throw error;
      }
      const authorized = req.user.role === 'admin'
        || (req.user.role === 'specialist' && lead.assignedSpecialist?.toString() === req.user._id.toString());
      if (!authorized) {
        const error = new Error('Only the assigned specialist or an admin can record lead activities.');
        error.statusCode = 403;
        throw error;
      }
      if (!lead.popiaConsentVerbalConfirmed || !lead.zeroChildrenDataCertified) {
        const error = new Error('This lead cannot be contacted until the required privacy certifications are verified.');
        error.statusCode = 409;
        throw error;
      }
      lead.activityTimeline.push({
        actor: req.user._id,
        type,
        text: text.trim(),
        interactionType: ({
          call: 'Call',
          email: 'Email',
          note: 'Note',
          meeting: 'In-Person Meeting',
        })[type],
        stageAtTime: lead.pipelineStage,
        scheduledFollowUp: scheduledFollowUp ? new Date(scheduledFollowUp) : null,
        scheduledAt: type === 'meeting' && scheduledAt ? new Date(scheduledAt) : null,
        meetingTitle: type === 'meeting' ? meetingTitle.trim() : '',
        meetingUrl: type === 'meeting' ? meetingUrl.trim() : '',
        meetingProviderStatus: type === 'meeting' ? (meetingUrl ? 'manual' : 'local_only') : 'manual',
      });
      const savedLead = await lead.save({ session });
      const createdActivity = savedLead.activityTimeline[savedLead.activityTimeline.length - 1];
      await writeAuditLog({
        req,
        action: `lead.activity_${type}`,
        resourceType: 'Lead',
        resourceId: lead._id,
        after: { activityId: createdActivity._id, type, text: text.trim(), scheduledAt: createdActivity.scheduledAt },
        session,
      });
      return createdActivity;
    });
    if (type === 'meeting' && scheduledAt) {
      const calendarEvent = await createGoogleMeetEvent({ scheduledAt });
      activity = await runInTransaction(async (session) => {
        const lead = await Lead.findById(req.params.id).session(session);
        const savedActivity = lead?.activityTimeline.id(activity._id);
        if (!savedActivity) {
          const error = new Error('The meeting was scheduled, but its lead activity could not be updated.');
          error.statusCode = 409;
          throw error;
        }
        savedActivity.googleEventId = calendarEvent.eventId;
        savedActivity.meetingUrl = calendarEvent.googleMeetLink || savedActivity.meetingUrl;
        savedActivity.meetingProviderStatus = calendarEvent.status;
        await lead.save({ session });
        await writeAuditLog({
          req,
          action: 'lead.meeting_calendar_updated',
          resourceType: 'Lead',
          resourceId: lead._id,
          after: {
            activityId: savedActivity._id,
            googleEventId: savedActivity.googleEventId,
            meetingProviderStatus: savedActivity.meetingProviderStatus,
          },
          session,
        });
        return savedActivity;
      });
    }
    return res.status(201).json(activity);
  } catch (error) {
    return respondWithControllerError(req, res, error);
  }
};

module.exports = {
  createLead,
  getMyLeads,
  updateLead,
  deleteLead,
  claimLead,
  createLeadAppointment,
  updateLeadAppointment,
  addLeadActivity,
};
