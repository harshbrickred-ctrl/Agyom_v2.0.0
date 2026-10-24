import {
  LoiStatus,
  PrismaClient,
  RequirementStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail, normalizeMobile } from '@sst/shared-utils';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD?.trim() || 'Demo@123';

const DEMO_USERS = [
  { email: 'demo.sales@sst.dev', fullName: 'Demo Sales Rep', role: Role.SALES },
  {
    email: 'demo.saleslead@sst.dev',
    fullName: 'Demo Sales Lead',
    role: Role.SALES_LEAD,
  },
  { email: 'demo.ta@sst.dev', fullName: 'Demo TA Recruiter', role: Role.TA },
  {
    email: 'demo.talead@sst.dev',
    fullName: 'Demo TA Lead',
    role: Role.TA_LEAD,
  },
  { email: 'demo.hr@sst.dev', fullName: 'Demo HR Executive', role: Role.HR },
  {
    email: 'demo.hrlead@sst.dev',
    fullName: 'Demo HR Lead',
    role: Role.HR_LEAD,
  },
] as const;

const DEMO_CLIENTS = ['Demo Client Alpha', 'Demo Client Beta'] as const;
const DEMO_JOB_FAMILIES = ['Engineering', 'Data & Analytics'] as const;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function upsertUser(
  prisma: PrismaClient,
  passwordHash: string,
  email: string,
  fullName: string,
  role: Role,
) {
  return prisma.user.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), fullName, role, passwordHash },
    update: { fullName, role, passwordHash, isActive: true, deletedAt: null },
  });
}

async function upsertClient(prisma: PrismaClient, name: string) {
  const nameNormalized = name.trim().toLowerCase();
  const existing = await prisma.client.findFirst({
    where: { nameNormalized, deletedAt: null },
  });
  if (existing) return existing;
  return prisma.client.create({ data: { name, nameNormalized } });
}

async function upsertJobFamily(prisma: PrismaClient, name: string) {
  return prisma.jobFamily.upsert({
    where: { name },
    create: { name },
    update: { deletedAt: null },
  });
}

async function upsertRequirement(
  prisma: PrismaClient,
  input: {
    publicId: string;
    roleSkill: string;
    status: RequirementStatus;
    clientId: string;
    jobFamilyId: string;
    salesOwnerId: string;
    taOwnerId: string;
    taLeadId: string;
    numberOfPositions: number;
    priorityCode: string;
    jobLocation: string;
    requirementDate: Date;
    taHandoffDate: Date;
    targetClosureDate: Date;
    remarks?: string;
  },
) {
  const req = await prisma.requirement.upsert({
    where: { publicId: input.publicId },
    create: {
      publicId: input.publicId,
      requirementDate: input.requirementDate,
      clientId: input.clientId,
      roleSkill: input.roleSkill,
      jobFamilyId: input.jobFamilyId,
      numberOfPositions: input.numberOfPositions,
      salesOwnerId: input.salesOwnerId,
      taOwnerId: input.taOwnerId,
      priorityCode: input.priorityCode,
      taHandoffDate: input.taHandoffDate,
      targetClosureDate: input.targetClosureDate,
      jobLocation: input.jobLocation,
      experience: '3–8 years',
      status: input.status,
      remarks: input.remarks,
    },
    update: {
      requirementDate: input.requirementDate,
      clientId: input.clientId,
      roleSkill: input.roleSkill,
      jobFamilyId: input.jobFamilyId,
      numberOfPositions: input.numberOfPositions,
      salesOwnerId: input.salesOwnerId,
      taOwnerId: input.taOwnerId,
      priorityCode: input.priorityCode,
      taHandoffDate: input.taHandoffDate,
      targetClosureDate: input.targetClosureDate,
      jobLocation: input.jobLocation,
      experience: '3–8 years',
      status: input.status,
      remarks: input.remarks,
      deletedAt: null,
    },
  });

  await prisma.requirementTaAssignment.upsert({
    where: {
      requirementId_userId: {
        requirementId: req.id,
        userId: input.taOwnerId,
      },
    },
    create: {
      requirementId: req.id,
      userId: input.taOwnerId,
      isPrimary: true,
    },
    update: { isPrimary: true },
  });

  await prisma.requirementTaLeadAssignment.upsert({
    where: {
      requirementId_userId: {
        requirementId: req.id,
        userId: input.taLeadId,
      },
    },
    create: { requirementId: req.id, userId: input.taLeadId },
    update: {},
  });

  return req;
}

