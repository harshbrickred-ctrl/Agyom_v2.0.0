import { Injectable } from '@nestjs/common';
import {
  computeClosureStatus,
  computeTaHandoffSlaRag,
  daysBetween,
} from '@sst/shared-utils';
import { Prisma, Role } from '../prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from '../common/swagger/query.dto';

const percentage = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 10_000) / 10_000 : 0;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(query: DashboardQueryDto): Promise<Record<string, unknown>> {
    const [
      summary,
      breakdowns,
      escalations,
      positionsByClient,
      lists,
      ownerPerformance,
      taOwnerDaily,
    ] = await Promise.all([
      this.summary(query),
      this.breakdowns(query),
      this.escalations(query),
      this.positionsByClient(query),
      this.lists(query),
      this.ownerPerformance(query),
      this.taOwnerDaily(query),
    ]);

    return {
      summary,
      kpis: summary,
      breakdowns,
      escalations,
      requirementRagSummary: breakdowns.byRag,
      openPositionsOnClient: positionsByClient.openPositionsOnClient,
      closedPositionsOnClient: positionsByClient.closedPositionsOnClient,
      lists,
      ownerPerformance,
      taOwnerDaily,
    };
  }

  private dayStart(iso: string): Date {
    const date = new Date(iso);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  private dayEnd(iso: string): Date {
    const date = new Date(iso);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }

  /** Client / owner / family / priority scope without requirement-date bounds. */
  private requirementScopeDimensions(
    query: DashboardQueryDto,
  ): Prisma.RequirementWhereInput {
    return {
      deletedAt: null,
      ...(query.taOwnerId
        ? { taAssignments: { some: { userId: query.taOwnerId } } }
        : {}),
      ...(query.salesOwnerId ? { salesOwnerId: query.salesOwnerId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.jobFamilyId ? { jobFamilyId: query.jobFamilyId } : {}),
      ...(query.priorityCode ? { priorityCode: query.priorityCode } : {}),
    };
  }

  /**
   * Requirement dimension filters, including optional requirement date (from/to).
   * Does not apply profile-submitted bounds.
   */
  private requirementDimensions(
    query: DashboardQueryDto,
  ): Prisma.RequirementWhereInput {
    return {
      ...this.requirementScopeDimensions(query),
      ...(query.from || query.to
        ? {
            requirementDate: {
              ...(query.from ? { gte: this.dayStart(query.from) } : {}),
              ...(query.to ? { lte: this.dayEnd(query.to) } : {}),
            },
          }
        : {}),
    };
  }

  /** YYYY-MM-DD in UTC for bucketing calendar days. */
  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  /**
   * Activity window for TA daily monitoring.
   * Uses FilterBar from/to when set; otherwise last 30 UTC calendar days inclusive.
   */
  private activityWindow(query: DashboardQueryDto): { from: string; to: string } {
    if (query.from || query.to) {
      const from = query.from || query.to!;
      const to = query.to || query.from!;
      return { from, to };
    }
    const now = new Date();
    const toDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const fromDate = new Date(toDate);
    fromDate.setUTCDate(fromDate.getUTCDate() - 29);
    return {
      from: this.dayKey(fromDate),
      to: this.dayKey(toDate),
    };
  }

  /** Profile submitted window; falls back to createdAt when profileSubmittedDate is null. */
  private profileSubmittedFilter(
    query: DashboardQueryDto,
  ): Prisma.CandidateWhereInput | undefined {
    if (!query.profileSubmittedFrom && !query.profileSubmittedTo) return undefined;
    const profileRange: Prisma.DateTimeFilter = {
      ...(query.profileSubmittedFrom
        ? { gte: this.dayStart(query.profileSubmittedFrom) }
        : {}),
      ...(query.profileSubmittedTo
        ? { lte: this.dayEnd(query.profileSubmittedTo) }
        : {}),
    };
    const createdRange: Prisma.DateTimeFilter = {
      ...(query.profileSubmittedFrom
        ? { gte: this.dayStart(query.profileSubmittedFrom) }
        : {}),
      ...(query.profileSubmittedTo
        ? { lte: this.dayEnd(query.profileSubmittedTo) }
        : {}),
    };
    return {
      OR: [
        { profileSubmittedDate: profileRange },
        {
          AND: [
            { profileSubmittedDate: null },
            { createdAt: createdRange },
          ],
        },
      ],
    };
  }

  /**
   * Requirements in scope. Requirement date uses from/to.
   * When profileSubmittedFrom/To are set, only requirements that have at least
   * one candidate whose profile was submitted in that window.
   */
  private requirementWhere(
    query: DashboardQueryDto,
  ): Prisma.RequirementWhereInput {
    const profileFilter = this.profileSubmittedFilter(query);
    return {
      ...this.requirementDimensions(query),
      ...(profileFilter
        ? { candidates: { some: { deletedAt: null, ...profileFilter } } }
        : {}),
    };
  }

  /**
   * When filtering by TA, attribute candidate/person KPIs to the TA who sourced
   * the candidate — not every TA assigned to the requirement.
   */
  private sourcedByCandidateFilter(
    query: DashboardQueryDto,
  ): Prisma.CandidateWhereInput {
    if (!query.taOwnerId) return {};
    return { sourcedByUserId: query.taOwnerId };
  }

  /** Candidates in scope for pipeline / selected / sourced metrics. */
  private candidateWhere(
    query: DashboardQueryDto,
  ): Prisma.CandidateWhereInput {
    const profileFilter = this.profileSubmittedFilter(query);
    return {
      deletedAt: null,
      requirement: this.requirementDimensions(query),
      ...(profileFilter ?? {}),
      ...this.sourcedByCandidateFilter(query),
    };
  }

  private ownerFieldsFromRequirement(requirement: {
    taOwners?: Array<{ id: string; fullName: string; email?: string }>;
    taOwner?: { id: string; fullName: string; email?: string } | null;
    salesOwner?: { id: string; fullName: string; email?: string } | null;
  } | null | undefined) {
    const taOwners =
      requirement?.taOwners?.length
        ? requirement.taOwners
        : requirement?.taOwner
          ? [requirement.taOwner]
          : [];
    return {
      taOwners,
      salesOwner: requirement?.salesOwner ?? null,
    };
  }

  private sourcedByFields(sourcedBy: {
    id: string;
    fullName: string;
    email?: string;
  } | null | undefined) {
    return sourcedBy
      ? {
          id: sourcedBy.id,
          fullName: sourcedBy.fullName,
          email: sourcedBy.email,
        }
      : null;
  }

  async summary(query: DashboardQueryDto) {
    const requirements = await this.prisma.requirement.findMany({
      where: this.requirementWhere(query),
      select: {
        id: true,
        numberOfPositions: true,
        taHandoffDate: true,
        status: true,
        targetClosureDate: true,
        requirementDate: true,
      },
    });
    const reqIds = requirements.map((r) => r.id);

    const totalPositions = requirements
      .filter((r) => r.status !== 'CANCELLED')
      .reduce((s, r) => s + r.numberOfPositions, 0);
    const pendingSalesHandoff = requirements.filter(
      (r) => !r.taHandoffDate && r.status === 'ACTIVE',
    ).length;

    if (!reqIds.length) {
      return {
        totalRequirements: 0,
        activeRequirements: 0,
        onHoldRequirements: 0,
        totalPositions: 0,
        openPositions: 0,
        closedPositions: 0,
        pendingSalesHandoff: 0,
        candidatesInPipeline: 0,
        selectedCandidates: 0,
        duplicateMobiles: 0,
        offersReleased: 0,
        offersAccepted: 0,
        offersRejected: 0,
        candidatesJoined: 0,
        fillRate: 0,
        averageDaysToFill: null,
        requirementsAtRisk: 0,
        cancelledRequirements: 0,
        closedRequirements: 0,
        wastedSourcing: 0,
        overdueRequirements: 0,
      };
    }

    const candidateScope = this.candidateWhere(query);
    const profileFilter = this.profileSubmittedFilter(query);
    const personCandidateScope: Prisma.CandidateWhereInput = {
      deletedAt: null,
      ...(profileFilter ?? {}),
      ...this.sourcedByCandidateFilter(query),
    };
    /** All joins on scoped requirements — used for open-seat math. */
    const seatCandidateScope: Prisma.CandidateWhereInput = {
      deletedAt: null,
      ...(profileFilter ?? {}),
    };

    const [
      candidatesInPipeline,
      selectedCandidates,
      offersReleased,
      offersAccepted,
      offersRejected,
      duplicateMobileGroups,
      joinedOnboardings,
      seatJoinedOnboardings,
      sourcedRequirementGroups,
    ] = await Promise.all([
      this.prisma.candidate.count({
        where: {
          ...candidateScope,
          selected: false,
        },
      }),
      this.prisma.candidate.count({
        where: {
          ...candidateScope,
          selected: true,
          NOT: {
            OR: [
              { onboarding: { statusCode: 'JOINED', deletedAt: null } },
              {
                offer: {
                  deletedAt: null,
                  statusCode: { in: ['RELEASED', 'ACCEPTED'] },
                },
              },
            ],
          },
        },
      }),
      this.prisma.offer.count({
        where: {
          deletedAt: null,
          statusCode: 'RELEASED',
          requirementId: { in: reqIds },
          candidate: personCandidateScope,
        },
      }),
      this.prisma.offer.count({
        where: {
          deletedAt: null,
          statusCode: 'ACCEPTED',
          requirementId: { in: reqIds },
          candidate: personCandidateScope,
          NOT: {
            onboarding: { statusCode: 'JOINED', deletedAt: null },
          },
        },
      }),
      this.prisma.offer.count({
        where: {
          deletedAt: null,
          statusCode: 'DECLINED',
          requirementId: { in: reqIds },
          candidate: personCandidateScope,
        },
      }),
      this.prisma.candidate.groupBy({
        by: ['mobileNormalized'],
        where: candidateScope,
        _count: { _all: true },
      }),
      this.prisma.onboarding.findMany({
        where: {
          deletedAt: null,
          statusCode: 'JOINED',
          requirementId: { in: reqIds },
          candidate: personCandidateScope,
        },
        select: { requirementId: true, actualDoj: true },
      }),
      this.prisma.onboarding.findMany({
        where: {
          deletedAt: null,
          statusCode: 'JOINED',
          requirementId: { in: reqIds },
          candidate: seatCandidateScope,
        },
        select: { requirementId: true },
      }),
      this.prisma.candidate.groupBy({
        by: ['requirementId'],
        where: candidateScope,
        _count: { _all: true },
      }),
    ]);

    const candidatesJoined = joinedOnboardings.length;
    const closedPositions = candidatesJoined;
    // Fill rate uses org/requirement seat fills (not TA-attributed person KPI).
    const seatClosedPositions = seatJoinedOnboardings.length;
    const fillRate =
      totalPositions > 0 ? seatClosedPositions / totalPositions : 0;
    const requirementById = new Map(requirements.map((r) => [r.id, r]));
    const fillDurations = joinedOnboardings
      .map((onboarding) => {
        const requirement = requirementById.get(onboarding.requirementId);
        return requirement && onboarding.actualDoj
          ? daysBetween(requirement.requirementDate, onboarding.actualDoj)
          : -1;
      })
      .filter((days) => days >= 0);
    const averageDaysToFill = fillDurations.length
      ? Math.round(
          (fillDurations.reduce((sum, days) => sum + days, 0) /
            fillDurations.length) *
            10,
        ) / 10
      : null;
    const sourcedRequirementIds = new Set(
      sourcedRequirementGroups.map((group) => group.requirementId),
    );
    const joinedByRequirement = new Map<string, number>();
    for (const onboarding of seatJoinedOnboardings) {
      joinedByRequirement.set(
        onboarding.requirementId,
        (joinedByRequirement.get(onboarding.requirementId) ?? 0) + 1,
      );
    }
    const openPositions = requirements
      .filter((requirement) => requirement.status !== 'CANCELLED')
      .reduce((sum, requirement) => {
        const joined = Math.min(
          joinedByRequirement.get(requirement.id) ?? 0,
          requirement.numberOfPositions,
        );
        return sum + Math.max(0, requirement.numberOfPositions - joined);
      }, 0);

    let requirementsAtRisk = 0;
    let overdueRequirements = 0;
    for (const requirement of requirements) {
      const rag = computeTaHandoffSlaRag({
        requirementDate: requirement.requirementDate,
        taHandoffDate: requirement.taHandoffDate,
        targetClosureDate: requirement.targetClosureDate,
        status: requirement.status,
      });
      if (rag === 'RED') requirementsAtRisk += 1;

      const closure = computeClosureStatus({
        status: requirement.status,
        openPositions: Math.max(
          0,
          requirement.numberOfPositions -
            (joinedByRequirement.get(requirement.id) ?? 0),
        ),
        targetClosureDate: requirement.targetClosureDate,
      });
      if (closure === 'OVERDUE') overdueRequirements += 1;
    }
    const cancelled = requirements.filter(
      (requirement) => requirement.status === 'CANCELLED',
    );
    const closedReqs = requirements.filter(
      (requirement) => requirement.status === 'CLOSED',
    );
    const activeRequirements = requirements.filter(
      (requirement) => requirement.status === 'ACTIVE',
    ).length;
    const onHoldRequirements = requirements.filter(
      (requirement) => requirement.status === 'ON_HOLD',
    ).length;

    return {
      totalRequirements: activeRequirements + onHoldRequirements + cancelled.length,
      activeRequirements,
      onHoldRequirements,
      totalPositions,
      openPositions,
      closedPositions,
      pendingSalesHandoff,
      candidatesInPipeline,
      selectedCandidates,
      duplicateMobiles: duplicateMobileGroups.filter(
        (group) => group._count._all > 1,
      ).length,
      offersReleased,
      offersAccepted,
      offersRejected,
      candidatesJoined,
      fillRate: Math.round(fillRate * 10000) / 10000,
      averageDaysToFill,
      requirementsAtRisk,
      cancelledRequirements: cancelled.length,
      closedRequirements: closedReqs.length,
      wastedSourcing: cancelled.filter(
        (requirement) =>
          requirement.taHandoffDate != null ||
          sourcedRequirementIds.has(requirement.id),
      ).length,
      overdueRequirements,
    };
  }

  async lists(query: DashboardQueryDto): Promise<Record<string, unknown>> {
    const ownerUserSelect = {
      id: true,
      fullName: true,
      email: true,
    };

    const requirementOwnerSelect = {
      id: true,
      publicId: true,
      roleSkill: true,
      client: { select: { id: true, name: true } },
      salesOwner: { select: ownerUserSelect },
      taOwner: { select: ownerUserSelect },
      taAssignments: {
        select: {
          isPrimary: true,
          user: { select: ownerUserSelect },
        },
        orderBy: [
          { isPrimary: 'desc' as const },
          { assignedAt: 'asc' as const },
        ],
      },
    };

    const candidateSelect = {
      id: true,
      publicId: true,
      name: true,
      email: true,
      mobile: true,
      mobileNormalized: true,
      stageCode: true,
      selected: true,
      profileSubmittedDate: true,
      requirementId: true,
      sourcedByUserId: true,
      sourcedBy: { select: ownerUserSelect },
      requirement: { select: requirementOwnerSelect },
    };

    const offerSelect = {
      id: true,
      publicId: true,
      statusCode: true,
      ctcRate: true,
      expectedDoj: true,
      offerReleasedDate: true,
      candidateId: true,
      requirementId: true,
      candidate: {
        select: {
          id: true,
          publicId: true,
          name: true,
          email: true,
          profileSubmittedDate: true,
          sourcedByUserId: true,
          sourcedBy: { select: ownerUserSelect },
        },
      },
      requirement: { select: requirementOwnerSelect },
    };

    const requirementSelect = {
      id: true,
      publicId: true,
      roleSkill: true,
      status: true,
      priorityCode: true,
      numberOfPositions: true,
      requirementDate: true,
      taHandoffDate: true,
      targetClosureDate: true,
      client: { select: { id: true, name: true } },
      taOwner: { select: { id: true, fullName: true, email: true } },
      salesOwner: { select: { id: true, fullName: true, email: true } },
      jobFamily: { select: { id: true, name: true } },
      taAssignments: {
        select: {
          isPrimary: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
        orderBy: [
          { isPrimary: 'desc' as const },
          { assignedAt: 'asc' as const },
        ],
      },
    };

    const [
      taOwners,
      salesOwners,
      clients,
      jobFamilies,
      priorities,
      rawRequirements,
      candidatesInPipeline,
      selectedCandidates,
      offersReleased,
      offersAccepted,
      offersRejected,
      candidatesJoined,
      allCandidatesForDupes,
    ] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'TA', deletedAt: null, isActive: true },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { role: 'SALES', deletedAt: null, isActive: true },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.client.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.jobFamily.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.lookupValue.findMany({
        where: { lookupType: { code: 'PRIORITY' }, isActive: true },
        select: { code: true, label: true },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.requirement.findMany({
        where: this.requirementWhere(query),
        select: requirementSelect as Prisma.RequirementSelect,
        orderBy: { requirementDate: 'desc' },
      }),
      this.prisma.candidate.findMany({
        where: {
          ...this.candidateWhere(query),
          selected: false,
        },
        select: candidateSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.candidate.findMany({
        where: {
          ...this.candidateWhere(query),
          selected: true,
          NOT: {
            OR: [
              { onboarding: { statusCode: 'JOINED', deletedAt: null } },
              {
                offer: {
                  deletedAt: null,
                  statusCode: { in: ['RELEASED', 'ACCEPTED'] },
                },
              },
            ],
          },
        },
        select: candidateSelect,
        orderBy: { selectedAt: 'desc' },
      }),
      this.prisma.offer.findMany({
        where: {
          deletedAt: null,
          statusCode: 'RELEASED',
          requirement: this.requirementWhere(query),
          candidate: {
            deletedAt: null,
            ...(this.profileSubmittedFilter(query) ?? {}),
            ...this.sourcedByCandidateFilter(query),
          },
        },
        select: offerSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.offer.findMany({
        where: {
          deletedAt: null,
          statusCode: 'ACCEPTED',
          requirement: this.requirementWhere(query),
          candidate: {
            deletedAt: null,
            ...(this.profileSubmittedFilter(query) ?? {}),
            ...this.sourcedByCandidateFilter(query),
          },
          NOT: {
            onboarding: { statusCode: 'JOINED', deletedAt: null },
          },
        },
        select: offerSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.offer.findMany({
        where: {
          deletedAt: null,
          statusCode: 'DECLINED',
          requirement: this.requirementWhere(query),
          candidate: {
            deletedAt: null,
            ...(this.profileSubmittedFilter(query) ?? {}),
            ...this.sourcedByCandidateFilter(query),
          },
        },
        select: offerSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.onboarding.findMany({
        where: {
          deletedAt: null,
          statusCode: 'JOINED',
          requirement: this.requirementWhere(query),
          candidate: {
            deletedAt: null,
            ...(this.profileSubmittedFilter(query) ?? {}),
            ...this.sourcedByCandidateFilter(query),
          },
        },
        select: {
          id: true,
          publicId: true,
          statusCode: true,
          actualDoj: true,
          expectedDoj: true,
          candidate: {
            select: {
              id: true,
              publicId: true,
              name: true,
              email: true,
              profileSubmittedDate: true,
              sourcedByUserId: true,
              sourcedBy: { select: ownerUserSelect },
            },
          },
          requirement: { select: requirementOwnerSelect },
          offer: { select: { id: true, publicId: true, statusCode: true } },
        },
        orderBy: { actualDoj: 'desc' },
      }),
      this.prisma.candidate.findMany({
        where: this.candidateWhere(query),
        select: {
          id: true,
          publicId: true,
          name: true,
          email: true,
          mobile: true,
          mobileNormalized: true,
          requirementId: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const mapRequirementOwners = (r: any) => {
      const taOwnersList = (r.taAssignments ?? []).map(
        (a: { user: { id: string; fullName: string; email: string } }) => ({
          id: a.user.id,
          fullName: a.user.fullName,
          email: a.user.email,
        }),
      );
      const primary =
        taOwnersList.find(
          (t: { id: string }) => t.id === r.taOwner?.id,
        ) ??
        taOwnersList[0] ??
        r.taOwner ??
        null;
      const { taAssignments: _a, ...rest } = r;
      return {
        ...rest,
        taOwners: taOwnersList.length
          ? taOwnersList
          : primary
            ? [primary]
            : [],
        taOwner: primary,
        taOwnerId: primary?.id ?? null,
      };
    };

    const attachListOwners = <T extends Record<string, any>>(row: T) => {
      const requirement = row.requirement
        ? mapRequirementOwners(row.requirement)
        : null;
      const owners = this.ownerFieldsFromRequirement(requirement);
      const sourcedBy =
        this.sourcedByFields(row.sourcedBy)
        ?? this.sourcedByFields(row.candidate?.sourcedBy)
        ?? null;
      return {
        ...row,
        requirement,
        candidateName: row.candidateName ?? row.candidate?.name ?? row.name ?? null,
        profileSubmittedDate:
          row.profileSubmittedDate
          ?? row.candidate?.profileSubmittedDate
          ?? null,
        sourcedBy,
        taOwners: owners.taOwners,
        salesOwner: owners.salesOwner,
      };
    };

    const requirements = (rawRequirements as any[]).map(mapRequirementOwners);

    const reqIds = requirements.map((r) => r.id);
    const mobileCounts = new Map<string, number>();
    for (const c of allCandidatesForDupes) {
      if (!c.mobileNormalized) continue;
      mobileCounts.set(
        c.mobileNormalized,
        (mobileCounts.get(c.mobileNormalized) ?? 0) + 1,
      );
    }
    const duplicateMobileKeys = [...mobileCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([mobile]) => mobile);

    const joinedGroups = reqIds.length
      ? await this.prisma.onboarding.groupBy({
          by: ['requirementId'],
          where: {
            requirementId: { in: reqIds },
            statusCode: 'JOINED',
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const closedMap = new Map(
      joinedGroups.map((g) => [g.requirementId, g._count._all]),
    );

    const pendingSalesHandoff = requirements.filter(
      (r) => !r.taHandoffDate && r.status === 'ACTIVE',
    );
    const cancelledRequirements = requirements.filter(
      (r) => r.status === 'CANCELLED',
    );
    const closedRequirements = requirements.filter(
      (r) => r.status === 'CLOSED',
    );
    const sourcedRequirementIds = new Set(
      allCandidatesForDupes.map((c) => c.requirementId),
    );
    const wastedSourcing = cancelledRequirements.filter(
      (r) => r.taHandoffDate != null || sourcedRequirementIds.has(r.id),
    );
    const requirementsAtRisk = requirements.filter((r) => {
      const rag = computeTaHandoffSlaRag({
        requirementDate: r.requirementDate,
        taHandoffDate: r.taHandoffDate,
        targetClosureDate: r.targetClosureDate,
        status: r.status,
      });
      return rag === 'RED';
    });
    const overdueRequirements = requirements.filter((r) => {
      const closed = closedMap.get(r.id) ?? 0;
      const open = Math.max(0, r.numberOfPositions - closed);
      return (
        computeClosureStatus({
          status: r.status,
          openPositions: open,
          targetClosureDate: r.targetClosureDate,
        }) === 'OVERDUE'
      );
    });

    const duplicateMobiles = duplicateMobileKeys.map((mobileNormalized) => {
      const members = allCandidatesForDupes.filter(
        (c) => c.mobileNormalized === mobileNormalized,
      );
      return {
        mobileNormalized,
        count: members.length,
        candidates: members,
      };
    });

    const joinedByRequirement = new Map<string, typeof candidatesJoined>();
    for (const joined of candidatesJoined) {
      const requirementId = joined.requirement?.id;
      if (!requirementId) continue;
      const bucket = joinedByRequirement.get(requirementId) ?? [];
      bucket.push(joined);
      joinedByRequirement.set(requirementId, bucket);
    }

    const activeRequirements = requirements.filter(
      (r) => r.status !== 'CANCELLED',
    );
    const totalPositions: Array<Record<string, unknown>> = [];
    const openPositions: Array<Record<string, unknown>> = [];
    const fillRate: Array<Record<string, unknown>> = [];

    for (const requirement of activeRequirements) {
      const closedCount = closedMap.get(requirement.id) ?? 0;
      const closedForReq = Math.min(closedCount, requirement.numberOfPositions);
      const openForReq = Math.max(
        0,
        requirement.numberOfPositions - closedForReq,
      );
      const queue = [...(joinedByRequirement.get(requirement.id) ?? [])];

      fillRate.push({
        id: requirement.id,
        publicId: requirement.publicId,
        roleSkill: requirement.roleSkill,
        status: requirement.status,
        client: requirement.client,
        numberOfPositions: requirement.numberOfPositions,
        closedPositions: closedForReq,
        openPositions: openForReq,
        fillRate:
          requirement.numberOfPositions > 0
            ? Math.round(
                (closedForReq / requirement.numberOfPositions) * 10_000,
              ) / 10_000
            : 0,
      });

      for (
        let positionIndex = 1;
        positionIndex <= requirement.numberOfPositions;
        positionIndex += 1
      ) {
        const isClosed = positionIndex <= closedForReq;
        const joined = isClosed ? (queue.shift() ?? null) : null;
        const row = {
          id: `${requirement.id}:${positionIndex}`,
          requirementId: requirement.id,
          publicId: requirement.publicId,
          roleSkill: requirement.roleSkill,
          status: isClosed ? 'CLOSED' : 'OPEN',
          positionIndex,
          numberOfPositions: requirement.numberOfPositions,
          client: requirement.client,
          taOwner: requirement.taOwner,
          taOwners: requirement.taOwners ?? [],
          salesOwner: requirement.salesOwner,
          joined: joined
            ? {
                id: joined.id,
                publicId: joined.publicId,
                actualDoj: joined.actualDoj,
                candidate: joined.candidate,
              }
            : null,
        };
        totalPositions.push(row);
        if (!isClosed) openPositions.push(row);
      }
    }

    const closedPositions = candidatesJoined.map((joined) => {
      const requirement = requirements.find(
        (r) => r.id === joined.requirement?.id,
      );
      const daysToFill =
        requirement && joined.actualDoj
          ? daysBetween(requirement.requirementDate, joined.actualDoj)
          : null;
      const owners = this.ownerFieldsFromRequirement(requirement);
      return {
        ...joined,
        daysToFill: daysToFill != null && daysToFill >= 0 ? daysToFill : null,
        requirementDate: requirement?.requirementDate ?? null,
        client: joined.requirement?.client ?? requirement?.client ?? null,
        roleSkill: joined.requirement?.roleSkill ?? requirement?.roleSkill ?? null,
        candidateName: joined.candidate?.name ?? null,
        profileSubmittedDate: joined.candidate?.profileSubmittedDate ?? null,
        sourcedBy: this.sourcedByFields(joined.candidate?.sourcedBy),
        taOwners: owners.taOwners,
        salesOwner: owners.salesOwner ?? requirement?.salesOwner ?? null,
      };
    });

    const averageDaysToFill = closedPositions.filter(
      (row) => row.daysToFill != null,
    );

    return {
      filters: {
        taOwners,
        salesOwners,
        clients,
        jobFamilies,
        priorities,
      },
      requirements,
      totalPositions,
      openPositions,
      closedPositions,
      fillRate,
      averageDaysToFill,
      pendingSalesHandoff,
      candidatesInPipeline: candidatesInPipeline.map(attachListOwners),
      selectedCandidates: selectedCandidates.map(attachListOwners),
      offersReleased: offersReleased.map(attachListOwners),
      offersAccepted: offersAccepted.map(attachListOwners),
      offersRejected: offersRejected.map(attachListOwners),
      candidatesJoined: candidatesJoined.map(attachListOwners),
      cancelledRequirements,
      closedRequirements,
      requirementsAtRisk,
      overdueRequirements,
      wastedSourcing,
      duplicateMobiles,
    };
  }

  async breakdowns(query: DashboardQueryDto) {
    const requirements = await this.prisma.requirement.findMany({
      where: this.requirementWhere(query),
    });
    const reqIds = requirements.map((r) => r.id);

    const [stageGroups, stageLookups, joinedGroups] = await Promise.all([
      reqIds.length
        ? this.prisma.candidate.groupBy({
            by: ['stageCode'],
            where: this.candidateWhere(query),
            _count: { _all: true },
          })
        : [],
      this.prisma.lookupValue.findMany({
        where: {
          lookupType: { code: 'CANDIDATE_STAGE' },
          isActive: true,
        },
        select: { code: true, label: true },
        orderBy: { sortOrder: 'asc' },
      }),
      reqIds.length
        ? this.prisma.onboarding.groupBy({
            by: ['requirementId'],
            where: {
              requirementId: { in: reqIds },
              statusCode: 'JOINED',
              deletedAt: null,
            },
            _count: { _all: true },
          })
        : [],
    ]);

    const ragCounts = { GREEN: 0, AMBER: 0, RED: 0, NONE: 0 };
    const closureCounts = {
      ON_TRACK: 0,
      OVERDUE: 0,
      FILLED: 0,
      CANCELLED: 0,
      ON_HOLD: 0,
    };

    const closedMap = new Map(
      joinedGroups.map((g) => [g.requirementId, g._count._all]),
    );

    for (const r of requirements) {
      const rag = computeTaHandoffSlaRag({
        requirementDate: r.requirementDate,
        taHandoffDate: r.taHandoffDate,
        targetClosureDate: r.targetClosureDate,
        status: r.status,
      });
      ragCounts[rag] += 1;

      const closed = closedMap.get(r.id) ?? 0;
      const open = Math.max(0, r.numberOfPositions - closed);
      const closure = computeClosureStatus({
        status: r.status,
        openPositions: open,
        targetClosureDate: r.targetClosureDate,
      });
      closureCounts[closure] += 1;
    }

    const stageCountMap = new Map(
      stageGroups.map((group) => [group.stageCode, group._count._all]),
    );
    const stageTotal = stageGroups.reduce(
      (total, group) => total + group._count._all,
      0,
    );
    const knownStageCodes = new Set(stageLookups.map((stage) => stage.code));
    const byStage = [
      ...stageLookups.map((stage) => {
        const count = stageCountMap.get(stage.code) ?? 0;
        return {
          stageCode: stage.code,
          label: stage.label,
          count,
          percentage: percentage(count, stageTotal),
        };
      }),
      ...stageGroups
        .filter((group) => !knownStageCodes.has(group.stageCode))
        .map((group) => ({
          stageCode: group.stageCode,
          label: group.stageCode,
          count: group._count._all,
          percentage: percentage(group._count._all, stageTotal),
        })),
    ];

    return {
      byStage,
      byRag: Object.entries(ragCounts).map(([rag, count]) => ({
        rag,
        count,
        percentage: percentage(count, requirements.length),
      })),
      byClosureStatus: Object.entries(closureCounts).map(
        ([closureStatus, count]) => ({
          closureStatus,
          count,
          percentage: percentage(count, requirements.length),
        }),
      ),
    };
  }

  async positionsByClient(query: DashboardQueryDto) {
    const requirements = await this.prisma.requirement.findMany({
      where: this.requirementWhere(query),
      select: {
        id: true,
        clientId: true,
        numberOfPositions: true,
        status: true,
        client: { select: { id: true, name: true } },
      },
    });

    if (!requirements.length) {
      return { openPositionsOnClient: [], closedPositionsOnClient: [] };
    }

    const joinedGroups = await this.prisma.onboarding.groupBy({
      by: ['requirementId'],
      where: {
        requirementId: { in: requirements.map((r) => r.id) },
        statusCode: 'JOINED',
        deletedAt: null,
      },
      _count: { _all: true },
    });
    const closedMap = new Map(
      joinedGroups.map((g) => [g.requirementId, g._count._all]),
    );

    type ClientAgg = {
      clientId: string;
      client: string;
      openPositions: number;
      closedPositions: number;
    };
    const byClient = new Map<string, ClientAgg>();

    for (const requirement of requirements) {
      const closed = closedMap.get(requirement.id) ?? 0;
      const open =
        requirement.status === 'CANCELLED'
          ? 0
          : Math.max(0, requirement.numberOfPositions - closed);

      const existing = byClient.get(requirement.clientId) ?? {
        clientId: requirement.client.id,
        client: requirement.client.name,
        openPositions: 0,
        closedPositions: 0,
      };
      existing.openPositions += open;
      existing.closedPositions += closed;
      byClient.set(requirement.clientId, existing);
    }

    const clients = [...byClient.values()].sort((a, b) =>
      a.client.localeCompare(b.client),
    );

    return {
      openPositionsOnClient: clients
        .filter((c) => c.openPositions > 0)
        .map(({ clientId, client, openPositions }) => ({
          clientId,
          client,
          openPositions,
        })),
      closedPositionsOnClient: clients
        .filter((c) => c.closedPositions > 0)
        .map(({ clientId, client, closedPositions }) => ({
          clientId,
          client,
          closedPositions,
        })),
    };
  }

  async escalations(query: DashboardQueryDto) {
    const requirements = await this.prisma.requirement.findMany({
      where: this.requirementWhere(query),
      include: {
        client: true,
        candidates: {
          where: { deletedAt: null },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { requirementDate: 'asc' },
    });

    const joinedGroups = requirements.length
      ? await this.prisma.onboarding.groupBy({
          by: ['requirementId'],
          where: {
            requirementId: { in: requirements.map((r) => r.id) },
            statusCode: 'JOINED',
            deletedAt: null,
          },
          _count: { _all: true },
        })
      : [];
    const closedMap = new Map(
      joinedGroups.map((g) => [g.requirementId, g._count._all]),
    );

    const atRisk: typeof requirements = [];
    const overdue: typeof requirements = [];
    const closureOverdue: typeof requirements = [];
    for (const r of requirements) {
      const rag = computeTaHandoffSlaRag({
        requirementDate: r.requirementDate,
        taHandoffDate: r.taHandoffDate,
        targetClosureDate: r.targetClosureDate,
        status: r.status,
      });
      if (rag === 'AMBER') atRisk.push(r);
      if (rag === 'RED') overdue.push(r);

      const closed = closedMap.get(r.id) ?? 0;
      const open = Math.max(0, r.numberOfPositions - closed);
      const closure = computeClosureStatus({
        status: r.status,
        openPositions: open,
        targetClosureDate: r.targetClosureDate,
      });
      if (closure === 'OVERDUE') closureOverdue.push(r);
    }

    const cancelled = requirements.filter((r) => r.status === 'CANCELLED');
    const wasted = cancelled.filter(
      (r) => r.taHandoffDate != null || r.candidates.length > 0,
    );
    const toItem = (r: (typeof requirements)[number]) => ({
      id: r.id,
      publicId: r.publicId,
      roleSkill: r.roleSkill,
      client: r.client.name,
      requirementDate: r.requirementDate,
      targetClosureDate: r.targetClosureDate,
      openPositions: Math.max(
        0,
        r.numberOfPositions - (closedMap.get(r.id) ?? 0),
      ),
    });

    return {
      atRisk: atRisk.map(toItem),
      overdue: overdue.map(toItem),
      closureOverdue: closureOverdue.map(toItem),
      cancelled: cancelled.map(toItem),
      wasted: wasted.map(toItem),
    };
  }

  async ownerPerformance(query: DashboardQueryDto) {
    const requirements = await this.prisma.requirement.findMany({
      where: this.requirementWhere(query),
      select: {
        id: true,
        status: true,
        numberOfPositions: true,
        salesOwner: { select: { id: true, fullName: true } },
        taOwner: { select: { id: true, fullName: true } },
        taAssignments: {
          select: {
            isPrimary: true,
            user: { select: { id: true, fullName: true } },
          },
          orderBy: [
            { isPrimary: 'desc' as const },
            { assignedAt: 'asc' as const },
          ],
        },
      },
    });

    const counted = requirements.filter((requirement) => requirement.status !== 'CANCELLED');
    const ids = counted.map((requirement) => requirement.id);
    const profileFilter = this.profileSubmittedFilter(query);
    const primaryTaFor = (requirement: (typeof counted)[number]) =>
      requirement.taAssignments.find((assignment) => assignment.isPrimary)?.user ??
      requirement.taAssignments[0]?.user ??
      requirement.taOwner ??
      null;

    const [candidates, joinedRows, salesUsers, taUsers, seatJoinedGroups] =
      await Promise.all([
        ids.length
          ? this.prisma.candidate.findMany({
              where: {
                deletedAt: null,
                requirementId: { in: ids },
                ...(profileFilter ?? {}),
                ...this.sourcedByCandidateFilter(query),
              },
              select: {
                requirementId: true,
                selected: true,
                sourcedByUserId: true,
                sourcedBy: { select: { id: true, fullName: true } },
              },
            })
          : [],
        ids.length
          ? this.prisma.onboarding.findMany({
              where: {
                deletedAt: null,
                statusCode: 'JOINED',
                requirementId: { in: ids },
                candidate: {
                  deletedAt: null,
                  ...(profileFilter ?? {}),
                  ...this.sourcedByCandidateFilter(query),
                },
              },
              select: {
                requirementId: true,
                candidate: {
                  select: {
                    sourcedByUserId: true,
                    sourcedBy: { select: { id: true, fullName: true } },
                  },
                },
              },
            })
          : [],
        this.prisma.user.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            role: { in: [Role.SALES, Role.SALES_LEAD] },
          },
          select: { id: true, fullName: true },
          orderBy: { fullName: 'asc' },
        }),
        this.prisma.user.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            role: { in: [Role.TA, Role.TA_LEAD] },
          },
          select: { id: true, fullName: true },
          orderBy: { fullName: 'asc' },
        }),
        ids.length
          ? this.prisma.onboarding.groupBy({
              by: ['requirementId'],
              where: {
                deletedAt: null,
                statusCode: 'JOINED',
                requirementId: { in: ids },
              },
              _count: { _all: true },
            })
          : [],
      ]);

    const seatJoinedMap = new Map(
      seatJoinedGroups.map((group) => [group.requirementId, group._count._all]),
    );
    const requirementById = new Map(counted.map((r) => [r.id, r]));

    type OwnerBucket = {
      id: string;
      name: string;
      requirements: number;
      positions: number;
      candidates: number;
      selected: number;
      openPositions: number;
      joined: number;
    };
    const blankBucket = (owner: { id: string; fullName: string }): OwnerBucket => ({
      id: owner.id,
      name: owner.fullName,
      requirements: 0,
      positions: 0,
      candidates: 0,
      selected: 0,
      openPositions: 0,
      joined: 0,
    });
    const ensureBucket = (
      buckets: Map<string, OwnerBucket>,
      owner: { id: string; fullName: string },
    ) => {
      const existing = buckets.get(owner.id);
      if (existing) return existing;
      const created = blankBucket(owner);
      buckets.set(owner.id, created);
      return created;
    };

    const salesBuckets = new Map<string, OwnerBucket>(
      salesUsers.map((owner) => [owner.id, blankBucket(owner)]),
    );
    const taBuckets = new Map<string, OwnerBucket>(
      taUsers.map((owner) => [owner.id, blankBucket(owner)]),
    );

    // Requirement / seat metrics stay on sales owner and primary TA.
    for (const requirement of counted) {
      if (requirement.salesOwner) {
        const salesBucket = ensureBucket(salesBuckets, requirement.salesOwner);
        const seatJoined = seatJoinedMap.get(requirement.id) ?? 0;
        salesBucket.requirements += 1;
        salesBucket.positions += requirement.numberOfPositions;
        if (requirement.status === 'ACTIVE' || requirement.status === 'ON_HOLD') {
          salesBucket.openPositions += Math.max(
            0,
            requirement.numberOfPositions - seatJoined,
          );
        }
      }
      const primaryTa = primaryTaFor(requirement);
      if (primaryTa) {
        const taBucket = ensureBucket(taBuckets, primaryTa);
        const seatJoined = seatJoinedMap.get(requirement.id) ?? 0;
        taBucket.requirements += 1;
        taBucket.positions += requirement.numberOfPositions;
        if (requirement.status === 'ACTIVE' || requirement.status === 'ON_HOLD') {
          taBucket.openPositions += Math.max(
            0,
            requirement.numberOfPositions - seatJoined,
          );
        }
      }
    }

    // Candidate metrics: sales still roll up by requirement; TA by sourcedBy.
    const salesCandidateMap = new Map<string, { candidates: number; selected: number; joined: number }>();
    for (const candidate of candidates) {
      const requirement = requirementById.get(candidate.requirementId);
      if (!requirement?.salesOwner) continue;
      const row = salesCandidateMap.get(requirement.salesOwner.id) ?? {
        candidates: 0,
        selected: 0,
        joined: 0,
      };
      row.candidates += 1;
      if (candidate.selected) row.selected += 1;
      salesCandidateMap.set(requirement.salesOwner.id, row);
    }
    for (const joined of joinedRows) {
      const requirement = requirementById.get(joined.requirementId);
      if (!requirement?.salesOwner) continue;
      const row = salesCandidateMap.get(requirement.salesOwner.id) ?? {
        candidates: 0,
        selected: 0,
        joined: 0,
      };
      row.joined += 1;
      salesCandidateMap.set(requirement.salesOwner.id, row);
    }
    for (const [ownerId, counts] of salesCandidateMap) {
      const bucket = salesBuckets.get(ownerId);
      if (!bucket) continue;
      bucket.candidates += counts.candidates;
      bucket.selected += counts.selected;
      bucket.joined += counts.joined;
    }

    for (const candidate of candidates) {
      const requirement = requirementById.get(candidate.requirementId);
      const owner =
        candidate.sourcedBy ??
        (requirement ? primaryTaFor(requirement) : null);
      if (!owner) continue;
      if (query.taOwnerId && owner.id !== query.taOwnerId) continue;
      const bucket = ensureBucket(taBuckets, owner);
      bucket.candidates += 1;
      if (candidate.selected) bucket.selected += 1;
    }
    for (const joined of joinedRows) {
      const requirement = requirementById.get(joined.requirementId);
      const owner =
        joined.candidate?.sourcedBy ??
        (requirement ? primaryTaFor(requirement) : null);
      if (!owner) continue;
      if (query.taOwnerId && owner.id !== query.taOwnerId) continue;
      const bucket = ensureBucket(taBuckets, owner);
      bucket.joined += 1;
    }

    const sourcedPerPosition = (candidates: number, positions: number) =>
      positions > 0 ? Math.round((candidates / positions) * 10) / 10 : 0;

    const sales = [...salesBuckets.values()]
      .sort(
        (a, b) =>
          b.positions - a.positions || a.name.localeCompare(b.name),
      )
      .map((row) => ({
        id: row.id,
        name: row.name,
        positionsRaised: row.positions,
        candidatesSourced: row.candidates,
        selectedCandidates: row.selected,
      }));

    const ta = [...taBuckets.values()]
      .sort(
        (a, b) =>
          b.candidates - a.candidates || a.name.localeCompare(b.name),
      )
      .map((row) => ({
        id: row.id,
        name: row.name,
        requirements: row.requirements,
        positionsAssigned: row.positions,
        candidatesSourced: row.candidates,
        selectedCandidates: row.selected,
        sourcedPerPosition: sourcedPerPosition(row.candidates, row.positions),
        openPositions: row.openPositions,
        joined: row.joined,
      }));

    const taTotal = ta.reduce(
      (total, row) => {
        total.requirements += row.requirements;
        total.positionsAssigned += row.positionsAssigned;
        total.candidatesSourced += row.candidatesSourced;
        total.selectedCandidates += row.selectedCandidates;
        total.openPositions += row.openPositions;
        total.joined += row.joined;
        return total;
      },
      {
        requirements: 0,
        positionsAssigned: 0,
        candidatesSourced: 0,
        selectedCandidates: 0,
        sourcedPerPosition: 0,
        openPositions: 0,
        joined: 0,
      },
    );
    taTotal.sourcedPerPosition = sourcedPerPosition(
      taTotal.candidatesSourced,
      taTotal.positionsAssigned,
    );

    return { sales, ta, taTotal };
  }

  /**
   * Per-TA per-day activity for monitoring.
   * Positions Assigned → assignment assignedAt; Sourced → profileSubmittedDate|createdAt;
   * Selected → selectedAt only. FilterBar from/to bound the activity window (default 30 days).
   */
  async taOwnerDaily(query: DashboardQueryDto) {
    const window = this.activityWindow(query);
    const fromStart = this.dayStart(window.from);
    const toEnd = this.dayEnd(window.to);
    const scope: Prisma.RequirementWhereInput = {
      ...this.requirementScopeDimensions(query),
      status: { not: 'CANCELLED' },
    };
    const profileFilter = this.profileSubmittedFilter(query);

    type DailyBucket = {
      date: string;
      taOwnerId: string;
      taOwnerName: string;
      positionsAssigned: number;
      candidatesSourced: number;
      selectedCandidates: number;
    };
    const buckets = new Map<string, DailyBucket>();
    const bump = (
      date: string,
      owner: { id: string; fullName: string },
      field: 'positionsAssigned' | 'candidatesSourced' | 'selectedCandidates',
      amount: number,
    ) => {
      if (!owner || amount === 0) return;
      if (query.taOwnerId && owner.id !== query.taOwnerId) return;
      const key = `${date}|${owner.id}`;
      const row = buckets.get(key) ?? {
        date,
        taOwnerId: owner.id,
        taOwnerName: owner.fullName,
        positionsAssigned: 0,
        candidatesSourced: 0,
        selectedCandidates: 0,
      };
      row[field] += amount;
      buckets.set(key, row);
    };

    const resolvePrimaryTa = (requirement: {
      taOwner: { id: string; fullName: string } | null;
      taAssignments: Array<{
        isPrimary: boolean;
        user: { id: string; fullName: string };
      }>;
    }): { id: string; fullName: string } | null =>
      requirement.taAssignments.find((assignment) => assignment.isPrimary)?.user ??
      requirement.taAssignments[0]?.user ??
      requirement.taOwner ??
      null;

    const [assignments, candidates] = await Promise.all([
      this.prisma.requirementTaAssignment.findMany({
        where: {
          assignedAt: { gte: fromStart, lte: toEnd },
          ...(query.taOwnerId ? { userId: query.taOwnerId } : {}),
          user: {
            deletedAt: null,
            isActive: true,
            role: { in: [Role.TA, Role.TA_LEAD] },
          },
          requirement: scope,
        },
        select: {
          assignedAt: true,
          user: { select: { id: true, fullName: true } },
          requirement: { select: { numberOfPositions: true } },
        },
      }),
      this.prisma.candidate.findMany({
        where: {
          deletedAt: null,
          requirement: scope,
          ...(profileFilter ?? {}),
          ...this.sourcedByCandidateFilter(query),
          OR: [
            { profileSubmittedDate: { gte: fromStart, lte: toEnd } },
            {
              AND: [
                { profileSubmittedDate: null },
                { createdAt: { gte: fromStart, lte: toEnd } },
              ],
            },
            {
              selected: true,
              selectedAt: { gte: fromStart, lte: toEnd },
            },
          ],
        },
        select: {
          profileSubmittedDate: true,
          createdAt: true,
          selected: true,
          selectedAt: true,
          sourcedBy: { select: { id: true, fullName: true } },
          requirement: {
            select: {
              taOwner: { select: { id: true, fullName: true } },
              taAssignments: {
                select: {
                  isPrimary: true,
                  user: { select: { id: true, fullName: true } },
                },
                orderBy: [
                  { isPrimary: 'desc' as const },
                  { assignedAt: 'asc' as const },
                ],
              },
            },
          },
        },
      }),
    ]);

    for (const assignment of assignments) {
      bump(
        this.dayKey(assignment.assignedAt),
        assignment.user,
        'positionsAssigned',
        assignment.requirement.numberOfPositions,
      );
    }

    for (const candidate of candidates) {
      const owner =
        candidate.sourcedBy ?? resolvePrimaryTa(candidate.requirement);
      if (!owner) continue;

      const sourcedAt = candidate.profileSubmittedDate ?? candidate.createdAt;
      const sourcedDay = this.dayKey(sourcedAt);
      if (sourcedAt >= fromStart && sourcedAt <= toEnd) {
        bump(sourcedDay, owner, 'candidatesSourced', 1);
      }

      if (
        candidate.selected &&
        candidate.selectedAt &&
        candidate.selectedAt >= fromStart &&
        candidate.selectedAt <= toEnd
      ) {
        bump(this.dayKey(candidate.selectedAt), owner, 'selectedCandidates', 1);
      }
    }

    return [...buckets.values()]
      .filter(
        (row) =>
          row.positionsAssigned > 0 ||
          row.candidatesSourced > 0 ||
          row.selectedCandidates > 0,
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.taOwnerName.localeCompare(b.taOwnerName),
      );
  }
}
