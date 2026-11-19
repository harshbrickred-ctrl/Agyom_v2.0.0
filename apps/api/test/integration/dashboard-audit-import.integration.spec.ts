import { beforeAll, describe, expect, it } from 'vitest';
import { api, assertApiUp, ensureUser, login, QA_PASS } from './helpers';
import {
  addCandidate,
  acceptOffer,
  bootstrapPersonas,
  createActiveAssignedRequirement,
  createOnboarding,
  ensureOfferReleased,
  selectWithEligibleLoi,
  uniqueSuffix,
  type Persona,
  type RoleKey,
} from './factories';

describe('Dashboard / Audit / Import (Phase E)', () => {
  let personas: Record<RoleKey, Persona>;
  let clientId: string;
  let jobFamilyId: string;

  beforeAll(async () => {
    await assertApiUp();
    const boot = await bootstrapPersonas();
    personas = boot.personas;
    clientId = boot.clientId;
    jobFamilyId = boot.jobFamilyId;

    // seed one joined for KPI assertions
    const req = await createActiveAssignedRequirement({
      sales: personas.SALES,
      ta: personas.TA,
      taLead: personas.TA_LEAD,
      clientId,
      jobFamilyId,
      positions: 2,
    });
    const { row } = await addCandidate(personas.TA.token, req.id);
    await selectWithEligibleLoi(personas.TA.token, row.id);
    const offerId = await ensureOfferReleased(personas.HR.token, row.id);
    await acceptOffer(personas.HR.token, offerId);
    const { onbId } = await createOnboarding(personas.HR, offerId);
    await api('POST', `/onboardings/${onbId}/status`, {
      token: personas.HR.token,
      body: {
        statusCode: 'JOINED',
        actualDoj: new Date().toISOString().slice(0, 10),
      },
    });
  }, 180_000);

  it('IT-DSH-001: POST dashboard any role returns 2xx', async () => {
    const res = await api('POST', '/dashboard', {
      token: personas.SALES.token,
      body: {},
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    expect(res.data).toBeTruthy();
  });

  it('IT-DSH-002: filters accepted without error', async () => {
    const res = await api('POST', '/dashboard', {
      token: personas.ADMIN.token,
      body: {
        clientId,
        salesOwnerId: personas.SALES.id,
        taOwnerId: personas.TA.id,
        priorityCode: 'HIGH',
      },
    });
    expect(res.status).toBeLessThan(300);
  });

  it('IT-DSH-003: admin KPI counts match the records behind each card', async () => {
    const res = await api('POST', '/dashboard', {
      token: personas.ADMIN.token,
      body: {},
    });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    const summary = res.data.summary;
    const lists = res.data.lists;
    const requirements = lists.requirements as { status: string }[];
    const countStatus = (status: string) =>
      requirements.filter((row) => row.status === status).length;

    expect(summary.activeRequirements).toBe(countStatus('ACTIVE'));
    expect(summary.onHoldRequirements).toBe(countStatus('ON_HOLD'));
    expect(summary.cancelledRequirements).toBe(countStatus('CANCELLED'));
    expect(summary.cancelledRequirements).toBe(lists.cancelledRequirements.length);
    expect(summary.closedRequirements).toBe(countStatus('CLOSED'));
    expect(summary.closedRequirements).toBe(
      (lists.closedRequirements as unknown[]).length,
    );
    expect(summary.totalRequirements).toBe(
      summary.activeRequirements +
        summary.onHoldRequirements +
        summary.cancelledRequirements,
    );

    const positionRows = lists.totalPositions as { status: string }[];
    const filledSeats = positionRows.filter((row) => row.status === 'CLOSED').length;
    expect(summary.totalPositions).toBe(positionRows.length);
    expect(summary.openPositions).toBe(lists.openPositions.length);
    expect(summary.totalPositions).toBe(lists.openPositions.length + filledSeats);

    expect(summary.closedPositions).toBe(lists.closedPositions.length);
    expect(summary.candidatesJoined).toBe(lists.candidatesJoined.length);
    expect(summary.closedPositions).toBe(summary.candidatesJoined);
    expect(summary.candidatesInPipeline).toBe(lists.candidatesInPipeline.length);
    expect(summary.selectedCandidates).toBe(lists.selectedCandidates.length);
    expect(summary.offersReleased).toBe(lists.offersReleased.length);
    expect(summary.offersAccepted).toBe(lists.offersAccepted.length);
    expect(summary.overdueRequirements).toBe(lists.overdueRequirements.length);
    expect(summary.wastedSourcing).toBe(lists.wastedSourcing.length);

    const candidateId = (row: { id?: string; candidateId?: string; candidate?: { id?: string } }) =>
      row.candidate?.id || row.candidateId || row.id;
    const stages = [
      lists.candidatesInPipeline,
      lists.selectedCandidates,
      lists.offersReleased,
      lists.offersAccepted,
      lists.candidatesJoined,
    ].map((rows: { id?: string; candidateId?: string; candidate?: { id?: string } }[]) =>
      new Set(rows.map(candidateId)),
    );
    const seen = new Set<string>();
    for (const stage of stages) {
      for (const id of stage) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it('IT-AUD-001/003: Admin sees audit; Sales 403', async () => {
    const ok = await api('GET', '/audit-logs?pageSize=5', {
      token: personas.ADMIN.token,
    });
    expect(ok.status).toBe(200);
    const deny = await api('GET', '/audit-logs', {
      token: personas.SALES.token,
    });
    expect(deny.status).toBe(403);
  });

  it('IT-IMP-001: validate missing columns → 400', async () => {
    const res = await api('POST', '/imports/validate', {
      token: personas.ADMIN.token,
      body: {
        entity: 'requirements',
        csv: 'foo,bar\n1,2\n',
      },
    });
    expect(res.status).toBe(400);
  });

  it('IT-IMP-002: validate too few rows → 400', async () => {
    const res = await api('POST', '/imports/validate', {
      token: personas.ADMIN.token,
      body: {
        entity: 'requirements',
        csv: 'requirementDate,clientName,roleSkill,jobFamilyName,numberOfPositions,salesOwnerEmail,priorityCode\n',
      },
    });
    expect(res.status).toBe(400);
  });

  it('IT-IMP-003: validate with row error returns report', async () => {
    const res = await api('POST', '/imports/validate', {
      token: personas.ADMIN.token,
      body: {
        entity: 'requirements',
        csv: 'requirementDate,clientName,roleSkill,jobFamilyName,numberOfPositions,salesOwnerEmail,priorityCode\n2026-01-01,QA Client Alpha,,QA Engineering,1,qa.sales@sst.test,HIGH\n',
      },
    });
    expect([200, 201]).toContain(res.status);
  });

  it('IT-IMP-008: non-Admin import 403', async () => {
    const res = await api('POST', '/imports/validate', {
      token: personas.TA.token,
      body: { entity: 'requirements', csv: 'a\nb\n' },
    });
    expect(res.status).toBe(403);
  });

  it('IT-DSH-004: joined candidate attributed to sourcing TA only when multi-TA', async () => {
    const adminToken = personas.ADMIN.token;
    const ta2 = await ensureUser(
      adminToken,
      'qa.ta2@sst.test',
      'QA TA Two',
      'TA',
    );
    const ta2Login = await login('qa.ta2@sst.test', QA_PASS);
    const ta2Persona = {
      id: ta2.id,
      email: ta2.email,
      role: 'TA' as const,
      token: ta2Login.accessToken,
    };

    const req = await createActiveAssignedRequirement({
      sales: personas.SALES,
      ta: personas.TA,
      taLead: personas.TA_LEAD,
      clientId,
      jobFamilyId,
      positions: 1,
      roleSkill: `Multi TA ${uniqueSuffix()}`,
    });
    const assign = await api('PATCH', `/requirements/${req.id}`, {
      token: personas.TA_LEAD.token,
      body: { taOwnerIds: [personas.TA.id, ta2Persona.id] },
    });
    expect(assign.status).toBeLessThan(400);

    const { row: cn1 } = await addCandidate(personas.TA.token, req.id);
    await selectWithEligibleLoi(personas.TA.token, cn1.id);
    const offerId = await ensureOfferReleased(personas.HR.token, cn1.id);
    await acceptOffer(personas.HR.token, offerId);
    const { onbId } = await createOnboarding(personas.HR, offerId);
    await api('POST', `/onboardings/${onbId}/status`, {
      token: personas.HR.token,
      body: {
        statusCode: 'JOINED',
        actualDoj: new Date().toISOString().slice(0, 10),
      },
    });

    const forTa1 = await api('POST', '/dashboard', {
      token: adminToken,
      body: { taOwnerId: personas.TA.id },
    });
    const forTa2 = await api('POST', '/dashboard', {
      token: adminToken,
      body: { taOwnerId: ta2Persona.id },
    });
    expect(forTa1.status).toBeLessThan(300);
    expect(forTa2.status).toBeLessThan(300);

    const joinedListTa1 = forTa1.data.lists.candidatesJoined as {
      candidate?: { id?: string };
      sourcedBy?: { id?: string };
    }[];
    expect(joinedListTa1.some((row) => row.candidate?.id === cn1.id)).toBe(true);
    expect(
      joinedListTa1.find((row) => row.candidate?.id === cn1.id)?.sourcedBy?.id,
    ).toBe(personas.TA.id);
    expect(forTa1.data.summary.candidatesJoined).toBeGreaterThanOrEqual(1);

    const joinedListTa2 = forTa2.data.lists.candidatesJoined as {
      candidate?: { id?: string };
    }[];
    expect(joinedListTa2.some((row) => row.candidate?.id === cn1.id)).toBe(false);

    const unfiltered = await api('POST', '/dashboard', {
      token: adminToken,
      body: {},
    });
    const allJoined = unfiltered.data.lists.candidatesJoined as {
      candidate?: { id?: string };
    }[];
    expect(allJoined.filter((row) => row.candidate?.id === cn1.id).length).toBe(1);

    const perf = unfiltered.data.ownerPerformance?.ta as {
      id: string;
      joined: number;
    }[];
    const ta1Perf = perf?.find((row) => row.id === personas.TA.id);
    expect(ta1Perf?.joined ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('IT-DSH-005: talent pool returns joined candidate from another requirement by email', async () => {
    const reqA = await createActiveAssignedRequirement({
      sales: personas.SALES,
      ta: personas.TA,
      taLead: personas.TA_LEAD,
      clientId,
      jobFamilyId,
      positions: 1,
      roleSkill: `Pool A ${uniqueSuffix()}`,
    });
    const reqB = await createActiveAssignedRequirement({
      sales: personas.SALES,
      ta: personas.TA,
      taLead: personas.TA_LEAD,
      clientId,
      jobFamilyId,
      positions: 1,
      roleSkill: `Pool B ${uniqueSuffix()}`,
    });

    const email = `joined.pool.${uniqueSuffix()}@sst.test`;
    const { row } = await addCandidate(personas.TA.token, reqA.id, {
      email,
      name: 'Joined Pool Cand',
    });
    await selectWithEligibleLoi(personas.TA.token, row.id);
    const offerId = await ensureOfferReleased(personas.HR.token, row.id);
    await acceptOffer(personas.HR.token, offerId);
    const { onbId } = await createOnboarding(personas.HR, offerId);
    await api('POST', `/onboardings/${onbId}/status`, {
      token: personas.HR.token,
      body: {
        statusCode: 'JOINED',
        actualDoj: new Date().toISOString().slice(0, 10),
      },
    });

    const pool = await api(
      'GET',
      `/candidates/talent-pool?requirementId=${reqB.id}&q=${encodeURIComponent(email)}`,
      { token: personas.TA.token },
    );
    expect(pool.status).toBeLessThan(300);
    const items = (pool.data?.items ?? pool.data) as { email?: string; pipelineStage?: string }[];
    const list = Array.isArray(items) ? items : [];
    expect(list.some((item) => String(item.email || '').toLowerCase() === email.toLowerCase())).toBe(true);
    const hit = list.find((item) => String(item.email || '').toLowerCase() === email.toLowerCase());
    expect(hit?.pipelineStage).toBe('JOINED');
  });
});