async function upsertCandidate(
  prisma: PrismaClient,
  input: {
    publicId: string;
    requirementId: string;
    name: string;
    email: string;
    mobile: string;
    stageCode: string;
    interviewRound?: string | null;
    feedbackCode?: string | null;
    selected?: boolean;
    loiStatus?: LoiStatus;
    remarks?: string;
    clientShortlistDate?: Date | null;
  },
) {
  const emailNormalized = normalizeEmail(input.email);
  const mobileNormalized = normalizeMobile(input.mobile);
  return prisma.candidate.upsert({
    where: { publicId: input.publicId },
    create: {
      publicId: input.publicId,
      requirementId: input.requirementId,
      name: input.name,
      mobile: input.mobile,
      mobileNormalized,
      email: input.email,
      emailNormalized,
      source: 'Demo Seed',
      stageCode: input.stageCode,
      interviewRound: input.interviewRound ?? null,
      feedbackCode: input.feedbackCode ?? null,
      selected: input.selected ?? false,
      selectedAt: input.selected ? daysAgo(3) : null,
      loiStatus: input.loiStatus ?? LoiStatus.NOT_RECEIVED,
      profileSubmittedDate: daysAgo(7),
      clientShortlistDate: input.clientShortlistDate ?? null,
      remarks: input.remarks,
    },
    update: {
      requirementId: input.requirementId,
      name: input.name,
      mobile: input.mobile,
      mobileNormalized,
      email: input.email,
      emailNormalized,
      source: 'Demo Seed',
      stageCode: input.stageCode,
      interviewRound: input.interviewRound ?? null,
      feedbackCode: input.feedbackCode ?? null,
      selected: input.selected ?? false,
      selectedAt: input.selected ? daysAgo(3) : null,
      loiStatus: input.loiStatus ?? LoiStatus.NOT_RECEIVED,
      profileSubmittedDate: daysAgo(7),
      clientShortlistDate: input.clientShortlistDate ?? null,
      remarks: input.remarks,
      deletedAt: null,
    },
  });
}

async function upsertOffer(
  prisma: PrismaClient,
  input: {
    publicId: string;
    candidateId: string;
    requirementId: string;
    statusCode: string;
    ctcRate: string;
    expectedDoj: Date;
  },
) {
  return prisma.offer.upsert({
    where: { publicId: input.publicId },
    create: {
      publicId: input.publicId,
      candidateId: input.candidateId,
      requirementId: input.requirementId,
      statusCode: input.statusCode,
      ctcRate: input.ctcRate,
      expectedDoj: input.expectedDoj,
      offerInitiatedDate: daysAgo(5),
      offerReleasedDate:
        input.statusCode === 'RELEASED' || input.statusCode === 'ACCEPTED'
          ? daysAgo(2)
          : null,
      selectedDate: daysAgo(4),
    },
    update: {
      candidateId: input.candidateId,
      requirementId: input.requirementId,
      statusCode: input.statusCode,
      ctcRate: input.ctcRate,
      expectedDoj: input.expectedDoj,
      offerInitiatedDate: daysAgo(5),
      offerReleasedDate:
        input.statusCode === 'RELEASED' || input.statusCode === 'ACCEPTED'
          ? daysAgo(2)
          : null,
      selectedDate: daysAgo(4),
      deletedAt: null,
    },
  });
}

