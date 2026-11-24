// import { useEffect, useMemo, useState } from 'react';
// import { get, patch } from '../../services/apiClient';
// import { ENDPOINTS } from '../../config/api';
// import {
//   IconUsers, IconUserCheck, IconClock, IconCheckCircle, IconXCircle, IconBriefcase, IconEdit, IconFilePlus, IconFilter, IconX,
// } from '../../components/Icons';
// import { useEscapeKey } from '../../hooks/useEscapeKey';
// import { formatDate, toDateInput } from '../../utils/formatDate';
// import { matchesQuery, useDebouncedValue } from '../../utils/listSearch';
// import TableSearch from '../../components/TableSearch';
// import { EmptyState, ScreenSkeleton } from '../../components/ui';
// import DownloadExcelButton from '../../components/DownloadExcelButton';
// import { useToast } from '../../context/ToastContext';

// const STATUS_META = {
//   JOINED: { icon: IconCheckCircle, cls: 'st-joined' },
//   DOCS_PENDING: { icon: IconClock, cls: 'st-pending' },
//   IN_PROGRESS: { icon: IconBriefcase, cls: 'st-pipeline' },
//   ON_HOLD: { icon: IconXCircle, cls: 'st-rejected' },
//   BACKOUT: { icon: IconXCircle, cls: 'st-rejected' },
//   COMPLETED: { icon: IconUserCheck, cls: 'st-selected' },
// };

// const BGV_OPTIONS = ['NOT_STARTED', 'IN_PROGRESS', 'CLEARED', 'FAILED'];
// const ONBOARDING_STATUS_OPTIONS = ['DOCS_PENDING', 'IN_PROGRESS', 'JOINED', 'ON_HOLD', 'COMPLETED', 'BACKOUT'];
// const HR_OFFER_STATUS_CODES = ['RELEASED', 'ACCEPTED', 'DECLINED', 'HOLD', 'BACKOUT'];
// const FALLBACK_OFFER_STATUSES = [
//   { code: 'INITIATED', label: 'Initiated' },
//   { code: 'RELEASED', label: 'Released' },
//   { code: 'ACCEPTED', label: 'Accepted' },
//   { code: 'DECLINED', label: 'Declined' },
//   { code: 'HOLD', label: 'Hold' },
//   { code: 'BACKOUT', label: 'Backout' },
// ];

// function normalizeList(res) {
//   if (Array.isArray(res)) return res;
//   if (Array.isArray(res?.items)) return res.items;
//   if (Array.isArray(res?.data)) return res.data;
//   return [];
// }

// function normalizeLookups(res) {
//   if (Array.isArray(res)) return res;
//   if (Array.isArray(res?.items)) return res.items;
//   if (Array.isArray(res?.data)) return res.data;
//   if (Array.isArray(res?.values)) return res.values;
//   return [];
// }

// function statusLabel(code, options) {
//   const found = options.find((o) => o.code === code);
//   return found?.label || code || '—';
// }

// function onboardingRow(o, offerStatusOptions = FALLBACK_OFFER_STATUSES) {
//   const offerStatus = o.offerStatus || o.offer?.statusCode || '';
//   return {
//     id: o.id,
//     publicId: o.onboardingId || o.publicId || o.id || '—',
//     offerPublicId: o.offerPublicId || o.offer?.publicId || '—',
//     candidatePublicId: o.candidatePublicId || o.candidateCode || o.candidate?.publicId || '—',
//     candidateName: o.candidateName || o.candidate?.name || '—',
//     clientRole: o.clientRole || o.requirement?.roleSkill || '—',
//     reqId: o.reqId || o.requirementPublicId || o.requirement?.publicId || '—',
//     mobile: o.mobileNumber || o.candidate?.mobile || '—',
//     email: o.emailAddress || o.candidate?.email || '—',
//     offerStatus,
//     offerStatusLabel: statusLabel(offerStatus, offerStatusOptions),
//     ctcRate: o.ctcRate || o.offer?.ctcRate || '—',
//     hrOwnerId: o.hrOwnerId || o.hrOwner?.id || '',
//     hrOwnerName: o.hrOwnerName || o.hrOwner?.fullName || '—',
//     expectedDoj: formatDate(o.expectedDOJ || o.expectedDoj),
//     actualDoj: formatDate(o.actualDOJ || o.actualDoj),
//     pendingDocs: o.pendingDocs ?? o.docsPending,
//     bgvStatus: o.bgvStatus || o.bgvStatusCode || '—',
//     onboardingStatus: o.onboardingStatus || o.statusCode || '—',
//     requirementStatus: o.requirementStatus || o.requirement?.status || '—',
//     remarks: o.remarks || '—',
//     salesOwner: o.salesOwnerName || o.salesOwner?.fullName || '—',
//     taOwners: o.taOwnerNames
//       || (Array.isArray(o.taOwners) ? o.taOwners.map((t) => t.fullName || t).filter(Boolean).join(', ') : '')
//       || '—',
//   };
// }

// export default function HrCandidatesScreen() {
//   const { toast } = useToast();
//   const [rows, setRows] = useState([]);
//   const [offerStatusOptions, setOfferStatusOptions] = useState(FALLBACK_OFFER_STATUSES);
//   const [loading, setLoading] = useState(true);
//   const [filter, setFilter] = useState('All');
//   const [modalOpen, setModalOpen] = useState(false);
//   const [editingId, setEditingId] = useState(null);
//   const [candidateLabel, setCandidateLabel] = useState('');
//   const [form, setForm] = useState({
//     offerStatus: 'ACCEPTED',
//     docsPending: true,
//     bgvStatusCode: 'NOT_STARTED',
//     onboardingStatus: 'DOCS_PENDING',
//     joiningFormalities: '',
//     expectedDoj: '',
//     actualDoj: '',
//     remarks: '',
//   });

