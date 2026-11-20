
import {
  IconBriefcase,
  IconFolderOpen,
  IconUsers,
  IconCheckCircle,
  IconUserCheck,
  IconXCircle,
  IconClipboardCheck,
  IconChart,
} from './Icons';

import InfoTip from './InfoTip';

const RISK_KPI = new Set([
  'overdueRequirements',
  'wastedSourcing',
  'cancelledRequirements',
  'requirementsAtRisk',
]);

const KPI_META = {
  totalRequirements: { Icon: IconBriefcase },
  activeRequirements: { Icon: IconBriefcase },
  onHoldRequirements: { Icon: IconClipboardCheck },
  totalPositions: { Icon: IconFolderOpen },
  openPositions: { Icon: IconFolderOpen },
  closedPositions: { Icon: IconFolderOpen },
  pendingSalesHandoff: { Icon: IconClipboardCheck },
  candidatesInPipeline: { Icon: IconUsers },
  selectedCandidates: { Icon: IconUserCheck },
  duplicateMobiles: { Icon: IconXCircle },
  offersReleased: { Icon: IconCheckCircle },
  offersAccepted: { Icon: IconUserCheck },
  candidatesJoined: { Icon: IconUserCheck },
  fillRate: { Icon: IconChart },
  averageDaysToFill: { Icon: IconChart },
  requirementsAtRisk: { Icon: IconXCircle },
  cancelledRequirements: { Icon: IconXCircle },
  wastedSourcing: { Icon: IconXCircle },
  overdueRequirements: { Icon: IconXCircle },
  offersRejected: { Icon: IconXCircle },
};

const KPI_LABELS = {
  totalRequirements: 'Total Requirements',
  activeRequirements: 'Active Requirements',
  onHoldRequirements: 'On Hold Requirements',
  closedRequirements: 'Closed Requirements',
  totalPositions: 'No. of Positions',
  openPositions: 'Open Positions',
  closedPositions: 'Closed Positions',
  pendingSalesHandoff: 'Pending Sales Handoff',
  candidatesInPipeline: 'Candidates In Pipeline',
  selectedCandidates: 'Selected Candidates',
  duplicateMobiles: 'Duplicate Mobiles',
  offersReleased: 'Offers Released',
  offersAccepted: 'Offers Accepted',
  candidatesJoined: 'Candidates Joined',
  fillRate: 'Fill Rate',
  averageDaysToFill: 'Avg Days To Fill',
  requirementsAtRisk: 'Requirements At Risk',
  cancelledRequirements: 'Cancelled Requirements',
  wastedSourcing: 'Wasted Sourcing',
  overdueRequirements: 'Overdue Requirements',
  offersRejected: 'Offers Rejected',
};

const KPI_INFO = {
  totalRequirements:
    'Active, On Hold, and Cancelled requirements. Closed requirements are not included.',
  activeRequirements:
    'Requirements whose status is Active.',
  onHoldRequirements:
    'Requirements whose status is On Hold.',
  cancelledRequirements:
    'Requirements whose status is Cancelled.',
  totalPositions:
    'Sum of seats on every requirement that is not Cancelled.',
  openPositions:
    'Unfilled seats on requirements that are not Cancelled. People who joined are capped at the seat count.',
  closedPositions:
    'One count for each person whose onboarding status is Joined.',
  candidatesInPipeline:
    'Candidates who have not been selected.',
  selectedCandidates:
    'Selected candidates who are not yet in a released offer, an accepted offer, or joined.',
  offersReleased:
    'Offers whose status is Released.',
  offersAccepted:
    'Offers whose status is Accepted, where the person has not joined.',
  candidatesJoined:
    'People whose onboarding status is Joined. This is the same group as Closed Positions, counted here as a hiring stage.',
  overdueRequirements:
    'The target closure date is in the past and the requirement still has an open seat. On Hold and Cancelled requirements are not overdue.',
  wastedSourcing:
    'Cancelled requirements that already had a TA handoff date or at least one candidate.',
};

function formatKpiValue(label, value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (label.toLowerCase().includes('rate')) {
      return `${value}%`;
    }
    return value;
  }

  return value;
}

function getKpiLabel(kpi) {
  if (kpi.title) return kpi.title;
  if (kpi.name) return kpi.name;

  return KPI_LABELS[kpi.label] || kpi.label || 'KPI';
}

export default function KpiCards({
  kpis = [],
  onCardClick,
  heroLabels,
}) {
  const renderCard = (k) => {
    const label = k.label || k.name || k.key || 'unknown';
    const Icon = KPI_META[label]?.Icon || IconBriefcase;
    const isRisk = RISK_KPI.has(label);
    const info = KPI_INFO[label];

    return (
      <div
        className={`metric-item ${isRisk ? 'metric-item-risk' : ''} ${
          onCardClick ? 'metric-item-clickable' : ''
        }`}
        key={label}
        role={onCardClick ? 'button' : undefined}
        tabIndex={onCardClick ? 0 : undefined}
        onClick={() => onCardClick?.(label)}
        onKeyDown={(e) => {
          if (!onCardClick) return;

          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick(label);
          }
        }}
      >
        <span className="metric-item-icon">
          <Icon />
        </span>

        <div className="metric-item-content">
          <span className="metric-item-value">
            {formatKpiValue(label, k.value)}
          </span>

          <span className="metric-item-label">
            {getKpiLabel(k)}
          </span>
        </div>

        {info && (
          <div
            className="metric-item-info"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <InfoTip
              text={info}
              label="How this number is calculated"
            />
          </div>
        )}
      </div>
    );
  };

  if (Array.isArray(heroLabels) && heroLabels.length) {
    const heroSet = new Set(heroLabels);

    const hero = kpis.filter((k) => heroSet.has(k.label));
    const rest = kpis.filter((k) => !heroSet.has(k.label));

    return (
      <div className="metric-dashboard">

        {/* Key Metrics */}
        <details className="metric-panel" open>
          <summary className="metric-panel-header">
            <span>Key Metrics</span>

            <InfoTip
              inline
              text="Requirement status counts and seat counts. Closed requirements are excluded from Total Requirements. Each card explains its own count."
            />

            <span className="metric-panel-count">
              {hero.length}
            </span>
          </summary>

          <div className="metric-panel-grid">
            {hero.map(renderCard)}
          </div>
        </details>

        {/* More Metrics */}
        {rest.length > 0 && (
          <details className="metric-panel">
            <summary className="metric-panel-header">
              <span>More Metrics</span>

              <InfoTip
                inline
                text="Hiring-stage counts, overdue requirements, and wasted sourcing. Pipeline, Selected, Offers Released, Offers Accepted, and Joined do not share a person. Each card explains its own count."
              />

              <span className="metric-panel-count">
                {rest.length}
              </span>
            </summary>

            <div className="metric-panel-grid">
              {rest.map(renderCard)}
            </div>
          </details>
        )}

      </div>
    );
  }

  return (
    <div className="metric-panel-grid">
      {kpis.map(renderCard)}
    </div>
  );
}