async function upsertOnboarding(
  prisma: PrismaClient,
  input: {
    publicId: string;
    offerId: string;
    candidateId: string;
    requirementId: string;
    hrOwnerId: string;
    statusCode: string;
    bgvStatusCode: string;
    docsPending: boolean;
    expectedDoj: Date;
    actualDoj?: Date | null;
  },
) {
  return prisma.onboarding.upsert({
    where: { publicId: input.publicId },
    create: {
      publicId: input.publicId,
      offerId: input.offerId,
      candidateId: input.candidateId,
      requirementId: input.requirementId,
      hrOwnerId: input.hrOwnerId,
      statusCode: input.statusCode,
      bgvStatusCode: input.bgvStatusCode,
      docsPending: input.docsPending,
      expectedDoj: input.expectedDoj,
      actualDoj: input.actualDoj ?? null,
      offerAcceptedDate:
        input.statusCode !== 'DOCS_PENDING' ? daysAgo(1) : null,
      joiningFormalities:
        input.statusCode === 'JOINED' ? 'Completed — demo join' : null,
    },
    update: {
      offerId: input.offerId,
      candidateId: input.candidateId,
      requirementId: input.requirementId,
      hrOwnerId: input.hrOwnerId,
      statusCode: input.statusCode,
      bgvStatusCode: input.bgvStatusCode,
      docsPending: input.docsPending,
      expectedDoj: input.expectedDoj,
      actualDoj: input.actualDoj ?? null,
      offerAcceptedDate:
        input.statusCode !== 'DOCS_PENDING' ? daysAgo(1) : null,
      joiningFormalities:
        input.statusCode === 'JOINED' ? 'Completed — demo join' : null,
      deletedAt: null,
    },
  });
}

async function bumpSequence(prisma: PrismaClient, name: string, minValue: number) {
  const row = await prisma.idSequence.findUnique({ where: { name } });
  if (!row || row.value < minValue) {
    await prisma.idSequence.upsert({
      where: { name },
      create: { name, value: minValue },
      update: { value: minValue },
    });
  }
}