//   const [saving, setSaving] = useState(false);
//   const [loadingRow, setLoadingRow] = useState(false);
//   const [error, setError] = useState(null);
//   const [success, setSuccess] = useState(null);
//   const [listSearch, setListSearch] = useState('');
//   const listSearchQ = useDebouncedValue(listSearch);

//   useEscapeKey(modalOpen, () => { if (!saving) setModalOpen(false); });

//   const loadOnboardings = async () => {
//     const res = await get(ENDPOINTS.ONBOARDINGS);
//     setRows(normalizeList(res));
//   };

//   useEffect(() => {
//     let active = true;
//     setLoading(true);

//     Promise.all([
//       get(ENDPOINTS.ONBOARDINGS),
//       get(`${ENDPOINTS.LOOKUPS}/OFFER_STATUS`).catch(() => null),
//     ])
//       .then(([res, lookupRes]) => {
//         if (!active) return;
//         setRows(normalizeList(res));
//         const lookups = normalizeLookups(lookupRes)
//           .map((v) => ({
//             code: String(v.code || '').toUpperCase(),
//             label: v.label || v.code,
//           }))
//           .filter((v) => v.code);
//         if (lookups.length) {
//           const allowed = new Set(['INITIATED', ...HR_OFFER_STATUS_CODES]);
//           const filtered = lookups.filter((v) => allowed.has(v.code));
//           setOfferStatusOptions(filtered.length ? filtered : FALLBACK_OFFER_STATUSES);
//         }
//       })
//       .catch(() => active && setRows([]))
//       .finally(() => active && setLoading(false));

//     return () => { active = false; };
//   }, []);

//   const statuses = useMemo(() => {
//     const set = new Set();
//     rows.forEach((r) => {
//       const s = r.onboardingStatus || r.statusCode;
//       if (s) set.add(s);
//     });
//     return [...set];
//   }, [rows]);

//   const counts = useMemo(() => {
//     const base = { All: rows.length };
//     statuses.forEach((s) => { base[s] = 0; });
//     rows.forEach((r) => {
//       const s = r.onboardingStatus || r.statusCode;
//       if (s) base[s] = (base[s] || 0) + 1;
//     });
//     return base;
//   }, [rows, statuses]);

//   const visible = filter === 'All'
//     ? rows
//     : rows.filter((r) => (r.onboardingStatus || r.statusCode) === filter);

//   const openUpdate = async (item) => {
//     const id = item.id;
//     if (!id) return;
//     setEditingId(id);
//     setCandidateLabel(
//       [item.candidatePublicId || item.candidate?.publicId, item.candidateName || item.candidate?.name]
//         .filter(Boolean).join(' — ')
//     );
//     setError(null);
//     setSuccess(null);
//     setModalOpen(true);
//     setLoadingRow(true);
//     try {
//       const res = await get(`${ENDPOINTS.ONBOARDINGS}/${id}`);
//       const data = res?.onboarding || res?.data || res;
//       setForm({
//         offerStatus: data.offerStatus || data.offer?.statusCode || 'ACCEPTED',
//         docsPending: data.docsPending ?? data.pendingDocs ?? true,
//         bgvStatusCode: data.bgvStatusCode || data.bgvStatus || 'NOT_STARTED',
//         onboardingStatus: data.onboardingStatus || data.statusCode || 'DOCS_PENDING',
//         joiningFormalities: data.joiningFormalities || '',
//         expectedDoj: toDateInput(data.expectedDoj || data.expectedDOJ),
//         actualDoj: toDateInput(data.actualDoj || data.actualDOJ),
//         remarks: data.remarks || '',
//       });
//     } catch {
//       setForm({
//         offerStatus: item.offerStatus || item.offer?.statusCode || 'ACCEPTED',
//         docsPending: item.docsPending ?? item.pendingDocs ?? true,
//         bgvStatusCode: item.bgvStatusCode || item.bgvStatus || 'NOT_STARTED',
//         onboardingStatus: item.onboardingStatus || item.statusCode || 'DOCS_PENDING',
//         joiningFormalities: item.joiningFormalities || '',
//         expectedDoj: toDateInput(item.expectedDoj || item.expectedDOJ),
//         actualDoj: toDateInput(item.actualDoj || item.actualDOJ),
//         remarks: item.remarks || '',
//       });
//     } finally {
//       setLoadingRow(false);
//     }
//   };

//   const saveOnboarding = async () => {
//     if (!editingId) return;
//     setSaving(true);
//     setError(null);
//     setSuccess(null);
//     try {
//       const payload = {
//         offerStatus: form.offerStatus || undefined,
//         docsPending: !!form.docsPending,
//         bgvStatusCode: form.bgvStatusCode || 'NOT_STARTED',
//         onboardingStatus: form.onboardingStatus || 'DOCS_PENDING',
//         joiningFormalities: form.joiningFormalities || '',
//         expectedDoj: form.expectedDoj || null,
//         actualDoj: form.actualDoj || null,
//         remarks: form.remarks || '',
//       };
//       const res = await patch(`${ENDPOINTS.ONBOARDINGS}/${editingId}`, payload);
//       const offerLeftAccepted =
//         String(form.offerStatus || '').toUpperCase() !== 'ACCEPTED';
//       const okMsg =
//         offerLeftAccepted
//           ? (res?.message || 'Offer updated — candidate returned to Offers')
//           : (res?.message || 'Onboarding updated successfully');
//       setSuccess(okMsg);
//       toast(okMsg);
//       setModalOpen(false);
//       await loadOnboardings();
//     } catch (err) {
//       const msg =
//         err?.response?.data?.message ||
//         err?.message ||
//         'Failed to update onboarding.';
//       setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
//     } finally {
//       setSaving(false);
//     }
//   };

