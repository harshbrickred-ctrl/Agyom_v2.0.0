import { useTheme } from '../context/ThemeContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
} from 'recharts';

import { IconBar, IconUsers } from './Icons';
import DownloadExcelButton from './DownloadExcelButton';
import InfoTip from './InfoTip';
import './css/OwnerPerformance.css';

const OWNER_SLOT = 150;

function cssVar(name, fallback = '#888') {
  if (typeof window === 'undefined') return fallback;

  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim() || fallback
  );
}

function reduceMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function oneDecimal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.0';
  return number.toFixed(1);
}

function barLabel(value) {
  return value ? value : '';
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="op-tooltip">
      <strong>{label}</strong>

      {payload.map((item) => (
        <div className="op-tooltip-row" key={item.dataKey}>
          <span
            className="op-tooltip-dot"
            style={{ backgroundColor: item.color }}
          />
          

          <span>{item.name}</span>

          <strong>{item.value ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

function OwnerComparisonChart({
  rows,
  positionKey,
  positionLabel,
  packed = false,
}) {
  const { theme } = useTheme();
  void theme;

  const muted = cssVar('--op-muted', '#8490a2');
  const grid = cssVar('--op-grid', '#e8edf3');
  const text = cssVar('--op-heading', '#172033');

  const colors = {
    positions: cssVar('--op-position', '#38bdf8'),
    sourced: cssVar('--op-sourced', '#e0b44a'),
    selected: cssVar('--op-selected', '#34d399'),
  };

  if (!rows.length) {
    return <div className="op-empty">No owner data found.</div>;
  }

  const series = [
    {
      key: positionKey,
      name: positionLabel,
      fill: colors.positions,
    },
    {
      key: 'candidatesSourced',
      name: 'Candidates sourced',
      fill: colors.sourced,
    },
    {
      key: 'selectedCandidates',
      name: 'Selected candidates',
      fill: colors.selected,
    },
  ];

  const chartWidth = packed
    ? Math.max(rows.length, 1) * OWNER_SLOT
    : '100%';

  return (
    <div className={`op-chart-scroll ${packed ? 'is-packed' : ''}`}>
      <div
        className="op-chart-inner"
        style={{
          width: chartWidth,
          minWidth: packed ? '100%' : 0,
        }}
      >
        <ResponsiveContainer width="100%" height={235}>
          <BarChart
            data={rows}
            margin={{ top: 20, right: 8, left: -18, bottom: 4 }}
            barGap={3}
            barCategoryGap="22%"
          >
            <CartesianGrid
              stroke={grid}
              strokeDasharray="3 4"
              vertical={false}
            />

            <XAxis
              dataKey="name"
              tick={{ fill: muted, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              tickMargin={8}
            />

            <YAxis
              allowDecimals={false}
              tick={{ fill: muted, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={34}
            />

          {/* <Tooltip
  content={<ChartTooltip />}
  cursor={{ fill: 'rgba(56, 189, 248, 0.07)' }}
  allowEscapeViewBox={{ x: true, y: true }}
  wrapperStyle={{
    zIndex: 100,
    outline: 'none',
    pointerEvents: 'none',
  }}
  isAnimationActive={false}
/> */}

            <Legend
              verticalAlign="bottom"
              height={25}
              iconType="circle"
              iconSize={7}
              wrapperStyle={{
                fontSize: 10,
                color: text,
                paddingTop: 5,
              }}
            />

            {series.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.name}
                fill={item.fill}
                radius={[4, 4, 0, 0]}
                maxBarSize={20}
                isAnimationActive={!reduceMotion()}
              >
                <LabelList
                  dataKey={item.key}
                  position="top"
                  formatter={barLabel}
                  fill={text}
                  fontSize={9}
                />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function OwnerChartCard({
  title,
  subtitle,
  icon,
  info,
  rows,
  positionKey,
  positionLabel,
  filename,
  exportColumns,
  packed = false,
}) {
  return (
    <section className="op-card op-chart-card">
      <div className="op-card-header">
        <div className="op-card-title-wrap">
          <span className="op-card-icon">{icon}</span>

          <div className="op-card-title-content">
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>

        {/* <InfoTip text={info} /> */}
      </div>

      <div className="op-card-toolbar">
        <span className="op-owner-count">
          {rows.length} {rows.length === 1 ? 'owner' : 'owners'}
        </span>

        <DownloadExcelButton
          filename={filename}
          rows={rows}
          columns={exportColumns}
        />
      </div>

      <OwnerComparisonChart
        rows={rows}
        positionKey={positionKey}
        positionLabel={positionLabel}
        packed={packed}
      />
    </section>
  );
}

function OwnerSummaryTable({ ta, total }) {
  if (!ta.length || !total) {
    return <div className="op-empty">No TA owner data found.</div>;
  }

  return (
    <div className="op-table-scroll">
      <table className="op-table">
        <thead>
          <tr>
            <th>TA Owner</th>
            <th>Requirements</th>
            <th>Positions Assigned</th>
            <th>Candidates Sourced</th>
            <th>Selected</th>
            <th>Sourced / Position</th>
            <th>Open Positions</th>
            <th>Joined</th>
          </tr>
        </thead>

        <tbody>
          {ta.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="op-owner-name">{row.name}</span>
              </td>
              <td>{row.requirements}</td>
              <td>{row.positionsAssigned}</td>
              <td>{row.candidatesSourced}</td>
              <td>{row.selectedCandidates}</td>
              <td>{oneDecimal(row.sourcedPerPosition)}</td>
              <td>{row.openPositions}</td>
              <td>{row.joined}</td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <td>Total (all owners)</td>
            <td>{total.requirements}</td>
            <td>{total.positionsAssigned}</td>
            <td>{total.candidatesSourced}</td>
            <td>{total.selectedCandidates}</td>
            <td>{oneDecimal(total.sourcedPerPosition)}</td>
            <td>{total.openPositions}</td>
            <td>{total.joined}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function OwnerPerformance({ data }) {
  const sales = Array.isArray(data?.sales) ? data.sales : [];
  const ta = Array.isArray(data?.ta) ? data.ta : [];
  const total = data?.taTotal;

  const summaryRows =
    ta.length && total
      ? [...ta, { ...total, name: 'Total (all owners)' }]
      : [];

  const salesColumns = [
    { label: 'Sales Owner', key: 'name' },
    { label: 'Positions Raised', key: 'positionsRaised' },
    { label: 'Candidates Sourced', key: 'candidatesSourced' },
    { label: 'Selected', key: 'selectedCandidates' },
  ];

  const taColumns = [
    { label: 'TA Owner', key: 'name' },
    { label: 'Positions Assigned', key: 'positionsAssigned' },
    { label: 'Candidates Sourced', key: 'candidatesSourced' },
    { label: 'Selected', key: 'selectedCandidates' },
  ];

  const summaryColumns = [
    { label: 'TA Owner', key: 'name' },
    { label: 'Requirements', key: 'requirements' },
    { label: 'Positions Assigned', key: 'positionsAssigned' },
    { label: 'Candidates Sourced', key: 'candidatesSourced' },
    { label: 'Selected', key: 'selectedCandidates' },
    {
      label: 'Sourced per Position',
      value: (row) => oneDecimal(row.sourcedPerPosition),
    },
    { label: 'Open Positions', key: 'openPositions' },
    { label: 'Joined (Closed)', key: 'joined' },
  ];

  return (
    <div className="op-dashboard">
      <div className="op-chart-grid">
        <OwnerChartCard
          title="Sales Owner Performance"
          subtitle="Positions raised vs candidate sourcing"
          icon={<IconBar />}
          info="Every active sales owner. Positions raised are seats on requirements they own that are not Cancelled. Candidates sourced are all candidates on those requirements. Selected are candidates marked selected."
          rows={sales}
          positionKey="positionsRaised"
          positionLabel="Positions raised"
          filename="sales-owner-performance"
          exportColumns={salesColumns}
          packed
        />

        <OwnerChartCard
          title="TA Owner Performance"
          subtitle="Positions assigned vs candidate sourcing"
          icon={<IconUsers />}
          info="Every active TA owner, counted on the primary TA for each requirement. Positions assigned, candidates sourced, and selected follow the sales chart, and Cancelled requirements are excluded."
          rows={ta}
          positionKey="positionsAssigned"
          positionLabel="Positions assigned"
          filename="ta-owner-chart"
          exportColumns={taColumns}
        />
      </div>

      <section className="op-card op-summary-card">
        <div className="op-card-header">
          <div className="op-card-title-wrap">
            <span className="op-card-icon">
              <IconUsers />
            </span>

            <div className="op-card-title-content">
              <h3>TA Owner Summary</h3>
              <p>Detailed owner-wise performance and fulfilment</p>
            </div>
          </div>

          {/* <InfoTip text="The same TA owners as the chart. Sourced per position is candidates divided by assigned seats. Open positions are unfilled seats on Active and On Hold requirements. Joined is people whose onboarding status is Joined." /> */}
        </div>

        <div className="op-card-toolbar">
          <span className="op-owner-count">
            {ta.length} {ta.length === 1 ? 'TA owner' : 'TA owners'}
          </span>

          <DownloadExcelButton
            filename="ta-owner-performance"
            rows={summaryRows}
            columns={summaryColumns}
          />
        </div>

        <OwnerSummaryTable ta={ta} total={total} />
      </section>
    </div>
  );
}
