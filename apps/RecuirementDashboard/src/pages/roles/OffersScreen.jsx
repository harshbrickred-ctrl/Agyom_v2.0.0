
import { useEffect, useState } from 'react';
import { get, patch, del } from '../../services/apiClient';
import { ENDPOINTS } from '../../config/api';
import {
  IconCheckCircle,
  IconFilePlus,
  IconEdit,
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
import { useAuth } from '../../context/AuthContext';
import './../pageCss/OffersScreen.css';

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

function normalizeOffers(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.offers)) return res.offers;
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

function offerRow(o, statusOptions) {
  const status = o.offerStatus || o.statusCode || '';

  return {
    id: o.id,
    publicId: o.publicId || o.id || '—',
    candidateId: o.candidateId || o.candidate?.id || '',
    candidatePublicId: o.candidatePublicId || o.candidate?.publicId || '—',
    candidateName: o.candidateName || o.candidate?.name || '—',
    position: o.position || o.requirement?.roleSkill || '—',
    client: o.client || o.requirement?.client || '—',
    email: o.email || o.candidate?.email || '—',
    mobile: o.mobile || o.candidate?.mobile || '—',
    status,
    statusLabel: statusLabel(status, statusOptions),
    ctcRate: o.ctcRate || '—',
    selectedDate: formatDate(o.selectedDate),
    offerInitiatedDate: formatDate(o.offerInitiatedDate),
    offerReleasedDate: formatDate(o.offerReleasedDate),
    expectedDoj: formatDate(o.expectedDoj),
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

function getOfferStatusClass(status) {
  const normalized = String(status || 'initiated').toLowerCase();

  if (normalized === 'accepted') return 'ofx-status--accepted';
  if (normalized === 'released') return 'ofx-status--released';
  if (normalized === 'declined' || normalized === 'backout') {
    return 'ofx-status--declined';
  }
  if (normalized === 'hold') return 'ofx-status--hold';

  return 'ofx-status--initiated';
}

export default function OffersScreen() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canDelete = user?.userType === 'admin';

  const [offers, setOffers] = useState([]);
  const [statusOptions, setStatusOptions] = useState(FALLBACK_OFFER_STATUSES);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [candidateLabel, setCandidateLabel] = useState('');

  const [form, setForm] = useState({
    statusCode: 'INITIATED',
    offerInitiatedDate: '',
    offerReleasedDate: '',
    ctcRate: '',
    expectedDoj: '',
    remarks: '',
  });

  const [saving, setSaving] = useState(false);
  const [loadingOffer, setLoadingOffer] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [listSearch, setListSearch] = useState('');
  const listSearchQ = useDebouncedValue(listSearch);
  const [statusFilter, setStatusFilter] = useState('');

  useEscapeKey(modalOpen, () => {
    if (!saving) setModalOpen(false);
  });

  const loadOffers = async () => {
    const res = await get(ENDPOINTS.OFFERS);
    setOffers(normalizeOffers(res));
  };

  useEffect(() => {
    let active = true;

    setLoading(true);

    Promise.all([
      get(ENDPOINTS.OFFERS),
      get(`${ENDPOINTS.LOOKUPS}/OFFER_STATUS`).catch(() => null),
    ])
      .then(([offersRes, lookupRes]) => {
        if (!active) return;

        setOffers(normalizeOffers(offersRes));

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

          setStatusOptions(
            filtered.length ? filtered : FALLBACK_OFFER_STATUSES,
          );
        }
      })
      .catch(() => active && setOffers([]))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const selectOptions = (() => {
    const codes = new Set(statusOptions.map((o) => o.code));

    if (!codes.has('INITIATED')) {
      return [
        { code: 'INITIATED', label: 'Initiated' },
        ...statusOptions,
      ];
    }

    return statusOptions;
  })();

  const openUpdate = async (offer) => {
    const id = offer.id;
    if (!id) return;

    setEditingId(id);

    setCandidateLabel(
      [
        offer.candidatePublicId || offer.candidate?.publicId,
        offer.candidateName || offer.candidate?.name,
      ]
        .filter(Boolean)
        .join(' — '),
    );

    setError(null);
    setSuccess(null);
    setModalOpen(true);
    setLoadingOffer(true);

    try {
      const res = await get(`${ENDPOINTS.OFFERS}/${id}`);
      const data = res?.offer || res?.data || res;

      setForm({
        statusCode: data.offerStatus || data.statusCode || 'INITIATED',
        offerInitiatedDate: toDateInput(data.offerInitiatedDate),
        offerReleasedDate: toDateInput(data.offerReleasedDate),
        ctcRate: data.ctcRate || '',
        expectedDoj: toDateInput(data.expectedDoj),
        remarks: data.remarks || '',
      });

      setCandidateLabel(
        [
          data.candidatePublicId || data.candidate?.publicId,
          data.candidateName || data.candidate?.name,
        ]
          .filter(Boolean)
          .join(' — ') || candidateLabel,
      );
    } catch {
      setForm({
        statusCode: offer.offerStatus || offer.statusCode || 'INITIATED',
        offerInitiatedDate: toDateInput(offer.offerInitiatedDate),
        offerReleasedDate: toDateInput(offer.offerReleasedDate),
        ctcRate: offer.ctcRate || '',
        expectedDoj: toDateInput(offer.expectedDoj),
        remarks: offer.remarks || '',
      });
    } finally {
      setLoadingOffer(false);
    }
  };

  const deleteCandidate = async (offer) => {
    const candidateId = offer?.candidateId || offer?.candidate?.id;
    if (!canDelete || !candidateId) return;
    const label = offer.candidateName || offer.candidate?.name || 'this candidate';
    const ok = window.confirm(
      `Delete ${label}? The candidate and any linked offer/onboarding will be removed from active views. This cannot be undone from the UI.`,
    );
    if (!ok) return;
    setDeletingId(candidateId);
    try {
      const res = await del(`${ENDPOINTS.CANDIDATES}/${candidateId}`);
      toast(res?.message || 'Candidate deleted');
      await loadOffers();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete candidate';
      toast(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setDeletingId(null);
    }
  };

  const saveOffer = async () => {
    if (!editingId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        statusCode: form.statusCode || 'INITIATED',
        offerInitiatedDate: form.offerInitiatedDate || null,
        offerReleasedDate: form.offerReleasedDate || null,
        ctcRate: form.ctcRate || '',
        expectedDoj: form.expectedDoj || null,
        remarks: form.remarks || '',
      };

      const res = await patch(
        `${ENDPOINTS.OFFERS}/${editingId}`,
        payload,
      );

      const nextStatus = String(form.statusCode || '').toUpperCase();

      const okMsg =
        nextStatus === 'ACCEPTED'
          ? res?.message || 'Offer accepted — candidate moved to Onboarding'
          : res?.message || 'Offer updated successfully';

      setSuccess(okMsg);
      toast(okMsg);
      setModalOpen(false);

      await loadOffers();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to update offer.';

      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenSkeleton rows={8} />;

  const visibleOffers = offers.filter(
    (o) =>
      String(o.offerStatus || o.statusCode || '').toUpperCase() !==
      'ACCEPTED',
  );

  // const statusChoices = [
  //   ...new Set(
  //     visibleOffers
  //       .map((o) =>
  //         String(o.offerStatus || o.statusCode || '').toUpperCase(),
  //       )
  //       .filter(Boolean),
  //   ),
  // ];
  const statusChoices = [
  ...new Set([
    'INITIATED',
    ...HR_OFFER_STATUS_CODES,
  ]),
];

  const statusFiltered = statusFilter
    ? visibleOffers.filter(
        (o) =>
          String(o.offerStatus || o.statusCode || '').toUpperCase() ===
          statusFilter,
      )
    : visibleOffers;

  const displayedOffers = statusFiltered.filter((o) => {
    const row = offerRow(o, selectOptions);

    return matchesQuery(
      listSearchQ,
      row.publicId,
      row.candidatePublicId,
      row.candidateName,
      row.email,
      row.mobile,
      row.position,
      row.client,
    );
  });

  const hasFilters = Boolean(statusFilter || listSearch.trim());

  const clearFilters = () => {
    setStatusFilter('');
    setListSearch('');
  };

  const exportColumns = [
    { label: 'Offer ID', key: 'publicId' },
    { label: 'Candidate ID', key: 'candidatePublicId' },
    { label: 'Candidate Name', key: 'candidateName' },
    { label: 'TA Owners', key: 'taOwners' },
    { label: 'Sales Owner', key: 'salesOwner' },
    { label: 'Position', key: 'position' },
    { label: 'Client', key: 'client' },
    { label: 'Email', key: 'email' },
    { label: 'Mobile', key: 'mobile' },
    { label: 'Offer Status', key: 'statusLabel' },
    { label: 'CTC Rate', key: 'ctcRate' },
    { label: 'Selected', key: 'selectedDate' },
    { label: 'Initiated', key: 'offerInitiatedDate' },
    { label: 'Released', key: 'offerReleasedDate' },
    { label: 'Expected DOJ', key: 'expectedDoj' },
  ];

  return (
    <div className="ofx-screen">
      {/* Page heading */}
      <div className="ofx-page-header">
        <div className="ofx-heading-main">
          <span className="ofx-heading-icon">
            <IconCheckCircle />
          </span>

          <div className="ofx-heading-copy">
            <div className="ofx-eyebrow">RECRUITMENT MANAGEMENT</div>
            <h2 className="ofx-page-title">Offers</h2>
            <p className="ofx-page-description">
              Track candidate offers and manage offer progress.
              Accepted candidates move to Onboarding.
            </p>
          </div>
        </div>

        <div className="ofx-header-actions">
          <div className="ofx-record-count">
            <span className="ofx-count-value">
              {displayedOffers.length}
            </span>
            <span className="ofx-count-label">Showing</span>
          </div>

          <div className="ofx-export-button">
            <DownloadExcelButton
              filename="offers"
              rows={displayedOffers.map((offer) =>
                offerRow(offer, selectOptions),
              )}
              columns={exportColumns}
            />
          </div>
        </div>
      </div>

      {/* Feedback */}
      {error && !modalOpen && (
        <div className="ofx-alert ofx-alert--error">
          {error}
        </div>
      )}

      {success && (
        <div className="ofx-alert ofx-alert--success">
          {success}
        </div>
      )}

      {/* Filters */}
      {visibleOffers.length > 0 && (
        <section className="ofx-filter-card">
          <div className="ofx-filter-header">
            <div className="ofx-filter-heading">
              <span className="ofx-filter-icon">
                <IconFilter />
              </span>
              <span className="ofx-filter-title">Filters</span>

              {hasFilters && (
                <span className="ofx-active-count">
                  {(statusFilter ? 1 : 0) +
                    (listSearch.trim() ? 1 : 0)}{' '}
                  active
                </span>
              )}
            </div>

            {hasFilters && (
              <button
                type="button"
                className="ofx-clear-button"
                onClick={clearFilters}
              >
                <IconX />
                <span>Clear filters</span>
              </button>
            )}
          </div>

          <div className="ofx-filter-controls">
            <label className="ofx-filter-field">
              <span className="ofx-field-caption">Offer status</span>
              <select
                className="ofx-control"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {statusChoices.map((code) => (
                  <option key={code} value={code}>
                    {statusLabel(code, selectOptions)}
                  </option>
                ))}
              </select>
            </label>

            <div className="ofx-search-field">
              <span className="ofx-field-caption">Search records</span>
              <TableSearch
                value={listSearch}
                onChange={setListSearch}
                placeholder="Search offers, candidates, IDs..."
              />
            </div>
          </div>

          {hasFilters && (
            <div className="ofx-active-filters">
              {statusFilter && (
                <button
                  type="button"
                  className="ofx-filter-chip"
                  onClick={() => setStatusFilter('')}
                >
                  <span>
                    Status: {statusLabel(statusFilter, selectOptions)}
                  </span>
                  <IconX />
                </button>
              )}

              {listSearch.trim() && (
                <button
                  type="button"
                  className="ofx-filter-chip"
                  onClick={() => setListSearch('')}
                >
                  <span>Search: {listSearch.trim()}</span>
                  <IconX />
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Results */}
      <section className="ofx-results-card">
        <div className="ofx-results-header">
          <div>
            <h3 className="ofx-section-title">Offer records</h3>
            <p className="ofx-section-description">
              {visibleOffers.length === 0
                ? 'Candidate offer records will appear here.'
                : 'Review offer details and update candidate offer status.'}
            </p>
          </div>

          <span className="ofx-results-total">
            {displayedOffers.length} records
          </span>
        </div>

        {visibleOffers.length === 0 ? (
          <div className="ofx-empty-state">
            <EmptyState
              icon={IconCheckCircle}
              title="No offers found"
              description="Accepted offers move to Onboarding. New offers will appear here."
            />
          </div>
        ) : displayedOffers.length === 0 ? (
          <div className="ofx-empty-state">
            <EmptyState
              icon={IconCheckCircle}
              title="No matching offers"
              description="Try changing your search or filters."
            />
          </div>
        ) : (
          <div className="ofx-table-viewport">
            <div className="ofx-table-scroll">
              <table className="ofx-table">
                <thead>
                  <tr>
                    <th>Offer ID</th>
                    <th>Candidate ID</th>
                    <th>Candidate Name</th>
                    <th>TA Owners</th>
                    <th>Sales Owner</th>
                    <th>Position</th>
                    <th>Client</th>
                    <th>Email</th>
                    <th>Mobile</th>
                    <th>Offer Status</th>
                    <th>CTC Rate</th>
                    <th>Selected</th>
                    <th>Initiated</th>
                    <th>Released</th>
                    <th>Expected DOJ</th>
                    <th className="ofx-action-heading">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {displayedOffers.map((o) => {
                    const row = offerRow(o, selectOptions);

                    return (
                      <tr key={row.id || row.publicId}>
                        <td>
                          <span className="ofx-primary-cell">
                            {row.publicId}
                          </span>
                        </td>
                        <td>{row.candidatePublicId}</td>
                        <td>
                          <span className="ofx-candidate-name">
                            {row.candidateName}
                          </span>
                        </td>
                        <td>{row.taOwners}</td>
                        <td>{row.salesOwner}</td>
                        <td>{row.position}</td>
                        <td>{row.client}</td>
                        <td className="ofx-contact-cell">{row.email}</td>
                        <td>{row.mobile}</td>
                        <td>
                          <span
                            className={`ofx-status ${getOfferStatusClass(
                              row.status,
                            )}`}
                          >
                            <span className="ofx-status-dot" />
                            {row.statusLabel}
                          </span>
                        </td>
                        <td>{row.ctcRate}</td>
                        <td>{row.selectedDate}</td>
                        <td>{row.offerInitiatedDate}</td>
                        <td>{row.offerReleasedDate}</td>
                        <td>{row.expectedDoj}</td>
                        <td className="ofx-action-cell">
                          <div className="ofx-action-row">
                            <button
                              type="button"
                              className="ofx-update-button"
                              onClick={() => openUpdate(o)}
                              title="Update offer details"
                            >
                              <IconEdit />
                              <span>Update</span>
                            </button>
                            {canDelete && row.candidateId && (
                              <button
                                type="button"
                                className="ofx-update-button ofx-update-button--danger"
                                onClick={() => deleteCandidate(o)}
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
          </div>
        )}
      </section>

      {/* Update modal */}
      {modalOpen && (
        <div
          className="ofx-modal-overlay"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="ofx-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ofx-modal-header">
              <div className="ofx-modal-heading">
                <span className="ofx-modal-eyebrow">
                  OFFER MANAGEMENT
                </span>
                <h3>Update offer details</h3>
                <p>{candidateLabel || 'Update candidate offer information'}</p>
              </div>

              <button
                type="button"
                className="ofx-modal-close"
                onClick={() => !saving && setModalOpen(false)}
                title="Close"
                disabled={saving}
              >
                <IconX />
              </button>
            </div>

            <div className="ofx-modal-body">
              {error && (
                <div className="ofx-alert ofx-alert--error">
                  {error}
                </div>
              )}

              {loadingOffer ? (
                <div className="ofx-loading">
                  <span className="ofx-spinner" />
                  <span>Loading offer details...</span>
                </div>
              ) : (
                <div className="ofx-form-grid">
                  <label className="ofx-form-field">
                    <span>Offer status</span>
                    <select
                      className="ofx-control"
                      value={form.statusCode || 'INITIATED'}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          statusCode: e.target.value,
                        }))
                      }
                    >
                      {selectOptions.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="ofx-form-field">
                    <span>Offer initiated date</span>
                    <input
                      className="ofx-control"
                      type="date"
                      value={form.offerInitiatedDate || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          offerInitiatedDate: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="ofx-form-field">
                    <span>Offer released date</span>
                    <input
                      className="ofx-control"
                      type="date"
                      value={form.offerReleasedDate || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          offerReleasedDate: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="ofx-form-field">
                    <span>CTC rate</span>
                    <input
                      className="ofx-control"
                      type="text"
                      placeholder="e.g. 18 LPA"
                      value={form.ctcRate || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          ctcRate: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="ofx-form-field">
                    <span>Expected DOJ</span>
                    <input
                      className="ofx-control"
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

                  <label className="ofx-form-field ofx-form-field--wide">
                    <span>Remarks</span>
                    <textarea
                      className="ofx-control ofx-textarea"
                      rows={3}
                      placeholder="Add any relevant offer remarks..."
                      value={form.remarks || ''}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          remarks: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="ofx-modal-footer">
              <button
                type="button"
                className="ofx-button ofx-button--secondary"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="ofx-button ofx-button--primary"
                onClick={saveOffer}
                disabled={saving || loadingOffer}
              >
                <IconFilePlus />
                <span>{saving ? 'Saving...' : 'Update details'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