//   if (loading) return <ScreenSkeleton rows={8} />;

//   const displayed = visible.filter((item) => {
//     const row = onboardingRow(item, offerStatusOptions);
//     return matchesQuery(
//       listSearchQ,
//       row.publicId,
//       row.offerPublicId,
//       row.candidatePublicId,
//       row.candidateName,
//       row.email,
//       row.mobile,
//       row.clientRole,
//       row.reqId,
//     );
//   });
//   const hasFilters = Boolean(filter !== 'All' || listSearch.trim());
//   const clearFilters = () => {
//     setFilter('All');
//     setListSearch('');
//   };

//   return (
//     <div className="hr-candidates hr-onboarding">
//       <div className="assign-head">
//         <span className="assign-badge"><IconUsers /></span>
//         <div>
//           <h2 className="assign-title">Onboarding</h2>
//           <p className="assign-sub">Track and update candidate onboarding.</p>
//         </div>
//         {rows.length > 0 && <span className="yr-count">{displayed.length} shown</span>}
//       </div>

//       {rows.length > 0 && (
//         <div className="filter-bar">
//           <div className="filter-bar-head">
//             <IconFilter />
//             <span>Filters</span>
//             {hasFilters && (
//               <span className="filter-count">
//                 {(filter !== 'All' ? 1 : 0) + (listSearch.trim() ? 1 : 0)} active
//               </span>
//             )}
//             {hasFilters && (
//               <button type="button" className="filter-clear" onClick={clearFilters}>Clear</button>
//             )}
//           </div>
//           {hasFilters && (
//             <div className="filter-chips" aria-label="Active filters">
//               {filter !== 'All' && (
//                 <button type="button" className="filter-chip" onClick={() => setFilter('All')}>
//                   Status: {filter}
//                   <IconX width={12} height={12} />
//                 </button>
//               )}
//               {listSearch.trim() && (
//                 <button type="button" className="filter-chip" onClick={() => setListSearch('')}>
//                   Search: {listSearch.trim()}
//                   <IconX width={12} height={12} />
//                 </button>
//               )}
//             </div>
//           )}
//           <div className="hr-chips">
//             {['All', ...statuses].map((s) => {
//               const Meta = STATUS_META[s];
//               const Icon = Meta ? Meta.icon : IconUsers;
//               return (
//                 <button
//                   key={s}
//                   className={`hr-chip ${filter === s ? 'active' : ''} ${Meta ? Meta.cls : 'st-all'}`}
//                   onClick={() => setFilter(s)}
//                 >
//                   <Icon />
//                   <span>{s}</span>
//                   <em>{counts[s] || 0}</em>
//                 </button>
//               );
//             })}
//           </div>
//           <TableSearch
//             value={listSearch}
//             onChange={setListSearch}
//             placeholder="Search onboarding, candidates, IDs…"
//           />
//         </div>
//       )}

//       {error && !modalOpen && <div className="add-error">{error}</div>}
//       {success && <div className="add-success">{success}</div>}

//       <DownloadExcelButton
//         filename="onboarding"
//         rows={displayed.map((item) => onboardingRow(item, offerStatusOptions))}
//         columns={[
//           { label: 'Onboarding ID', key: 'publicId' },
//           { label: 'Offer ID', key: 'offerPublicId' },
//           { label: 'Candidate ID', key: 'candidatePublicId' },
//           { label: 'Candidate Name', key: 'candidateName' },
//           { label: 'TA Owners', key: 'taOwners' },
//           { label: 'Sales Owner', key: 'salesOwner' },
//           { label: 'Role', key: 'clientRole' },
//           { label: 'Req ID', key: 'reqId' },
//           { label: 'Email', key: 'email' },
//           { label: 'Mobile', key: 'mobile' },
//           { label: 'Offer Status', key: 'offerStatusLabel' },
//           { label: 'CTC', key: 'ctcRate' },
//           { label: 'HR Owner', key: 'hrOwnerName' },
//           { label: 'Expected DOJ', key: 'expectedDoj' },
//           { label: 'Actual DOJ', key: 'actualDoj' },
//           { label: 'Pending Docs', value: (row) => (row.pendingDocs ? 'Yes' : 'No') },
//           { label: 'BGV', key: 'bgvStatus' },
//           { label: 'Status', key: 'onboardingStatus' },
//           { label: 'Req Status', key: 'requirementStatus' },
//         ]}
//       />

