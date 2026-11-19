
import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import { IconPie, IconBar, IconTrending } from './Icons';
import InfoTip from './InfoTip';
import DownloadExcelButton from './DownloadExcelButton';
import './css/DashboardCharts.css';

const FALLBACK = {
  success: '#16a34a',
  successBright: '#4ade80',
  warning: '#f59e0b',
  danger: '#dc2626',
  primary: '#4c63ff',
};

function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;

  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback
  );
}

function semanticColors() {
  return {
    success: cssVar('--color-success', FALLBACK.success),
    successBright: cssVar('--color-success-bright', FALLBACK.successBright),
    warning: cssVar('--color-warning-bright', FALLBACK.warning),
    danger: cssVar('--color-danger', FALLBACK.danger),
    primary: cssVar('--primary', FALLBACK.primary),
    text: cssVar('--dash-text-strong', cssVar('--text', '#172033')),
    muted: cssVar('--dash-text-quiet', cssVar('--text-soft', '#8490a2')),
    grid: cssVar('--grid', '#e8edf3'),
  };
}

function byClient(rows, field) {
  const map = {};

  rows.forEach((row) => {
    const client = row.client || 'Unknown';
    map[client] = (map[client] || 0) + Number(row[field] || 0);
  });

  return Object.entries(map)
    .map(([client, value]) => ({ client, value }))
    .sort((a, b) => b.value - a.value);
}

function normalizeRagSummary(summary, colors) {
  if (!Array.isArray(summary)) return null;

  const map = { Green: 0, Amber: 0, Red: 0 };

  summary.forEach((item) => {
    const key = String(
      item.rag || item.RAG || item.ragStatus || item.status || ''
    ).trim().toLowerCase();

    if (key === 'green') map.Green += Number(item.count || item.value || 0);
    if (key === 'amber') map.Amber += Number(item.count || item.value || 0);
    if (key === 'red') map.Red += Number(item.count || item.value || 0);
  });

  return [
    { name: 'Green', value: map.Green, color: colors.success },
    { name: 'Amber', value: map.Amber, color: colors.warning },
    { name: 'Red', value: map.Red, color: colors.danger },
  ];
}

function ragBreakdown(rows, colors) {
  const map = { Green: 0, Amber: 0, Red: 0 };

  rows.forEach((row) => {
    const key = String(row.requirementRag || '').trim();
    if (map[key] !== undefined) map[key] += 1;
  });

  return [
    { name: 'Green', value: map.Green, color: colors.success },
    { name: 'Amber', value: map.Amber, color: colors.warning },
    { name: 'Red', value: map.Red, color: colors.danger },
  ];
}

function pipelineFunnel(rows) {
  return [
    {
      stage: 'Pipeline',
      value: rows.reduce(
        (sum, row) => sum + Number(row.candidatesInPipeline || 0),
        0
      ),
    },
    {
      stage: 'Selected',
      value: rows.reduce(
        (sum, row) => sum + Number(row.selectedCandidates || 0),
        0
      ),
    },
    {
      stage: 'Offer Released',
      value: rows.reduce(
        (sum, row) => sum + Number(row.offersReleased || 0),
        0
      ),
    },
    {
      stage: 'Accepted',
      value: rows.reduce(
        (sum, row) => sum + Number(row.offersAccepted || 0),
        0
      ),
    },
    {
      stage: 'Joined',
      value: rows.reduce(
        (sum, row) => sum + Number(row.candidatesJoined || 0),
        0
      ),
    },
  ];
}

function positionStatus(rows, colors) {
  const open = rows.reduce(
    (sum, row) => sum + Number(row.openPositions || 0),
    0
  );

  const closed = rows.reduce(
    (sum, row) => sum + Number(row.closedPositions || 0),
    0
  );

  return [
    { name: 'Open', value: open, color: colors.successBright },
    { name: 'Closed', value: closed, color: colors.danger },
  ];
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const item = payload[0];
  const title =
    label || item.name || item.payload?.name || item.payload?.client;

  return (
    <div className="dc-tooltip">
      <strong>{title}</strong>
      <span>{item.value}</span>
    </div>
  );
}

function reduceMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clientAxisWidth(data) {
  const longest = data.reduce(
    (max, row) => Math.max(max, String(row.client || '').length),
    0
  );

  return Math.min(170, Math.max(105, Math.ceil(longest * 6.5) + 8));
}

function ClientNameTick({ x, y, payload, fill }) {
  const label = payload?.value == null ? '' : String(payload.value);

  return (
    <g transform={`translate(${x},${y})`}>
      <title>{label}</title>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill={fill}
        fontSize={11}
      >
        {label.length > 22 ? `${label.slice(0, 20)}…` : label} 
      </text>
    </g>
  );
}

