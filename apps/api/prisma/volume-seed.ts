import {
  LoiStatus,
  PrismaClient,
  RequirementStatus,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { normalizeEmail, normalizeMobile } from '@sst/shared-utils';

const VOLUME_PASSWORD = process.env.SEED_DEMO_PASSWORD?.trim() || 'Demo@123';

const EXTRA_USERS = [
  { email: 'ananya.ta@sst.dev', fullName: 'Ananya Desai', role: Role.TA },
  { email: 'rohan.ta@sst.dev', fullName: 'Rohan Kapoor', role: Role.TA },
  { email: 'kavya.ta@sst.dev', fullName: 'Kavya Menon', role: Role.TA },
  { email: 'imran.ta@sst.dev', fullName: 'Imran Qureshi', role: Role.TA },
  { email: 'neha.sales@sst.dev', fullName: 'Neha Bansal', role: Role.SALES },
] as const;

const CLIENTS = [
  'Northwind Retail',
  'Helios Bank',
  'Orbit Health',
  'Lumen Telecom',
  'Apex Logistics',
] as const;

const JOB_FAMILIES = ['Finance', 'Customer Success'] as const;

const ROLES = [
  'Senior Java Developer',
  'React Engineer',
  'Data Analyst',
  'DevOps Engineer',
  'Product Analyst',
  'QA Automation Lead',
  'Salesforce Consultant',
  'Business Analyst',
] as const;

const LOCATIONS = ['Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi', 'Remote', 'Chennai'] as const;
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const FIRST = ['Aarav', 'Diya', 'Kabir', 'Ishaan', 'Myra', 'Vihaan', 'Anika', 'Sara', 'Aditya', 'Pooja', 'Nikhil', 'Tara', 'Dev', 'Aisha', 'Karan', 'Zoya', 'Mehul', 'Naina', 'Reyansh', 'Ishita'];
const LAST = ['Sharma', 'Iyer', 'Nair', 'Gupta', 'Banerjee', 'Joshi', 'Reddy', 'Mehta', 'Das', 'Pillai', 'Malhotra', 'Sethi', 'Kulkarni', 'Chopra', 'Bose'];

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

function pad(n: number) {
  return String(n).padStart(5, '0');
}

async function upsertUser(
  prisma: PrismaClient,
  passwordHash: string,
  email: string,
  fullName: string,
  role: Role,
) {
  return prisma.user.upsert({
    where: { email },
    create: { email, fullName, role, passwordHash },
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

type StagePlan =
  | 'pipeline'
  | 'selected'
  | 'released'
  | 'accepted'
  | 'joined';

export async function seedVolumeData(prisma: PrismaClient) {
  const passwordHash = await bcrypt.hash(VOLUME_PASSWORD, 10);
  const extraUsers = [];
  for (const def of EXTRA_USERS) {
    extraUsers.push(await upsertUser(prisma, passwordHash, def.email, def.fullName, def.role));
  }

  const taEmails = [
    'ananya.ta@sst.dev',
    'rohan.ta@sst.dev',
    'kavya.ta@sst.dev',
    'imran.ta@sst.dev',
    'demo.ta@sst.dev',
    'demo.talead@sst.dev',
  ];
  const salesEmails = ['demo.sales@sst.dev', 'demo.saleslead@sst.dev', 'neha.sales@sst.dev'];
  const hr = await prisma.user.findUnique({ where: { email: 'demo.hr@sst.dev' } });
  const taLead = await prisma.user.findUnique({ where: { email: 'demo.talead@sst.dev' } });
  if (!hr || !taLead) {
    throw new Error('Demo HR and TA Lead must exist before the volume seed.');
  }

  const tas = [];
  for (const email of taEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Missing TA user ${email}`);
    tas.push(user);
  }
  const sales = [];
  for (const email of salesEmails) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Missing sales user ${email}`);
    sales.push(user);
  }

  const clients = [];
  for (const name of CLIENTS) clients.push(await upsertClient(prisma, name));
  const families = [];
  for (const name of ['Engineering', 'Data & Analytics', ...JOB_FAMILIES]) {
    families.push(
      await prisma.jobFamily.upsert({
        where: { name },
        create: { name },
        update: { deletedAt: null },
      }),
    );
  }

  const requirementCount = 36;
  let candidateSeq = 91000;
  let offerSeq = 91000;
  let onboardingSeq = 91000;

  for (let i = 0; i < requirementCount; i += 1) {
    const status: RequirementStatus =
      i < 18
        ? RequirementStatus.ACTIVE
        : i < 24
          ? RequirementStatus.ON_HOLD
          : i < 30
            ? RequirementStatus.CANCELLED
            : RequirementStatus.CLOSED;
    const positions = status === RequirementStatus.CLOSED ? 1 : [2, 3, 1, 4, 2, 5][i % 6];
    const ta = tas[i % tas.length];
    const salesOwner = sales[i % sales.length];
    const client = clients[i % clients.length];
    const family = families[i % families.length];
    const publicId = `REQ-${pad(91001 + i)}`;
    const requirement = await prisma.requirement.upsert({
      where: { publicId },
      create: {
        publicId,
        requirementDate: daysAgo(10 + (i % 40)),
        clientId: client.id,
        roleSkill: `${ROLES[i % ROLES.length]} — ${client.name}`,
        jobFamilyId: family.id,
        numberOfPositions: positions,
        salesOwnerId: salesOwner.id,
        taOwnerId: ta.id,
        priorityCode: PRIORITIES[i % PRIORITIES.length],
        taHandoffDate: daysAgo(8 + (i % 20)),
        targetClosureDate: status === RequirementStatus.CLOSED ? daysAgo(2) : daysFromNow(20 + (i % 30)),
        jobLocation: LOCATIONS[i % LOCATIONS.length],
        experience: '3–8 years',
        status,
        remarks: `Volume seed ${status} owned by ${ta.fullName}.`,
      },
      update: {
        clientId: client.id,
        roleSkill: `${ROLES[i % ROLES.length]} — ${client.name}`,
        jobFamilyId: family.id,
        numberOfPositions: positions,
        salesOwnerId: salesOwner.id,
        taOwnerId: ta.id,
        priorityCode: PRIORITIES[i % PRIORITIES.length],
        jobLocation: LOCATIONS[i % LOCATIONS.length],
        status,
        deletedAt: null,
      },
    });

    await prisma.requirementTaAssignment.upsert({
      where: { requirementId_userId: { requirementId: requirement.id, userId: ta.id } },
      create: { requirementId: requirement.id, userId: ta.id, isPrimary: true },
      update: { isPrimary: true },
    });
    await prisma.requirementTaLeadAssignment.upsert({
      where: { requirementId_userId: { requirementId: requirement.id, userId: taLead.id } },
      create: { requirementId: requirement.id, userId: taLead.id },
      update: {},
    });

    const plans: StagePlan[] = [];
    if (status === RequirementStatus.ACTIVE) {
      const pattern = i % 3;
      plans.push('pipeline', 'pipeline');
      if (pattern === 0) plans.push('pipeline', 'selected');
      if (pattern === 1) plans.push('released');
      if (pattern === 2) plans.push('accepted');
    } else if (status === RequirementStatus.ON_HOLD) {
      plans.push('pipeline');
    } else if (status === RequirementStatus.CANCELLED && i % 2 === 0) {
      plans.push('pipeline', 'pipeline');
    } else if (status === RequirementStatus.CLOSED) {
      plans.push('joined');
    }

    for (const plan of plans) {
      candidateSeq += 1;
      const name = `${FIRST[candidateSeq % FIRST.length]} ${LAST[candidateSeq % LAST.length]}`;
      const email = `volume.${candidateSeq}@sst.dev`;
      const mobile = `98${String(10000000 + candidateSeq).slice(-8)}`;
      const selected = plan !== 'pipeline';
      const candidate = await prisma.candidate.upsert({
        where: { publicId: `CAND-${pad(candidateSeq)}` },
        create: {
          publicId: `CAND-${pad(candidateSeq)}`,
          requirementId: requirement.id,
          name,
          mobile,
          mobileNormalized: normalizeMobile(mobile),
          email,
          emailNormalized: normalizeEmail(email),
          source: 'Volume Seed',
          stageCode: plan === 'pipeline' && status === RequirementStatus.ON_HOLD
            ? 'HOLD'
            : plan === 'pipeline' && status === RequirementStatus.CANCELLED
              ? 'REJECT'
              : selected
                ? 'CLIENT_SHORTLIST'
                : 'SUBMITTED_TO_SPOC',
          interviewRound: selected ? 'COMPLETED' : 'L1',
          feedbackCode: selected ? 'POSITIVE' : 'PENDING',
          selected,
          selectedAt: selected ? daysAgo(6) : null,
          loiStatus: selected ? LoiStatus.RECEIVED : LoiStatus.NOT_RECEIVED,
          profileSubmittedDate: daysAgo(12),
          clientShortlistDate: selected ? daysAgo(5) : null,
          remarks: `Volume ${plan} candidate for ${publicId}.`,
        },
        update: {
          requirementId: requirement.id,
          name,
          selected,
          deletedAt: null,
        },
      });

      if (plan === 'pipeline' || plan === 'selected') continue;

      offerSeq += 1;
      const offerStatus = plan === 'released' ? 'RELEASED' : 'ACCEPTED';
      const offer = await prisma.offer.upsert({
        where: { publicId: `OFF-${pad(offerSeq)}` },
        create: {
          publicId: `OFF-${pad(offerSeq)}`,
          candidateId: candidate.id,
          requirementId: requirement.id,
          statusCode: offerStatus,
          ctcRate: `${16 + (offerSeq % 8)} LPA`,
          expectedDoj: plan === 'joined' ? daysAgo(4) : daysFromNow(21),
          offerInitiatedDate: daysAgo(9),
          offerReleasedDate: daysAgo(4),
          selectedDate: daysAgo(7),
        },
        update: {
          candidateId: candidate.id,
          requirementId: requirement.id,
          statusCode: offerStatus,
          deletedAt: null,
        },
      });

      if (plan === 'released') continue;

      onboardingSeq += 1;
      const joined = plan === 'joined';
      await prisma.onboarding.upsert({
        where: { publicId: `ONB-${pad(onboardingSeq)}` },
        create: {
          publicId: `ONB-${pad(onboardingSeq)}`,
          offerId: offer.id,
          candidateId: candidate.id,
          requirementId: requirement.id,
          hrOwnerId: hr.id,
          statusCode: joined ? 'JOINED' : 'DOCS_PENDING',
          bgvStatusCode: joined ? 'CLEARED' : 'IN_PROGRESS',
          docsPending: !joined,
          expectedDoj: joined ? daysAgo(4) : daysFromNow(21),
          actualDoj: joined ? daysAgo(2) : null,
          offerAcceptedDate: daysAgo(3),
          joiningFormalities: joined ? 'Completed' : null,
        },
        update: {
          offerId: offer.id,
          candidateId: candidate.id,
          requirementId: requirement.id,
          statusCode: joined ? 'JOINED' : 'DOCS_PENDING',
          deletedAt: null,
        },
      });
    }
  }

  await bumpSequence(prisma, 'requirement', 91036);
  await bumpSequence(prisma, 'candidate', candidateSeq);
  await bumpSequence(prisma, 'offer', offerSeq);
  await bumpSequence(prisma, 'onboarding', onboardingSeq);

  console.log('[volume-seed] Added monitoring data for requirements REQ-91001 through REQ-91036.');
  console.log('[volume-seed] Extra logins use password', VOLUME_PASSWORD);
  for (const def of EXTRA_USERS) {
    console.log(`  - ${def.role.padEnd(11)} ${def.email}`);
  }
}