//       {rows.length === 0 ? (
//         <EmptyState
//           icon={IconUsers}
//           title="No onboarding records"
//           description="Accepted offers appear here for joining and BGV tracking."
//         />
//       ) : displayed.length === 0 ? (
//         <EmptyState
//           icon={IconUsers}
//           title="No matching records"
//           description="Try a different search or status chip."
//         />
//       ) : (
//       <div className="cand-table-wrap">
//         <table className="cand-table hr-table">
//           <thead>
//             <tr>
//               <th>Onboarding ID</th>
//               <th>Offer ID</th>
//               <th>Candidate ID</th>
//               <th>Candidate Name</th>
//               <th>TA Owners</th>
//               <th>Sales Owner</th>
//               <th>Role</th>
//               <th>Req ID</th>
//               <th>Email</th>
//               <th>Mobile</th>
//               <th>Offer Status</th>
//               <th>CTC</th>
//               <th>HR Owner</th>
//               <th>Expected DOJ</th>
//               <th>Actual DOJ</th>
//               <th>Pending Docs</th>
//               <th>BGV</th>
//               <th>Status</th>
//               <th>Req Status</th>
//               <th>Actions</th>
//             </tr>
//           </thead>
//           <tbody>
//             {displayed.map((item) => {
//               const row = onboardingRow(item, offerStatusOptions);
//               const Meta = STATUS_META[row.onboardingStatus] || STATUS_META.DOCS_PENDING;
//               return (
//                 <tr key={row.id || row.publicId}>
//                   <td>{row.publicId}</td>
//                   <td>{row.offerPublicId}</td>
//                   <td>{row.candidatePublicId}</td>
//                   <td>{row.candidateName}</td>
//                   <td>{row.taOwners}</td>
//                   <td>{row.salesOwner}</td>
//                   <td>{row.clientRole}</td>
//                   <td>{row.reqId}</td>
//                   <td>{row.email}</td>
//                   <td>{row.mobile}</td>
//                   <td>
//                     <span className={`hr-pill hr-pill-status ${(row.offerStatus || '').toLowerCase()}`}>
//                       {row.offerStatusLabel}
//                     </span>
//                   </td>
//                   <td>{row.ctcRate}</td>
//                   <td>{row.hrOwnerName}</td>
//                   <td>{row.expectedDoj}</td>
//                   <td>{row.actualDoj}</td>
//                   <td>{row.pendingDocs ? 'Yes' : 'No'}</td>
//                   <td>
//                     <span className={`hr-pill hr-pill-bgv ${(row.bgvStatus || '').toLowerCase()}`}>
//                       {row.bgvStatus}
//                     </span>
//                   </td>
//                   <td>
//                     <span className={`hr-status-label ${Meta.cls}`}>
//                       {row.onboardingStatus}
//                     </span>
//                   </td>
//                   <td>
//                     <span className={`hr-pill hr-pill-req ${(row.requirementStatus || '').toLowerCase()}`}>
//                       {row.requirementStatus}
//                     </span>
//                   </td>
//                   <td>
//                     <button className="hr-detail-btn" onClick={() => openUpdate(item)} title="Update details">
//                       <IconEdit />
//                       <span>Update</span>
//                     </button>
//                   </td>
//                 </tr>
//               );
//             })}
//           </tbody>
//         </table>
//       </div>
//       )}

//       {modalOpen && (
//         <div className="modal-overlay" onClick={() => !saving && setModalOpen(false)}>
//           <div className="modal-card detail-modal" onClick={(e) => e.stopPropagation()}>
//             <div className="modal-head">
//               <h3>Update Onboarding Details{candidateLabel ? ` — ${candidateLabel}` : ''}</h3>
//               <button className="modal-close" onClick={() => setModalOpen(false)} title="Close">×</button>
//             </div>
//             <div className="modal-body">
//               {error && <div className="add-error">{error}</div>}
//               {loadingRow ? (
//                 <div className="screen-loading"><div className="spinner" /></div>
//               ) : (
//                 <div className="detail-grid">
//                   <label className="detail-field">
//                     <span className="detail-label">Offer Status</span>
//                     <select
//                       value={form.offerStatus || 'ACCEPTED'}
//                       onChange={(e) => setForm((p) => ({ ...p, offerStatus: e.target.value }))}
//                     >
//                       {offerStatusOptions.map((o) => (
//                         <option key={o.code} value={o.code}>{o.label}</option>
//                       ))}
//                     </select>
//                   </label>

//                   <label className="detail-field">
//                     <span className="detail-label">Docs Pending</span>
//                     <select
//                       value={form.docsPending ? 'true' : 'false'}
//                       onChange={(e) => setForm((p) => ({ ...p, docsPending: e.target.value === 'true' }))}
//                     >
//                       <option value="true">Yes</option>
//                       <option value="false">No</option>
//                     </select>
//                   </label>

//                   <label className="detail-field">
//                     <span className="detail-label">BGV Status</span>
//                     <select
//                       value={form.bgvStatusCode}
//                       onChange={(e) => setForm((p) => ({ ...p, bgvStatusCode: e.target.value }))}
//                     >
//                       {BGV_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
//                     </select>
//                   </label>

//                   <label className="detail-field">
//                     <span className="detail-label">Onboarding Status</span>
//                     <select
//                       value={form.onboardingStatus}
//                       onChange={(e) => setForm((p) => ({ ...p, onboardingStatus: e.target.value }))}
//                     >
//                       {ONBOARDING_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
//                     </select>
//                   </label>

//                   <label className="detail-field">
//                     <span className="detail-label">Expected DOJ</span>
//                     <input
//                       type="date"
//                       value={form.expectedDoj || ''}
//                       onChange={(e) => setForm((p) => ({ ...p, expectedDoj: e.target.value }))}
//                     />
//                   </label>

//                   <label className="detail-field">
//                     <span className="detail-label">Actual DOJ</span>
//                     <input
//                       type="date"
//                       value={form.actualDoj || ''}
//                       onChange={(e) => setForm((p) => ({ ...p, actualDoj: e.target.value }))}
//                     />
//                   </label>

//                   <label className="detail-field full">
//                     <span className="detail-label">Joining Formalities</span>
//                     <input
//                       type="text"
//                       value={form.joiningFormalities || ''}
//                       onChange={(e) => setForm((p) => ({ ...p, joiningFormalities: e.target.value }))}
//                     />
//                   </label>

//                   <label className="detail-field full">
//                     <span className="detail-label">Remarks</span>
//                     <textarea
//                       rows={3}
//                       value={form.remarks || ''}
//                       onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
//                     />
//                   </label>
//                 </div>
//               )}
//             </div>
//             <div className="modal-foot">
//               <button className="filter-clear" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
//               <button className="hr-detail-save" onClick={saveOnboarding} disabled={saving || loadingRow}>
//                 <IconFilePlus />
//                 <span>{saving ? 'Saving…' : 'Update Details'}</span>
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