export async function seedDemoData(prisma: PrismaClient, adminId: string) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const users: Record<string, { id: string; email: string }> = {
    admin: { id: adminId, email: 'admin@sst.dev' },
  };

  for (const def of DEMO_USERS) {
    const user = await upsertUser(
      prisma,
      passwordHash,
      def.email,
      def.fullName,
      def.role,
    );
    users[def.role] = { id: user.id, email: user.email };
  }

  const [clientAlpha, clientBeta] = await Promise.all(
    DEMO_CLIENTS.map((name) => upsertClient(prisma, name)),
  );
  const [jobEng, jobData] = await Promise.all(
    DEMO_JOB_FAMILIES.map((name) => upsertJobFamily(prisma, name)),
  );

  const sales = users.SALES!;
  const ta = users.TA!;
  const taLead = users.TA_LEAD!;
  const hr = users.HR!;

  const reqActive = await upsertRequirement(prisma, {
    publicId: 'REQ-90001',
    roleSkill: 'DEMO | Active — Senior React Developer',
    status: RequirementStatus.ACTIVE,
    clientId: clientAlpha.id,
    jobFamilyId: jobEng.id,
    salesOwnerId: sales.id,
    taOwnerId: ta.id,
    taLeadId: taLead.id,
    numberOfPositions: 3,
    priorityCode: 'HIGH',
    jobLocation: 'Bangalore (Hybrid)',
    requirementDate: daysAgo(14),
    taHandoffDate: daysAgo(10),
    targetClosureDate: daysFromNow(30),
    remarks: 'Demo ACTIVE req — pipeline has L1/L2/Selected/Rejected candidates.',
  });

  const reqOnHold = await upsertRequirement(prisma, {
    publicId: 'REQ-90002',
    roleSkill: 'DEMO | On Hold — Java Backend Engineer',
    status: RequirementStatus.ON_HOLD,
    clientId: clientBeta.id,
    jobFamilyId: jobEng.id,
    salesOwnerId: sales.id,
    taOwnerId: ta.id,
    taLeadId: taLead.id,
    numberOfPositions: 2,
    priorityCode: 'MEDIUM',
    jobLocation: 'Pune',
    requirementDate: daysAgo(20),
    taHandoffDate: daysAgo(15),
    targetClosureDate: daysFromNow(45),
    remarks: 'Demo ON_HOLD req — recruiting paused.',
  });

  const reqClosed = await upsertRequirement(prisma, {
    publicId: 'REQ-90003',
    roleSkill: 'DEMO | Closed — DevOps Engineer',
    status: RequirementStatus.CLOSED,
    clientId: clientAlpha.id,
    jobFamilyId: jobData.id,
    salesOwnerId: sales.id,
    taOwnerId: ta.id,
    taLeadId: taLead.id,
    numberOfPositions: 1,
    priorityCode: 'CRITICAL',
    jobLocation: 'Remote',
    requirementDate: daysAgo(45),
    taHandoffDate: daysAgo(40),
    targetClosureDate: daysAgo(5),
    remarks: 'Demo CLOSED req — candidate joined.',
  });

  const reqCancelled = await upsertRequirement(prisma, {
    publicId: 'REQ-90004',
    roleSkill: 'DEMO | Cancelled — UI/UX Designer',
    status: RequirementStatus.CANCELLED,
    clientId: clientBeta.id,
    jobFamilyId: jobEng.id,
    salesOwnerId: sales.id,
    taOwnerId: ta.id,
    taLeadId: taLead.id,
    numberOfPositions: 1,
    priorityCode: 'LOW',
    jobLocation: 'Chennai',
    requirementDate: daysAgo(8),
    taHandoffDate: daysAgo(6),
    targetClosureDate: daysFromNow(20),
    remarks: 'Demo CANCELLED req — client withdrew.',
  });

  await upsertRequirement(prisma, {
    publicId: 'REQ-90005',
    roleSkill: 'DEMO | Delete Me — QA Test Requirement',
    status: RequirementStatus.ACTIVE,
    clientId: clientAlpha.id,
    jobFamilyId: jobEng.id,
    salesOwnerId: sales.id,
    taOwnerId: ta.id,
    taLeadId: taLead.id,
    numberOfPositions: 1,
    priorityCode: 'LOW',
    jobLocation: 'Hyderabad',
    requirementDate: daysAgo(2),
    taHandoffDate: daysAgo(1),
    targetClosureDate: daysFromNow(60),
    remarks: 'Demo req for admin bulk/single delete testing.',
  });

  const noteExists = await prisma.requirementNote.findFirst({
    where: { requirementId: reqActive.id, body: { contains: 'Demo note' } },
  });
  if (!noteExists) {
    await prisma.requirementNote.create({
      data: {
        requirementId: reqActive.id,
        authorUserId: sales.id,
        body: 'Demo note: client prefers candidates with product-company experience.',
      },
    });
  }

  await upsertCandidate(prisma, {
    publicId: 'CAND-90001',
    requirementId: reqActive.id,
    name: 'DEMO Priya Sharma (L1)',
    email: 'demo.priya@sst.dev',
    mobile: '9876500001',
    stageCode: 'SUBMITTED_TO_SPOC',
    interviewRound: 'L1',
    feedbackCode: 'PENDING',
    remarks: 'Early pipeline — L1 scheduled.',
  });

  await upsertCandidate(prisma, {
    publicId: 'CAND-90002',
    requirementId: reqActive.id,
    name: 'DEMO Arjun Patel (L2)',
    email: 'demo.arjun@sst.dev',
    mobile: '9876500002',
    stageCode: 'CLIENT_SHORTLIST',
    interviewRound: 'L2',
    feedbackCode: 'POSITIVE',
    clientShortlistDate: daysAgo(2),
    remarks: 'Client shortlist — L2 cleared.',
  });

  const candSelected = await upsertCandidate(prisma, {
    publicId: 'CAND-90003',
    requirementId: reqActive.id,
    name: 'DEMO Sneha Reddy (Selected + Offer)',
    email: 'demo.sneha@sst.dev',
    mobile: '9876500003',
    stageCode: 'CLIENT_SHORTLIST',
    interviewRound: 'COMPLETED',
    feedbackCode: 'POSITIVE',
    selected: true,
    loiStatus: LoiStatus.RECEIVED,
    remarks: 'Selected — offer in HR pipeline.',
  });

  await upsertCandidate(prisma, {
    publicId: 'CAND-90004',
    requirementId: reqActive.id,
    name: 'DEMO Vikram Singh (Rejected)',
    email: 'demo.vikram@sst.dev',
    mobile: '9876500004',
    stageCode: 'REJECT',
    interviewRound: 'L1',
    feedbackCode: 'NEGATIVE',
    remarks: 'Rejected after L1.',
  });

  await upsertCandidate(prisma, {
    publicId: 'CAND-90005',
    requirementId: reqOnHold.id,
    name: 'DEMO Meera Iyer (On Hold Req)',
    email: 'demo.meera@sst.dev',
    mobile: '9876500005',
    stageCode: 'HOLD',
    interviewRound: 'L2',
    feedbackCode: 'HOLD',
    remarks: 'Requirement on hold — candidate paused.',
  });

  const candJoined = await upsertCandidate(prisma, {
    publicId: 'CAND-90006',
    requirementId: reqClosed.id,
    name: 'DEMO Rahul Nair (Joined)',
    email: 'demo.rahul@sst.dev',
    mobile: '9876500006',
    stageCode: 'CLIENT_SHORTLIST',
    interviewRound: 'COMPLETED',
    feedbackCode: 'POSITIVE',
    selected: true,
    loiStatus: LoiStatus.RECEIVED,
    remarks: 'Joined — fills closed requirement.',
  });

  const offerActive = await upsertOffer(prisma, {
    publicId: 'OFF-90001',
    candidateId: candSelected.id,
    requirementId: reqActive.id,
    statusCode: 'RELEASED',
    ctcRate: '18 LPA',
    expectedDoj: daysFromNow(25),
  });

  const offerJoined = await upsertOffer(prisma, {
    publicId: 'OFF-90002',
    candidateId: candJoined.id,
    requirementId: reqClosed.id,
    statusCode: 'ACCEPTED',
    ctcRate: '22 LPA',
    expectedDoj: daysAgo(3),
  });

  await upsertOnboarding(prisma, {
    publicId: 'ONB-90001',
    offerId: offerActive.id,
    candidateId: candSelected.id,
    requirementId: reqActive.id,
    hrOwnerId: hr.id,
    statusCode: 'IN_PROGRESS',
    bgvStatusCode: 'IN_PROGRESS',
    docsPending: true,
    expectedDoj: daysFromNow(25),
  });

  await upsertOnboarding(prisma, {
    publicId: 'ONB-90002',
    offerId: offerJoined.id,
    candidateId: candJoined.id,
    requirementId: reqClosed.id,
    hrOwnerId: hr.id,
    statusCode: 'JOINED',
    bgvStatusCode: 'CLEARED',
    docsPending: false,
    expectedDoj: daysAgo(3),
    actualDoj: daysAgo(2),
  });

  await bumpSequence(prisma, 'requirement', 90005);
  await bumpSequence(prisma, 'candidate', 90006);
  await bumpSequence(prisma, 'offer', 90002);
  await bumpSequence(prisma, 'onboarding', 90002);

  // eslint-disable-next-line no-console
  console.log('\n[demo-seed] Demo data ready. Search for "DEMO |" in Requirements.');
  // eslint-disable-next-line no-console
  console.log('[demo-seed] Demo role logins (password for all):', DEMO_PASSWORD);
  for (const def of DEMO_USERS) {
    // eslint-disable-next-line no-console
    console.log(`  - ${def.role.padEnd(11)} ${def.email}`);
  }
  // eslint-disable-next-line no-console
  console.log('[demo-seed] Scenarios:');
  // eslint-disable-next-line no-console
  console.log('  REQ-90001 ACTIVE  — full TA pipeline + released offer + onboarding');
  // eslint-disable-next-line no-console
  console.log('  REQ-90002 ON_HOLD — paused requirement');
  // eslint-disable-next-line no-console
  console.log('  REQ-90003 CLOSED  — joined candidate');
  // eslint-disable-next-line no-console
  console.log('  REQ-90004 CANCELLED — cancelled requirement');
  // eslint-disable-next-line no-console
  console.log('  REQ-90005 ACTIVE  — safe to delete (admin delete testing)');

  return {
    users,
    clients: { alpha: clientAlpha, beta: clientBeta },
    requirements: {
      active: reqActive,
      onHold: reqOnHold,
      closed: reqClosed,
      cancelled: reqCancelled,
    },
  };
}
