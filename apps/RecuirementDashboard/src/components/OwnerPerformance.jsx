import { useTheme } from '../context/ThemeContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Legend,
} from 'recharts';
import { IconBar, IconUsers } from './Icons';
import DownloadExcelButton from './DownloadExcelButton';
import InfoTip from './InfoTip';

const POSITIONS_COLOR = '#38bdf8';
const CANDIDATES_COLOR = '#e0b44a';
const SELECTED_COLOR = '#34d399';
const OWNER_SLOT = 188;

function cssVar(name, fallback = '#888') {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function reduceMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>{item.name}: {item.value}</span>
      ))}
    </div>
  );
}

function OwnerComparisonChart({ rows, positionKey, positionLabel, packed = false }) {
  const { theme } = useTheme();
  void theme;
  const muted = cssVar('--dash-text-quiet', cssVar('--text-soft', '#8aa6b8'));
  const grid = cssVar('--grid', '#243640');
  const text = cssVar('--dash-text-strong', cssVar('--text', '#f0f7fb'));
  if (!rows.length) return <div className="progress-empty">No data found.</div>;

  const series = [
    { key: positionKey, name: positionLabel, fill: POSITIONS_COLOR },
    { key: 'candidatesSourced', name: 'Candidates sourced', fill: CANDIDATES_COLOR },
    { key: 'selectedCandidates', name: 'Selected candidates', fill: SELECTED_COLOR },
  ];

  const plotStyle = packed
    ? { width: Math.max(rows.length, 1) * OWNER_SLOT, maxWidth: '100%' }
    : undefined;

  return (
    <div className="chart-plot owner-sales-plot" style={plotStyle}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          key={rows.map((row) => `${row.id}:${row[positionKey]}:${row.candidatesSourced}:${row.selectedCandidates}`).join('|')}
          data={rows}
          margin={{ top: 22, right: 8, left: 0, bottom: 8 }}
          barGap={3}
          barCategoryGap="22%"
        >
          <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: muted, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(56, 189, 248, 0.08)' }} />
          <Legend wrapperStyle={{ fontSize: 12, color: text }} />
          {series.map((item) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              name={item.name}
              fill={item.fill}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={!reduceMotion()}
            >
              <LabelList dataKey={item.key} position="top" formatter={barLabel} fill={text} fontSize={11} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function OwnerPerformance({ data }) {
  const sales = Array.isArray(data?.sales) ? data.sales : [];
  const ta = Array.isArray(data?.ta) ? data.ta : [];
  const total = data?.taTotal;

  return (
    <div className="owner-performance">
      <div className="chart-card">
        <InfoTip text="Every active sales owner. Positions raised are seats on requirements they own that are not Cancelled. Candidates sourced are all candidates on those requirements. Selected are candidates marked selected." />
        <h3><IconBar /> Sales Owner: Positions Raised vs Candidates Sourced vs Selected</h3>
        <OwnerComparisonChart
          rows={sales}
          positionKey="positionsRaised"
          positionLabel="Positions raised"
          packed
        />
      </div>

      <div className="chart-card">
        <InfoTip text="Every active TA owner, counted on the primary TA for each requirement. Positions assigned, candidates sourced, and selected follow the sales chart, and Cancelled requirements are excluded." />
        <h3><IconUsers /> TA Owner: Positions Assigned vs Candidates Sourced vs Selected</h3>
        <OwnerComparisonChart
          rows={ta}
          positionKey="positionsAssigned"
          positionLabel="Positions assigned"
        />
      </div>

      <div className="chart-card">
        <InfoTip text="The same TA owners as the chart. Sourced per position is candidates divided by assigned seats. Open positions are unfilled seats on Active and On Hold requirements. Joined is people whose onboarding status is Joined." />
        <h3>
          <IconUsers /> By TA Owner
          <span>showing {ta.length} TA {ta.length === 1 ? 'owner' : 'owners'}</span>
        </h3>
        <DownloadExcelButton
          filename="ta-owner-performance"
          rows={ta.length && total ? [...ta, { ...total, name: 'Total (all owners)' }] : []}
          columns={[
            { label: 'TA Owner', key: 'name' },
            { label: 'Requirements', key: 'requirements' },
            { label: 'Positions Assigned', key: 'positionsAssigned' },
            { label: 'Candidates Sourced', key: 'candidatesSourced' },
            { label: 'Selected', key: 'selectedCandidates' },
            { label: 'Sourced per Position', value: (row) => oneDecimal(row.sourcedPerPosition) },
            { label: 'Open Positions', key: 'openPositions' },
            { label: 'Joined (Closed)', key: 'joined' },
          ]}
        />
        {ta.length && total ? (
          <div className="owner-ta-wrap">
            <table className="owner-ta-table">
              <thead>
                <tr>
                  <th>TA Owner</th>
                  <th>Requirements</th>
                  <th>Positions Assigned</th>
                  <th>Candidates Sourced</th>
                  <th>Selected</th>
                  <th>Sourced per Position</th>
                  <th>Open Positions</th>
                  <th>Joined (Closed)</th>
                </tr>
              </thead>
              <tbody>
                {ta.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
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
        ) : (
          <div className="progress-empty">No data found.</div>
        )}
      </div>
    </div>
  );
}