import { useEffect, useMemo, useState } from 'react';
import { get, patch, del } from '../../services/apiClient';
import { ENDPOINTS } from '../../config/api';
import {
  IconUsers,
  IconUserCheck,
  IconClock,
  IconCheckCircle,
  IconXCircle,
  IconBriefcase,
  IconEdit,
  IconFilePlus,
  IconFilter,
  IconX,
  IconTrash,
} from '../../components/Icons';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { formatDate, toDateInput } from '../../utils/formatDate';
import { matchesQuery, useDebouncedValue } from '../../utils/listSearch';
import TableSearch from '../../components/TableSearch';
import { EmptyState, ScreenSkeleton } from '../../components/ui';
import DownloadExcelButton from '../../components/DownloadExcelButton';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import './../pageCss/HrCandidatesScreen.css';

const STATUS_META = {
  JOINED: { icon: IconCheckCircle, cls: 'joined' },
  DOCS_PENDING: { icon: IconClock, cls: 'pending' },
  IN_PROGRESS: { icon: IconBriefcase, cls: 'progress' },
  ON_HOLD: { icon: IconXCircle, cls: 'hold' },
  BACKOUT: { icon: IconXCircle, cls: 'backout' },
  COMPLETED: { icon: IconUserCheck, cls: 'completed' },
};

const BGV_OPTIONS = ['NOT_STARTED', 'IN_PROGRESS', 'CLEARED', 'FAILED'];

const ONBOARDING_STATUS_OPTIONS = [
  'DOCS_PENDING',
  'IN_PROGRESS',
  'JOINED',
  'ON_HOLD',
  'COMPLETED',
  'BACKOUT',
];

const HR_OFFER_STATUS_CODES = [
  'RELEASED',
  'ACCEPTED',
  'DECLINED',
  'HOLD',
  'BACKOUT',
];

const FALLBACK_OFFER_STATUSES = [
  { code: 'INITIATED', label: 'Initiated' },
  { code: 'RELEASED', label: 'Released' },
  { code: 'ACCEPTED', label: 'Accepted' },
  { code: 'DECLINED', label: 'Declined' },
  { code: 'HOLD', label: 'Hold' },
  { code: 'BACKOUT', label: 'Backout' },
];

function normalizeList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

function normalizeLookups(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.values)) return res.values;
  return [];
}

function statusLabel(code, options) {
  const found = options.find((o) => o.code === code);
  return found?.label || code || '—';
}

function onboardingRow(o, offerStatusOptions = FALLBACK_OFFER_STATUSES) {
  const offerStatus = o.offerStatus || o.offer?.statusCode || '';

  return {
    id: o.id,
    publicId: o.onboardingId || o.publicId || o.id || '—',
    offerPublicId: o.offerPublicId || o.offer?.publicId || '—',
    candidateId: o.candidateId || o.candidate?.id || '',
    candidatePublicId:
      o.candidatePublicId ||
      o.candidateCode ||
      o.candidate?.publicId ||
      '—',
    candidateName: o.candidateName || o.candidate?.name || '—',
    clientRole: o.clientRole || o.requirement?.roleSkill || '—',
    reqId: o.reqId || o.requirementPublicId || o.requirement?.publicId || '—',
    mobile: o.mobileNumber || o.candidate?.mobile || '—',
    email: o.emailAddress || o.candidate?.email || '—',
    offerStatus,
    offerStatusLabel: statusLabel(offerStatus, offerStatusOptions),
    ctcRate: o.ctcRate || o.offer?.ctcRate || '—',
    hrOwnerId: o.hrOwnerId || o.hrOwner?.id || '',
    hrOwnerName: o.hrOwnerName || o.hrOwner?.fullName || '—',
    expectedDoj: formatDate(o.expectedDOJ || o.expectedDoj),
    actualDoj: formatDate(o.actualDOJ || o.actualDoj),
    pendingDocs: o.pendingDocs ?? o.docsPending,
    bgvStatus: o.bgvStatus || o.bgvStatusCode || '—',
    onboardingStatus: o.onboardingStatus || o.statusCode || '—',
    requirementStatus: o.requirementStatus || o.requirement?.status || '—',
    remarks: o.remarks || '—',
    salesOwner: o.salesOwnerName || o.salesOwner?.fullName || '—',
    taOwners:
      o.taOwnerNames ||
      (Array.isArray(o.taOwners)
        ? o.taOwners.map((t) => t.fullName || t).filter(Boolean).join(', ')
        : '') ||
      '—',
  };
}