function ClientBarChart({ data, color, empty }) {
  if (!data.length) {
    return <div className="dc-empty">{empty}</div>;
  }

  const colors = semanticColors();
  const yWidth = clientAxisWidth(data);
  const chartHeight = Math.max(175, data.length * 29);

  return (
    <div className="dc-client-chart">
      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 3, right: 12, left: 4, bottom: 0 }}
          barCategoryGap={9}
        >
          <CartesianGrid
            stroke={colors.grid}
            strokeDasharray="3 4"
            horizontal={false}
          />

          <XAxis
            type="number"
            tick={{ fill: colors.muted, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />

          <YAxis
            type="category"
            dataKey="client"
            width={yWidth}
            interval={0}
            tick={<ClientNameTick fill={colors.muted} />}
            axisLine={false}
            tickLine={false}
          />

          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: 'rgba(76, 99, 255, 0.07)' }}
          />

          <Bar
            dataKey="value"
            fill={color}
            radius={[0, 5, 5, 0]}
            maxBarSize={17}
            isAnimationActive={!reduceMotion()}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompactDonut({ data, total, centerLabel }) {
  const hasData = data.some((item) => item.value > 0);

  if (!hasData) {
    return <div className="dc-empty dc-donut-empty">No data found.</div>;
  }

  return (
    <div className="dc-donut-layout">
      <div className="dc-donut-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={39}
              outerRadius={56}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={!reduceMotion()}
            >
              {data.map((item) => (
                <Cell key={item.name} fill={item.color} />
              ))}
            </Pie>

            <Tooltip
              content={<ChartTooltip />}
              wrapperStyle={{ zIndex: 5 }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="dc-donut-center">
          <strong>{total}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>

      <ul className="dc-legend">
        {data.map((item) => {
          const percentage = total
            ? Math.round((item.value / total) * 100)
            : 0;

          return (
            <li key={item.name}>
              <span
                className="dc-legend-dot"
                style={{ background: item.color }}
              />

              <span className="dc-legend-name">{item.name}</span>
              <strong>{item.value}</strong>
              <em>{percentage}%</em>
            </li>
          );
        })}
      </ul>
    </div>
  );
}


function StageConversionChart({ data }) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);

  return (
    <div className="dc-stage-flow">
      {data.map((item, index) => (
        <div className="dc-stage-step" key={item.name}>
          <div className="dc-stage-step-top">
            <span className="dc-stage-step-number">
              {String(index + 1).padStart(2, '0')}
            </span>

            <strong>{item.value}</strong>
          </div>

          <div className="dc-stage-track">
            <span
              className="dc-stage-track-fill"
              style={{
                width: `${maxValue ? (item.value / maxValue) * 100 : 0}%`,
              }}
            />
          </div>

          <span className="dc-stage-step-label">{item.name}</span>

          {index !== data.length - 1 && (
            <span className="dc-stage-connector" aria-hidden="true">
              <span />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}


export default function DashboardCharts({
  rows = [],
  kpis = [],
  openPositionsOnClient = null,
  closedPositionsOnClient = null,
  requirementRagSummary = null,
}) {
  const { theme } = useTheme();
  const [positionTab, setPositionTab] = useState('open');

  // Reading theme keeps this component in sync with ThemeContext.
  void theme;

  const colors = semanticColors();
  const safeRows = Array.isArray(rows) ? rows : [];

  const effectiveRows = safeRows.length
    ? safeRows
    : kpis.map((item) => ({
        client: item.label,
        openPositions: item.label === 'openPositions' ? item.value : 0,
        closedPositions: item.label === 'closedPositions' ? item.value : 0,
        candidatesInPipeline:
          item.label === 'candidatesInPipeline' ? item.value : 0,
        selectedCandidates:
          item.label === 'selectedCandidates' ? item.value : 0,
        offersReleased: item.label === 'offersReleased' ? item.value : 0,
        offersAccepted: item.label === 'offersAccepted' ? item.value : 0,
        candidatesJoined: item.label === 'candidatesJoined' ? item.value : 0,
        requirementRag: null,
      }));

  const openByClientExport =
    openPositionsOnClient === null
      ? byClient(effectiveRows, 'openPositions')
      : Array.isArray(openPositionsOnClient)
        ? openPositionsOnClient
            .map((item) => ({
              client: item.client,
              value: Number(item.openPositions || 0),
            }))
            .sort((a, b) => b.value - a.value)
        : [];

  const closedByClientExport =
    closedPositionsOnClient === null
      ? byClient(effectiveRows, 'closedPositions')
      : Array.isArray(closedPositionsOnClient)
        ? closedPositionsOnClient
            .map((item) => ({
              client: item.client,
              value: Number(item.closedPositions || 0),
            }))
            .sort((a, b) => b.value - a.value)
        : [];

  const openByClient = openByClientExport.slice(0, 6);
  const closedByClient = closedByClientExport.slice(0, 6);

  const rag =
    normalizeRagSummary(requirementRagSummary, colors) ||
    ragBreakdown(effectiveRows, colors);

  const status = positionStatus(effectiveRows, colors);
  const funnel = pipelineFunnel(effectiveRows);
  const conversion = funnel.map((item) => ({
    name: item.stage,
    value: item.value,
  }));

  const ragTotal = rag.reduce((sum, item) => sum + item.value, 0);
  const statusTotal = status.reduce((sum, item) => sum + item.value, 0);
  const openTotal = openByClientExport.reduce(
    (sum, item) => sum + item.value,
    0
  );
  const closedTotal = closedByClientExport.reduce(
    (sum, item) => sum + item.value,
    0
  );

  const activeData =
    positionTab === 'open' ? openByClient : closedByClient;

  const activeExportData =
    positionTab === 'open'
      ? openByClientExport
      : closedByClientExport;

  const activeTotal =
    positionTab === 'open' ? openTotal : closedTotal;

  const activeColor =
    positionTab === 'open' ? colors.success : colors.danger;

  const positionColumns = [
    { label: 'Client', key: 'client' },
    {
      label: positionTab === 'open' ? 'Open Positions' : 'Closed Positions',
      key: 'value',
    },
  ];

  const funnelHasData = conversion.some((item) => item.value > 0);

  return (
    <div className="dc-dashboard-grid">
      {/* Position Overview */}
      <section className="dc-card dc-position-card">
        <div className="dc-card-header">
          <div className="dc-heading-group">
            <span className="dc-heading-icon dc-icon-blue">
              <IconBar />
            </span>

            <div>
              <h3>Position Overview</h3>
              <p>Client-wise position breakdown</p>
            </div>
          </div>
            <div className="dc-position-toolbar">
         

          <DownloadExcelButton
            filename={
              positionTab === 'open'
                ? 'open-positions-on-client'
                : 'closed-positions-on-client'
            }
            rows={activeExportData}
            columns={positionColumns}
          />
        </div>

          <InfoTip text="View open and closed positions grouped by client. Use the tabs to switch between the two views." />
        </div>

      <div className="dc-tabs" role="tablist" aria-label="Position type">
            <button
              type="button"
              role="tab"
              aria-selected={positionTab === 'open'}
              className={`dc-tab ${positionTab === 'open' ? 'active open' : ''}`}
              onClick={() => setPositionTab('open')}
            >
              Open
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={positionTab === 'closed'}
              className={`dc-tab ${positionTab === 'closed' ? 'active closed' : ''}`}
              onClick={() => setPositionTab('closed')}
            >
              Closed
            </button>
          </div>

        <div className="dc-position-summary">
          <div>
            <span className="dc-summary-label">
              {positionTab === 'open' ? 'Open Positions' : 'Closed Positions'}
            </span>

            <strong>{activeTotal}</strong>
          </div>

          <span
            className={`dc-status-pill ${
              positionTab === 'open' ? 'is-open' : 'is-closed'
            }`}
          >
            <span />
            {positionTab === 'open' ? 'Active' : 'Filled'}
          </span>
        </div>

        <ClientBarChart
          data={activeData}
          color={activeColor}
          empty="No position data found."
        />

        <div className="dc-card-footnote">
          Showing top {activeData.length} of {activeExportData.length} clients
        </div>
      </section>

      {/* Combined Requirement RAG + Position Status */}
      <section className="dc-card dc-status-card">
        <div className="dc-card-header">
          <div className="dc-heading-group">
            <span className="dc-heading-icon dc-icon-purple">
              <IconPie />
            </span>

            <div>
              <h3>Requirement &amp; Position Status</h3>
              <p>Requirement health and fulfilment</p>
            </div>
          </div>

          <InfoTip text="Requirement RAG shows the handoff health of active requirements. Position Status shows the split between open and closed positions." />
        </div>

        <div className="dc-status-grid">
          <div className="dc-status-section">
            <div className="dc-status-section-heading">
              <div>
                <h4>Requirement RAG</h4>
                <span>{ragTotal} requirements</span>
              </div>
            </div>

            <CompactDonut
              data={rag}
              total={ragTotal}
              centerLabel="Reqs"
            />
          </div>

          <div className="dc-status-section">
            <div className="dc-status-section-heading">
              <div>
                <h4>Position Status</h4>
                <span>{statusTotal} positions</span>
              </div>
            </div>

            <CompactDonut
              data={status}
              total={statusTotal}
              centerLabel="Positions"
            />
          </div>
        </div>
      </section>

      {/* Compact Stage Conversion */}
      {funnelHasData && (
        <section className=" dc-stage-card">
          <div className="dc-card-header">
            <div className="dc-heading-group">
              <span className="dc-heading-icon dc-icon-teal">
                <IconTrending />
              </span>

              <div>
                <h3>Stage Conversion</h3>
                <p>Candidate movement across hiring stages</p>
              </div>
            </div>
            <div className="dc-stage-toolbar" style={{marginRight:"20px"}}>
            {/* <div className="dc-stage-metrics">
              {conversion.map((item) => (
                <div className="dc-stage-metric" key={item.name}>
                  <span>{item.name}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div> */}

            <DownloadExcelButton
              filename="stage-conversion"
              rows={conversion}
              columns={[
                { label: 'Stage', key: 'name' },
                { label: 'Count', key: 'value' },
              ]}
            />
          </div>

            <InfoTip text="The chart shows the total number of candidates at each stage. Counts are not conversion percentages." />
          </div>

          

          <StageConversionChart data={conversion} />
        </section>
      )}
    </div>
  );
}