export default function HrCandidatesScreen() {
  const { toast } = useToast();
  const { theme } = useTheme();
  const { user } = useAuth();
  const canDelete = user?.userType === 'admin';

  const isDark = theme === 'dark';

  const [rows, setRows] = useState([]);
  const [offerStatusOptions, setOfferStatusOptions] = useState(
    FALLBACK_OFFER_STATUSES
  );
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [candidateLabel, setCandidateLabel] = useState('');

  const [form, setForm] = useState({
    offerStatus: 'ACCEPTED',
    docsPending: true,
    bgvStatusCode: 'NOT_STARTED',
    onboardingStatus: 'DOCS_PENDING',
    joiningFormalities: '',
    expectedDoj: '',
    actualDoj: '',
    remarks: '',
  });

  const [saving, setSaving] = useState(false);
  const [loadingRow, setLoadingRow] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [listSearch, setListSearch] = useState('');
  const listSearchQ = useDebouncedValue(listSearch);

  useEscapeKey(modalOpen, () => {
    if (!saving) setModalOpen(false);
  });

  const loadOnboardings = async () => {
    const res = await get(ENDPOINTS.ONBOARDINGS);
    setRows(normalizeList(res));
  };

  useEffect(() => {
    let active = true;

    setLoading(true);

    Promise.all([
      get(ENDPOINTS.ONBOARDINGS),
      get(`${ENDPOINTS.LOOKUPS}/OFFER_STATUS`).catch(() => null),
    ])
      .then(([res, lookupRes]) => {
        if (!active) return;

        setRows(normalizeList(res));

        const lookups = normalizeLookups(lookupRes)
          .map((v) => ({
            code: String(v.code || '').toUpperCase(),
            label: v.label || v.code,
          }))
          .filter((v) => v.code);

        if (lookups.length) {
          const allowed = new Set([
            'INITIATED',
            ...HR_OFFER_STATUS_CODES,
          ]);

          const filtered = lookups.filter((v) => allowed.has(v.code));

          setOfferStatusOptions(
            filtered.length ? filtered : FALLBACK_OFFER_STATUSES
          );
        }
      })
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const statuses = useMemo(() => {
    const statusSet = new Set();

    rows.forEach((r) => {
      const status = r.onboardingStatus || r.statusCode;
      if (status) statusSet.add(status);
    });

    return [...statusSet];
  }, [rows]);

  const counts = useMemo(() => {
    const base = { All: rows.length };

    statuses.forEach((status) => {
      base[status] = 0;
    });

    rows.forEach((r) => {
      const status = r.onboardingStatus || r.statusCode;
      if (status) base[status] = (base[status] || 0) + 1;
    });

    return base;
  }, [rows, statuses]);

  const visible =
    filter === 'All'
      ? rows
      : rows.filter(
          (r) => (r.onboardingStatus || r.statusCode) === filter
        );

  const deleteCandidate = async (item) => {
    const candidateId = item?.candidateId || item?.candidate?.id;
    if (!canDelete || !candidateId) return;
    const label = item.candidateName || item.candidate?.name || 'this candidate';
    const ok = window.confirm(
      `Delete ${label}? The candidate and any linked offer/onboarding will be removed from active views. This cannot be undone from the UI.`,
    );
    if (!ok) return;
    setDeletingId(candidateId);
    try {
      const res = await del(`${ENDPOINTS.CANDIDATES}/${candidateId}`);
      toast(res?.message || 'Candidate deleted');
      await loadOnboardings();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete candidate';
      toast(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setDeletingId(null);
    }
  };

  const openUpdate = async (item) => {
    const id = item.id;
    if (!id) return;

    setEditingId(id);

    setCandidateLabel(
      [
        item.candidatePublicId || item.candidate?.publicId,
        item.candidateName || item.candidate?.name,
      ]
        .filter(Boolean)
        .join(' — ')
    );

    setError(null);
    setSuccess(null);
    setModalOpen(true);
    setLoadingRow(true);

    try {
      const res = await get(`${ENDPOINTS.ONBOARDINGS}/${id}`);
      const data = res?.onboarding || res?.data || res;

      setForm({
        offerStatus: data.offerStatus || data.offer?.statusCode || 'ACCEPTED',
        docsPending: data.docsPending ?? data.pendingDocs ?? true,
        bgvStatusCode: data.bgvStatusCode || data.bgvStatus || 'NOT_STARTED',
        onboardingStatus:
          data.onboardingStatus || data.statusCode || 'DOCS_PENDING',
        joiningFormalities: data.joiningFormalities || '',
        expectedDoj: toDateInput(data.expectedDoj || data.expectedDOJ),
        actualDoj: toDateInput(data.actualDoj || data.actualDOJ),
        remarks: data.remarks || '',
      });
    } catch {
      setForm({
        offerStatus: item.offerStatus || item.offer?.statusCode || 'ACCEPTED',
        docsPending: item.docsPending ?? item.pendingDocs ?? true,
        bgvStatusCode: item.bgvStatusCode || item.bgvStatus || 'NOT_STARTED',
        onboardingStatus:
          item.onboardingStatus || item.statusCode || 'DOCS_PENDING',
        joiningFormalities: item.joiningFormalities || '',
        expectedDoj: toDateInput(item.expectedDoj || item.expectedDOJ),
        actualDoj: toDateInput(item.actualDoj || item.actualDOJ),
        remarks: item.remarks || '',
      });
    } finally {
      setLoadingRow(false);
    }
  };

  const saveOnboarding = async () => {
    if (!editingId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        offerStatus: form.offerStatus || undefined,
        docsPending: !!form.docsPending,
        bgvStatusCode: form.bgvStatusCode || 'NOT_STARTED',
        onboardingStatus: form.onboardingStatus || 'DOCS_PENDING',
        joiningFormalities: form.joiningFormalities || '',
        expectedDoj: form.expectedDoj || null,
        actualDoj: form.actualDoj || null,
        remarks: form.remarks || '',
      };

      const res = await patch(
        `${ENDPOINTS.ONBOARDINGS}/${editingId}`,
        payload
      );

      const offerLeftAccepted =
        String(form.offerStatus || '').toUpperCase() !== 'ACCEPTED';

      const okMsg = offerLeftAccepted
        ? res?.message || 'Offer updated — candidate returned to Offers'
        : res?.message || 'Onboarding updated successfully';

      setSuccess(okMsg);
      toast(okMsg);
      setModalOpen(false);

      await loadOnboardings();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update onboarding.';

      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenSkeleton rows={8} />;

  const displayed = visible.filter((item) => {
    const row = onboardingRow(item, offerStatusOptions);

    return matchesQuery(
      listSearchQ,
      row.publicId,
      row.offerPublicId,
      row.candidatePublicId,
      row.candidateName,
      row.email,
      row.mobile,
      row.clientRole,
      row.reqId
    );
  });

  const hasFilters = Boolean(filter !== 'All' || listSearch.trim());

  const clearFilters = () => {
    setFilter('All');
    setListSearch('');
  };

  const exportRows = displayed.map((item) =>
    onboardingRow(item, offerStatusOptions)
  );

  return (
    <div className={`obx-screen ${isDark ? 'obx-dark' : 'obx-light'}`}>
      {/* PAGE HEADER */}
      <header className="obx-header">
        <div className="obx-header-main">
          <span className="obx-header-icon">
            <IconUsers />
          </span>

          <div className="obx-heading-copy">
            <div className="obx-heading-eyebrow">HR MANAGEMENT</div>
            <h2>Onboarding</h2>
            <p>Track candidate joining, documentation and verification.</p>
          </div>
        </div>

        <div className="obx-header-meta">
          <div className="obx-record-count">
            <strong>{displayed.length}</strong>
            <span>of {rows.length} records</span>
          </div>
        </div>
      </header>

      {/* STATUS OVERVIEW */}
      <section className="obx-status-panel">
        <div className="obx-status-heading">
          <div>
            <span className="obx-section-kicker">OVERVIEW</span>
            <h3>Onboarding status</h3>
          </div>

          {hasFilters && (
            <button
              type="button"
              className="obx-clear-button"
              onClick={clearFilters}
            >
              <IconX />
              Clear filters
            </button>
          )}
        </div>

        <div className="obx-status-list">
          {['All', ...statuses].map((s) => {
            const Meta = STATUS_META[s];
            const StatusIcon = Meta ? Meta.icon : IconUsers;

            return (
              <button
                type="button"
                key={s}
                className={`obx-status-chip ${
                  filter === s ? 'is-active' : ''
                } ${Meta ? `obx-${Meta.cls}` : 'obx-all'}`}
                onClick={() => setFilter(s)}
              >
                <span className="obx-chip-icon">
                  <StatusIcon />
                </span>

                <span className="obx-chip-label">
                  {s === 'All' ? 'All records' : s.replaceAll('_', ' ')}
                </span>

                <span className="obx-chip-count">{counts[s] || 0}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* TOOLBAR */}
      <section className="obx-toolbar">
        <div className="obx-toolbar-left">
          <div className="obx-toolbar-title">
            <IconFilter />
            <span>Onboarding records</span>
            <span className="obx-toolbar-total">{displayed.length}</span>
          </div>

          {hasFilters && (
            <div className="obx-active-filters">
              {filter !== 'All' && (
                <button type="button" onClick={() => setFilter('All')}>
                  {filter.replaceAll('_', ' ')}
                  <IconX />
                </button>
              )}

              {listSearch.trim() && (
                <button type="button" onClick={() => setListSearch('')}>
                  {listSearch.trim()}
                  <IconX />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="obx-toolbar-actions">
          <TableSearch
            value={listSearch}
            onChange={setListSearch}
            placeholder="Search candidates, IDs..."
          />

          <DownloadExcelButton
            filename="onboarding"
            rows={exportRows}
            columns={[
              { label: 'Onboarding ID', key: 'publicId' },
              { label: 'Offer ID', key: 'offerPublicId' },
              { label: 'Candidate ID', key: 'candidatePublicId' },
              { label: 'Candidate Name', key: 'candidateName' },
              { label: 'TA Owners', key: 'taOwners' },
              { label: 'Sales Owner', key: 'salesOwner' },
              { label: 'Role', key: 'clientRole' },
              { label: 'Req ID', key: 'reqId' },
              { label: 'Email', key: 'email' },
              { label: 'Mobile', key: 'mobile' },
              { label: 'Offer Status', key: 'offerStatusLabel' },
              { label: 'CTC', key: 'ctcRate' },
              { label: 'HR Owner', key: 'hrOwnerName' },
              { label: 'Expected DOJ', key: 'expectedDoj' },
              { label: 'Actual DOJ', key: 'actualDoj' },
              {
                label: 'Pending Docs',
                value: (row) => (row.pendingDocs ? 'Yes' : 'No'),
              },
              { label: 'BGV', key: 'bgvStatus' },
              { label: 'Status', key: 'onboardingStatus' },
              { label: 'Req Status', key: 'requirementStatus' },
            ]}
          />
        </div>
      </section>

      {error && !modalOpen && (
        <div className="obx-alert obx-alert-error">{error}</div>
      )}

      {success && (
        <div className="obx-alert obx-alert-success">{success}</div>
      )}

      {/* TABLE */}
      <section className="obx-table-panel">
        {rows.length === 0 ? (
          <EmptyState
            icon={IconUsers}
            title="No onboarding records"
            description="Accepted offers appear here for joining and BGV tracking."
          />
        ) : displayed.length === 0 ? (
          <EmptyState
            icon={IconUsers}
            title="No matching records"
            description="Try a different search or status filter."
          />
        ) : (
          <div className="obx-table-scroll">
            <table className="obx-table">
              <thead>
                <tr>
                  <th>Onboarding ID</th>
                  <th>Offer ID</th>
                  <th>Candidate ID</th>
                  <th>Candidate</th>
                  <th>TA Owners</th>
                  <th>Sales Owner</th>
                  <th>Role</th>
                  <th>Req ID</th>
                  <th>Email</th>
                  <th>Mobile</th>
                  <th>Offer Status</th>
                  <th>CTC</th>
                  <th>HR Owner</th>
                  <th>Expected DOJ</th>
                  <th>Actual DOJ</th>
                  <th>Pending Docs</th>
                  <th>BGV</th>
                  <th>Onboarding</th>
                  <th>Req Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {displayed.map((item) => {
                  const row = onboardingRow(item, offerStatusOptions);
                  const Meta =
                    STATUS_META[row.onboardingStatus] ||
                    STATUS_META.DOCS_PENDING;

                  return (
                    <tr key={row.id || row.publicId}>
                      <td>
                        <span className="obx-primary-cell">{row.publicId}</span>
                      </td>
                      <td>{row.offerPublicId}</td>
                      <td>{row.candidatePublicId}</td>

                      <td>
                        <div className="obx-candidate-cell">
                          <strong>{row.candidateName}</strong>
                          <span>{row.candidatePublicId}</span>
                        </div>
                      </td>

                      <td>{row.taOwners}</td>
                      <td>{row.salesOwner}</td>
                      <td>{row.clientRole}</td>
                      <td>{row.reqId}</td>
                      <td>{row.email}</td>
                      <td>{row.mobile}</td>

                      <td>
                        <span className={`obx-pill obx-offer-${(row.offerStatus || '').toLowerCase()}`}>
                          {row.offerStatusLabel}
                        </span>
                      </td>

                      <td>{row.ctcRate}</td>
                      <td>{row.hrOwnerName}</td>
                      <td>{row.expectedDoj}</td>
                      <td>{row.actualDoj}</td>

                      <td>
                        <span
                          className={`obx-doc-flag ${
                            row.pendingDocs ? 'is-pending' : 'is-clear'
                          }`}
                        >
                          <span />
                          {row.pendingDocs ? 'Pending' : 'Clear'}
                        </span>
                      </td>

                      <td>
                        <span className={`obx-pill obx-bgv-${String(row.bgvStatus).toLowerCase()}`}>
                          {row.bgvStatus.replaceAll('_', ' ')}
                        </span>
                      </td>

                      <td>
                        <span className={`obx-status-badge obx-status-${Meta.cls}`}>
                          {row.onboardingStatus.replaceAll('_', ' ')}
                        </span>
                      </td>

                      <td>
                        <span className={`obx-pill obx-req-${String(row.requirementStatus).toLowerCase()}`}>
                          {row.requirementStatus}
                        </span>
                      </td>

                      <td>
                        <div className="obx-action-row">
                          <button
                            type="button"
                            className="obx-update-button"
                            onClick={() => openUpdate(item)}
                            title="Update onboarding details"
                          >
                            <IconEdit />
                            <span>Update</span>
                          </button>
                          {canDelete && row.candidateId && (
                            <button
                              type="button"
                              className="obx-update-button obx-update-button--danger"
                              onClick={() => deleteCandidate(item)}
                              disabled={deletingId === row.candidateId}
                              title="Delete candidate"
                            >
                              <IconTrash />
                              <span>{deletingId === row.candidateId ? 'Deleting…' : 'Delete'}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* UPDATE MODAL */}
      {modalOpen && (
        <div
          className="obx-modal-overlay"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div className="obx-modal" onClick={(e) => e.stopPropagation()}>
            <header className="obx-modal-header">
              <div>
                <span className="obx-modal-eyebrow">HR MANAGEMENT</span>
                <h3>Update onboarding</h3>
                <p>{candidateLabel || 'Candidate details'}</p>
              </div>

              <button
                type="button"
                className="obx-modal-close"
                onClick={() => !saving && setModalOpen(false)}
                title="Close"
              >
                <IconX />
              </button>
            </header>

            <div className="obx-modal-body">
              {error && (
                <div className="obx-alert obx-alert-error">{error}</div>
              )}

              {loadingRow ? (
                <div className="obx-modal-loading">
                  <div className="obx-spinner" />
                  <span>Loading onboarding details...</span>
                </div>
              ) : (
                <div className="obx-form-grid">
                  <label className="obx-form-field">
                    <span>Offer status</span>
                    <select
                      value={form.offerStatus || 'ACCEPTED'}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          offerStatus: e.target.value,
                        }))
                      }
                    >
                      {offerStatusOptions.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="obx-form-field">
                    <span>Documents pending</span>
                    <select
                      value={form.docsPending ? 'true' : 'false'}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          docsPending: e.target.value === 'true',
                        }))
                      }
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </label>

                  <label className="obx-form-field">
                    <span>BGV status</span>
                    <select
                      value={form.bgvStatusCode}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          bgvStatusCode: e.target.value,
                        }))
                      }
                    >
                      {BGV_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>

                  <label className="obx-form-field">
                    <span>Onboarding status</span>
                    <select
                      value={form.onboardingStatus}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          onboardingStatus: e.target.value,
                        }))
                      }
                    >
                      {ONBOARDING_STATUS_OPTIONS.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>

                  <label className="obx-form-field">
                    <span>Expected DOJ</span>
                    <input
                      type="date"
                      value={form.expectedDoj || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          expectedDoj: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="obx-form-field">
                    <span>Actual DOJ</span>
                    <input
                      type="date"
                      value={form.actualDoj || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          actualDoj: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="obx-form-field obx-field-full">
                    <span>Joining formalities</span>
                    <input
                      type="text"
                      value={form.joiningFormalities || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          joiningFormalities: e.target.value,
                        }))
                      }
                      placeholder="Enter joining formalities"
                    />
                  </label>

                  <label className="obx-form-field obx-field-full">
                    <span>Remarks</span>
                    <textarea
                      rows={3}
                      value={form.remarks || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          remarks: e.target.value,
                        }))
                      }
                      placeholder="Add any additional remarks..."
                    />
                  </label>
                </div>
              )}
            </div>

            <footer className="obx-modal-footer">
              <button
                type="button"
                className="obx-cancel-button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="obx-save-button"
                onClick={saveOnboarding}
                disabled={saving || loadingRow}
              >
                <IconFilePlus />
                <span>{saving ? 'Saving...' : 'Save changes'}</span>
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
