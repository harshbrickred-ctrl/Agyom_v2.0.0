import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get, put, post, del } from '../../services/apiClient';
import { ENDPOINTS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { IconList, IconFilter, IconBriefcase, IconFlag, IconClipboardCheck, IconEdit, IconX, IconTrash } from '../../components/Icons';
import RequirementPipelineBoard from '../../components/RequirementPipelineBoard';
import RequirementNotes from '../../components/RequirementNotes';
import CandidateResumeSection from '../../components/CandidateResumeSection';
import TaOwnersMultiSelect, { formatTaOwnerNames, formatTaLeadNames } from '../../components/TaOwnersMultiSelect';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { formatDate, toDateInput } from '../../utils/formatDate';
import { matchesQuery, useDebouncedValue } from '../../utils/listSearch';
import { fetchAllPages } from '../../utils/fetchAllPages';
import TableSearch from '../../components/TableSearch';
import { EmptyState, ScreenSkeleton } from '../../components/ui';
import DownloadExcelButton from '../../components/DownloadExcelButton';
import './../pageCss/YourRequirementsScreen.css';

function normalizeMemberList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data?.items)) return res.data.items;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

function memberLoadError(err, fallback) {
  const raw = err?.response?.data?.message || err?.message || fallback;
  return Array.isArray(raw) ? raw.join('; ') : String(raw);
}

// Shows the requirements from the live backend (GET /api/v1/requirements).
// Sales users see only the requirements they own (salesOwnerId === user.id);
// admins see all requirements. Client / Priority / Status filters are applied
// client-side on top of the fetched list. Each row can be edited via a modal
// that PUTs to /api/v1/requirements/{id}.
export default function YourRequirementsScreen() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ clientId: '', priorityCode: '', status: '' });
  const [listSearch, setListSearch] = useState('');
  const listSearchQ = useDebouncedValue(listSearch);
  const [editing, setEditing] = useState(null); // requirement being edited
  const [viewingRequirement, setViewingRequirement] = useState(null); // requirement pipeline view
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [editSuccess, setEditSuccess] = useState(null);
  const [clientOptions, setClientOptions] = useState([]);
  const [jobFamilyOptions, setJobFamilyOptions] = useState([]);
  const [salesOwnerOptions, setSalesOwnerOptions] = useState([]);
  const [taOwnerOptions, setTaOwnerOptions] = useState([]);
  const [taLeadOptions, setTaLeadOptions] = useState([]);
  const [taLeadLoadError, setTaLeadLoadError] = useState(null);
  const [assignMode, setAssignMode] = useState('none');
  const [myTaskCandidates, setMyTaskCandidates] = useState({});
  const [myTaskLoading, setMyTaskLoading] = useState({});
  const [statusBusyId, setStatusBusyId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [statusModal, setStatusModal] = useState(null); // { requirement, nextStatus }
  const [statusReason, setStatusReason] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [deletingId, setDeletingId] = useState(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const normalizeId = (value) => (value == null ? null : String(value).trim());
  const normalizeEmail = (value) => (value == null ? null : String(value).trim().toLowerCase());
  const isOwnedByCurrentSalesUser = (r) => {
    const ownerEmail = r.salesOwner?.email || r.salesOwner?.emailAddress;
    const currentUserEmail = user?.email || user?.username;
    return ownerEmail != null && normalizeEmail(ownerEmail) === normalizeEmail(currentUserEmail);
  };

  const load = () => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchAllPages(`${ENDPOINTS.REQUIREMENTS}?sort=createdAt:desc`, { pageSize: 10 })
      .then((list) => {
        // Sales users only see their own requirements; sales lead / admins see everything.
        const filtered = user?.userType === 'sales'
          ? list.filter(isOwnedByCurrentSalesUser)
          : list;
        console.debug('[YourRequirementsScreen] loaded requirements', {
          user,
          totalFetched: list.length,
          visibleForCurrentUser: filtered.length,
          sampleOwners: list.slice(0, 10).map((r) => ({ id: r.id, salesOwnerId: r.salesOwnerId, salesOwner: r.salesOwner?.id }))
        });
        active && setItems(filtered);
      })
      .catch((err) => {
        active && setError(err?.response?.data?.message || err?.message || 'Failed to load requirements');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  };

  const loadTaLeadOptions = useCallback(async () => {
    const url = ENDPOINTS.TA_LEAD_MEMBERS;
    if (!url) {
      setTaLeadLoadError('TA Lead members endpoint is not configured.');
      setTaLeadOptions([]);
      return [];
    }
    try {
      const res = await get(url);
      const list = normalizeMemberList(res);
      setTaLeadOptions(list);
      setTaLeadLoadError(null);
      return list;
    } catch (err) {
      setTaLeadOptions([]);
      setTaLeadLoadError(memberLoadError(err, 'Failed to load TA Lead users.'));
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;

    get(ENDPOINTS.CLIENTS)
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        if (active) setClientOptions(list);
      })
      .catch(() => active && setClientOptions([]));

    get(ENDPOINTS.JOB_FAMILIES)
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        if (active) setJobFamilyOptions(list);
      })
      .catch(() => active && setJobFamilyOptions([]));

    get(ENDPOINTS.SALES_MEMBERS)
      .then((res) => {
        if (active) setSalesOwnerOptions(normalizeMemberList(res));
      })
      .catch(() => active && setSalesOwnerOptions([]));

    get(ENDPOINTS.TA_MEMBERS)
      .then((res) => {
        if (active) setTaOwnerOptions(normalizeMemberList(res));
      })
      .catch(() => active && setTaOwnerOptions([]));

    void loadTaLeadOptions();

    return () => { active = false; };
  }, [loadTaLeadOptions]);

  useEffect(load, [user]);

  useEffect(() => {
    const req = searchParams.get('req');
    if (!req || !items.length) return;
    const match = items.find((r) => r.id === req || r.publicId === req);
    if (match) setViewingRequirement(match);
  }, [searchParams, items]);

  // Distinct clients for the filter dropdown.
  const clients = useMemo(() => {
    const map = new Map();
    items.forEach((r) => {
      if (r.client?.id && r.client?.name) map.set(r.client.id, r.client.name);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [items]);

  const jobFamilies = useMemo(() => jobFamilyOptions.map((jf) => ({ id: jf.id, name: jf.name || jf.label || jf.id })), [jobFamilyOptions]);
  const salesOwners = useMemo(() => salesOwnerOptions.map((o) => ({ id: o.id, name: o.fullName || o.name || o.email || o.id })), [salesOwnerOptions]);
  const taOwners = useMemo(() => taOwnerOptions.map((o) => ({ id: o.id, name: o.fullName || o.name || o.email || o.id })), [taOwnerOptions]);

  const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'CRITICAL'];
  const STATUSES = ['ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED'];

  const canManageStatus =
    user?.userType === 'admin' ||
    user?.userType === 'sales' ||
    user?.userType === 'sales_lead';
  const canReassignSalesOwner =
    user?.userType === 'admin' || user?.userType === 'sales_lead';
  const canAssignTas =
    user?.userType === 'admin' ||
    user?.userType === 'sales' ||
    user?.userType === 'sales_lead';
  const canDelete = user?.userType === 'admin';

  const visible = useMemo(() => {
    return items
      .filter((r) => {
        if (filters.clientId && r.client?.id !== filters.clientId) return false;
        if (filters.priorityCode && (r.priorityCode || '') !== filters.priorityCode) return false;
        if (filters.status && (r.status || '') !== filters.status) return false;
        return matchesQuery(
          listSearchQ,
          r.publicId,
          r.client?.name,
          r.roleSkill,
          r.jobFamily?.name,
          r.salesOwner?.fullName,
          r.jobLocation,
        );
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [items, filters, listSearchQ]);

  const visibleIds = useMemo(
    () => visible.map((r) => r.id).filter(Boolean),
    [visible],
  );
  const allVisibleSelected =
    canDelete &&
    visibleIds.length > 0 &&
    visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    canDelete && visibleIds.some((id) => selectedIds.has(id));

  const myRequirements = useMemo(() => items.filter(isOwnedByCurrentSalesUser), [items, user]);

  const update = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => {
    setFilters({ clientId: '', priorityCode: '', status: '' });
    setListSearch('');
  };
  const hasFilters = Boolean(filters.clientId || filters.priorityCode || filters.status || listSearch.trim());

  const openStatusReasonModal = (requirement, nextStatus) => {
    if (!requirement?.id || !canManageStatus) return;
    setStatusReason('');
    setStatusError(null);
    setStatusModal({ requirement, nextStatus });
  };

  const closeStatusReasonModal = () => {
    if (statusBusyId) return;
    setStatusModal(null);
    setStatusReason('');
  };

  const changeRequirementStatus = async (requirement, nextStatus, reason = '') => {
    if (!requirement?.id || !canManageStatus) return;

    if (nextStatus === 'ON_HOLD' || nextStatus === 'CANCELLED') {
      if (!statusModal || statusModal.requirement?.id !== requirement.id) {
        openStatusReasonModal(requirement, nextStatus);
        return;
      }
      if (!String(reason || '').trim()) {
        setStatusError('Please enter a reason before continuing.');
        return;
      }
    }

    setStatusBusyId(requirement.id);
    setStatusMessage(null);
    setStatusError(null);
    try {
      const payload = { status: nextStatus };
      if (nextStatus === 'ON_HOLD' || nextStatus === 'CANCELLED') {
        payload.reason = String(reason).trim();
      }
      const updated = await post(`${ENDPOINTS.REQUIREMENTS}/${requirement.id}/status`, payload);
      const next = updated?.status || nextStatus;
      setItems((prev) => prev.map((r) => (
        r.id === requirement.id
          ? { ...r, ...updated, status: next, statusReason: updated?.statusReason ?? (payload.reason || null) }
          : r
      )));
      setStatusModal(null);
      setStatusReason('');
      setStatusMessage(
        next === 'ON_HOLD'
          ? `Requirement ${requirement.publicId || ''} put on hold`
          : next === 'ACTIVE'
            ? `Requirement ${requirement.publicId || ''} resumed`
            : `Requirement ${requirement.publicId || ''} cancelled`,
      );
      toast(
        next === 'ON_HOLD'
          ? `Requirement ${requirement.publicId || ''} put on hold`
          : next === 'ACTIVE'
            ? `Requirement ${requirement.publicId || ''} resumed`
            : `Requirement ${requirement.publicId || ''} cancelled`,
      );
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update requirement status';
      setStatusError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setStatusBusyId(null);
    }
  };

  const toggleSelect = (id, checked) => {
    if (!id || !canDelete) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllVisible = (checked) => {
    if (!canDelete) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleIds.forEach((id) => next.add(id));
      } else {
        visibleIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const deleteRequirement = async (requirement) => {
    if (!canDelete || !requirement?.id) return;
    const label = requirement.publicId || requirement.roleSkill || 'this requirement';
    const ok = window.confirm(
      `Delete ${label}?\n\nIt will be removed from the requirements list. This cannot be undone from the UI.`,
    );
    if (!ok) return;

    setDeletingId(requirement.id);
    setStatusMessage(null);
    setStatusError(null);
    try {
      await del(`${ENDPOINTS.REQUIREMENTS}/${requirement.id}`);
      setItems((prev) => prev.filter((r) => r.id !== requirement.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(requirement.id);
        return next;
      });
      if (viewingRequirement?.id === requirement.id) setViewingRequirement(null);
      if (editing?.id === requirement.id) setEditing(null);
      const msg = `Requirement ${label} deleted`;
      setStatusMessage(msg);
      toast(msg);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete requirement';
      setStatusError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setDeletingId(null);
    }
  };

  const deleteSelectedRequirements = async () => {
    if (!canDelete || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const ok = window.confirm(
      `Delete ${ids.length} selected requirement${ids.length === 1 ? '' : 's'}?\n\nThey will be removed from the requirements list. This cannot be undone from the UI.`,
    );
    if (!ok) return;

    setBulkDeleting(true);
    setStatusMessage(null);
    setStatusError(null);
    try {
      const res = await post(`${ENDPOINTS.REQUIREMENTS}/bulk-delete`, { ids });
      const deletedIds = new Set(res?.ids || ids);
      setItems((prev) => prev.filter((r) => !deletedIds.has(r.id)));
      setSelectedIds(new Set());
      if (viewingRequirement?.id && deletedIds.has(viewingRequirement.id)) {
        setViewingRequirement(null);
      }
      if (editing?.id && deletedIds.has(editing.id)) setEditing(null);
      const count = res?.deleted ?? deletedIds.size;
      const msg = `${count} requirement${count === 1 ? '' : 's'} deleted`;
      setStatusMessage(msg);
      toast(msg);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete requirements';
      setStatusError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setBulkDeleting(false);
    }
  };

  const openEdit = (r) => {
    setEditing(r);
    setEditError(null);
    setEditSuccess(null);
    const ownerIds = Array.isArray(r.taOwnerIds) && r.taOwnerIds.length
      ? r.taOwnerIds
      : Array.isArray(r.taOwners) && r.taOwners.length
        ? r.taOwners.map((t) => t.id)
        : r.taOwner?.id || r.taOwnerId
          ? [r.taOwner?.id || r.taOwnerId]
          : [];
    const leadIds = Array.isArray(r.taLeadIds) && r.taLeadIds.length
      ? r.taLeadIds
      : Array.isArray(r.taLeads) && r.taLeads.length
        ? r.taLeads.map((t) => t.id)
        : [];
    const mode = ownerIds.length ? 'owners' : leadIds.length ? 'lead' : 'none';
    setAssignMode(mode);
    setForm({
      requirementDate: toDateInput(r.requirementDate),
      clientId: r.client?.id || r.clientId || '',
      roleSkill: r.roleSkill || '',
      jobFamilyId: r.jobFamily?.id || r.jobFamilyId || '',
      numberOfPositions: r.numberOfPositions ?? '',
      salesOwnerId: r.salesOwner?.id || r.salesOwnerId || '',
      priorityCode: r.priorityCode || 'HIGH',
      taOwnerIds: ownerIds,
      taLeadIds: leadIds,
      taHandoffDate: toDateInput(r.taHandoffDate),
      targetClosureDate: toDateInput(r.targetClosureDate),
      remarks: r.remarks || '',
      experience: r.experience || '',
      jobLocation: r.jobLocation || '',
      minBudget: r.minBudget ?? '',
      maxBudget: r.maxBudget ?? '',
      durationMonths: r.durationMonths ?? '',
    });
  };

  const closeEdit = () => { setEditing(null); setForm({}); };
  const openRequirementDetails = (requirement) => { setViewingRequirement(requirement); };
  const closeRequirementDetails = () => { setViewingRequirement(null); setViewingCandidate(null); };
  useEscapeKey(Boolean(editing), closeEdit);
  useEscapeKey(Boolean(viewingRequirement && !editing && !statusModal), closeRequirementDetails);
  useEscapeKey(Boolean(viewingCandidate && !viewingRequirement && !editing && !statusModal), () => setViewingCandidate(null));
  useEscapeKey(Boolean(statusModal), closeStatusReasonModal);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleMyTaskCandidates = async (requirement) => {
    const id = requirement.id;
    // hide if already loaded
    if (myTaskCandidates[id]) {
      setMyTaskCandidates((p) => { const copy = { ...p }; delete copy[id]; return copy; });
      return;
    }
    setMyTaskLoading((p) => ({ ...p, [id]: true }));
    try {
      const res = await get(ENDPOINTS.CANDIDATES);
      const list = Array.isArray(res) ? res : res?.items || res?.data || [];
      const filtered = list.filter((c) => c.requirementId === id || c.requirement?.id === id || c.requirementId === id);
      setMyTaskCandidates((p) => ({ ...p, [id]: filtered }));
    } catch (err) {
      setMyTaskCandidates((p) => ({ ...p, [id]: [] }));
    } finally {
      setMyTaskLoading((p) => ({ ...p, [id]: false }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setEditError(null);
    setEditSuccess(null);
    if (!String(form.taHandoffDate || '').trim()) {
      setEditError('TA Handoff Date is required.');
      setSaving(false);
      return;
    }
    if (!String(form.targetClosureDate || '').trim()) {
      setEditError('Target Closure Date is required.');
      setSaving(false);
      return;
    }
    const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : undefined; };
    const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : undefined; };
    const payload = {
      requirementDate: form.requirementDate,
      clientId: form.clientId,
      roleSkill: form.roleSkill,
      jobFamilyId: form.jobFamilyId,
      numberOfPositions: toInt(form.numberOfPositions),
      salesOwnerId: form.salesOwnerId,
      priorityCode: form.priorityCode,
      ...(canAssignTas
        ? assignMode === 'owners'
          ? {
              taOwnerIds: Array.isArray(form.taOwnerIds) ? form.taOwnerIds : [],
              taLeadIds: [],
            }
          : assignMode === 'lead'
            ? {
                taLeadIds: Array.isArray(form.taLeadIds) ? form.taLeadIds : [],
                taOwnerIds: [],
              }
            : { taOwnerIds: [], taLeadIds: [] }
        : {}),
      taHandoffDate: form.taHandoffDate,
      targetClosureDate: form.targetClosureDate,
      remarks: form.remarks || undefined,
      experience: form.experience || undefined,
      jobLocation: form.jobLocation,
      minBudget: toNum(form.minBudget),
      maxBudget: toNum(form.maxBudget),
      durationMonths: toInt(form.durationMonths),
    };
    try {
      await put(`${ENDPOINTS.REQUIREMENT_BY_ID}/${editing.id}`, payload);
      setEditSuccess('Requirement updated successfully');
      toast('Requirement updated successfully');
      closeEdit();
      load(); // refresh the list
    } catch (err) {
      setEditError(err?.response?.data?.message || err?.message || 'Failed to update requirement');
    } finally {
      setSaving(false);
    }
  };

   return (
    <div className="reqx-screen">
      {/* Page header */}
      <header className="reqx-page-header">
        <div className="reqx-heading">
          <span className="reqx-heading-icon"><IconList /></span>
          <div className="reqx-heading-copy">
            <h2>Requirements</h2>
            <p>
              {user?.userType === 'sales'
                ? 'Manage the recruitment requirements assigned to you.'
                : user?.userType === 'sales_lead'
                  ? 'Monitor requirements and manage sales ownership.'
                  : 'Monitor and manage all recruitment requirements.'}
            </p>
          </div>
           
        </div>

        <div className="reqx-header-meta">
          {/* {!loading && !error && (
            <span className="reqx-total">
              <strong>{visible.length}</strong>
              <span>of {items.length} requirements</span>
            </span>
          )} */}
          <div className="reqx-filter-field reqx-search-field">
              {/* <span className="reqx-field-label">Search requirements</span> */}
              <div className="reqx-search-control">
                <TableSearch
                  value={listSearch}
                  onChange={setListSearch}
                  placeholder="Search ID, client, role..."
                />
              </div>
            </div>
        </div>
      </header>

      {/* Filters */}
      {!loading && !error && items.length > 0 && (
        <section className="reqx-filter-panel">
          <div className="reqx-filter-heading">
            <div className="reqx-section-label">
              <IconFilter />
              <span>Filter requirements</span>
            </div>

            {hasFilters && (
              <button
                type="button"
                className="reqx-text-button"
                onClick={clearFilters}
              >
                <IconX />
                Clear all
              </button>
            )}
          </div>

          <div className="reqx-filter-grid">
            <label className="reqx-filter-field">
              <span className="reqx-field-label">
                <IconBriefcase />
                Client
              </span>
              <select
                className="reqx-control"
                value={filters.clientId}
                onChange={(e) => update('clientId', e.target.value)}
              >
                <option value="">All clients</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            <label className="reqx-filter-field">
              <span className="reqx-field-label">
                <IconFlag />
                Priority
              </span>
              <select
                className="reqx-control"
                value={filters.priorityCode}
                onChange={(e) => update('priorityCode', e.target.value)}
              >
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>

            <label className="reqx-filter-field">
              <span className="reqx-field-label">
                <IconClipboardCheck />
                Status
              </span>
              <select
                className="reqx-control"
                value={filters.status}
                onChange={(e) => update('status', e.target.value)}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>

           
          </div>

          {hasFilters && (
            <div className="reqx-active-filters">
              <span className="reqx-active-label">Active filters</span>

              {filters.clientId && (
                <button
                  type="button"
                  className="reqx-filter-chip"
                  onClick={() => update('clientId', '')}
                >
                  Client: {clients.find((c) => c.id === filters.clientId)?.name || filters.clientId}
                  <IconX />
                </button>
              )}

              {filters.priorityCode && (
                <button
                  type="button"
                  className="reqx-filter-chip"
                  onClick={() => update('priorityCode', '')}
                >
                  Priority: {filters.priorityCode}
                  <IconX />
                </button>
              )}

              {filters.status && (
                <button
                  type="button"
                  className="reqx-filter-chip"
                  onClick={() => update('status', '')}
                >
                  Status: {filters.status.replace(/_/g, ' ')}
                  <IconX />
                </button>
              )}

              {listSearch.trim() && (
                <button
                  type="button"
                  className="reqx-filter-chip"
                  onClick={() => setListSearch('')}
                >
                  Search: {listSearch.trim()}
                  <IconX />
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Feedback messages */}
      {statusMessage && (
        <div className="reqx-alert reqx-alert--success">{statusMessage}</div>
      )}
      {statusError && (
        <div className="reqx-alert reqx-alert--error">{statusError}</div>
      )}

      {/* Records toolbar */}
      {!loading && !error && items.length > 0 && (
        <section className="reqx-records-toolbar">
          <div className="reqx-records-heading">
            <div>
              <h3>Requirement records</h3>
              <span className="reqx-records-subtitle">
                {visible.length} {visible.length === 1 ? 'record' : 'records'} found
              </span>
            </div>
          </div>

          <div className="reqx-records-actions">
            {canDelete && selectedIds.size > 0 && (
              <div className="reqx-selection-info">
                <span>{selectedIds.size} selected</span>
                <button
                  type="button"
                  className="reqx-button reqx-button--danger"
                  disabled={bulkDeleting || Boolean(deletingId)}
                  onClick={deleteSelectedRequirements}
                >
                  {bulkDeleting ? 'Deleting...' : 'Delete selected'}
                </button>
                <button
                  type="button"
                  className="reqx-button reqx-button--ghost"
                  disabled={bulkDeleting}
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear selection
                </button>
              </div>
            )}

            <DownloadExcelButton
              filename="requirements"
              rows={visible}
              columns={[
                { label: 'Req ID', value: (r) => r.publicId || '—' },
                { label: 'Client', value: (r) => r.client?.name || '—' },
                { label: 'Role / Skill', value: (r) => r.roleSkill || '—' },
                { label: 'Job Family', value: (r) => r.jobFamily?.name || r.jobFamilyId || '—' },
                { label: 'Positions', value: (r) => r.numberOfPositions ?? '—' },
                { label: 'Fill', value: (r) => `${r.closedPositions ?? 0}/${r.openPositions ?? '—'}` },
                { label: 'Pipeline', value: (r) => (r.furthestPipelineStage ? String(r.furthestPipelineStage).replace(/_/g, ' ') : '—') },
                { label: 'RAG', value: (r) => (r.taHandoffSlaRag && r.taHandoffSlaRag !== 'NONE' ? r.taHandoffSlaRag : '—') },
                { label: 'Priority', value: (r) => r.priorityCode || '—' },
                { label: 'Job Location', value: (r) => r.jobLocation || '—' },
                { label: 'Sales Owner', value: (r) => r.salesOwner?.fullName || '—' },
                { label: 'TA Lead', value: (r) => formatTaLeadNames(r) },
                { label: 'TA Owners', value: (r) => formatTaOwnerNames(r) },
                { label: 'Status', value: (r) => r.status || 'ACTIVE' },
                { label: 'Added', value: (r) => formatDate(r.createdAt) },
              ]}
            />
          </div>
        </section>
      )}

      {/* Main content */}
      {loading ? (
        <div className="reqx-loading">
          <ScreenSkeleton rows={8} />
        </div>
      ) : error ? (
        <div className="reqx-empty-state">
          <div className="reqx-alert reqx-alert--error">{error}</div>
        </div>
      ) : items.length === 0 ? (
        <div className="reqx-empty-state">
          <EmptyState
            icon={IconList}
            title="No requirements found"
            description="Use Add Request to raise one."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="reqx-empty-state">
          <EmptyState
            icon={IconList}
            title="No matching requirements"
            description="Try a different search or clear filters."
          />
        </div>
      ) : (
        <section className="reqx-table-card">
          <div className="reqx-table-scroll">
            <table className="reqx-table">
              <thead>
                <tr>
                  {canDelete && (
                    <th className="reqx-check-cell" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                        }}
                        onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                        aria-label="Select all visible requirements"
                      />
                    </th>
                  )}
                  <th>Req ID</th>
                  <th>Client</th>
                  <th>Role / Skill</th>
                  <th>Job Family</th>
                  <th>Positions</th>
                  <th>Fill</th>
                  <th>Pipeline</th>
                  <th>RAG</th>
                  <th>Priority</th>
                  <th>Location</th>
                  <th>Sales Owner</th>
                  <th>TA Lead</th>
                  <th>TA Owners</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th className="reqx-action-heading">Actions</th>
                </tr>
              </thead>

              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.id || r.publicId}
                    onClick={() => openRequirementDetails(r)}
                    className="reqx-data-row"
                  >
                    {canDelete && (
                      <td className="reqx-check-cell" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={(e) => toggleSelect(r.id, e.target.checked)}
                          aria-label={`Select ${r.publicId || r.id}`}
                        />
                      </td>
                    )}

                    <td>
                      <span className="reqx-id">{r.publicId || '—'}</span>
                    </td>
                    <td className="reqx-client-cell">{r.client?.name || '—'}</td>
                    <td className="reqx-role-cell">{r.roleSkill || '—'}</td>
                    <td>{r.jobFamily?.name || r.jobFamilyId || '—'}</td>
                    <td className="reqx-number-cell">{r.numberOfPositions ?? '—'}</td>
                    <td className="reqx-number-cell">
                      {(r.closedPositions ?? 0)}/{r.openPositions ?? '—'}
                    </td>
                    <td>
                      {r.furthestPipelineStage
                        ? String(r.furthestPipelineStage).replace(/_/g, ' ')
                        : '—'}
                    </td>
                    <td>
                      {r.taHandoffSlaRag && r.taHandoffSlaRag !== 'NONE' ? (
                        <span className={`reqx-rag reqx-rag--${String(r.taHandoffSlaRag).toLowerCase()}`}>
                          {r.taHandoffSlaRag}
                        </span>
                      ) : <span className="reqx-muted">—</span>}
                    </td>
                    <td>
                      {r.priorityCode ? (
                        <span className={`reqx-priority reqx-priority--${String(r.priorityCode).toLowerCase()}`}>
                          {r.priorityCode}
                        </span>
                      ) : '—'}
                    </td>
                    <td>{r.jobLocation || '—'}</td>
                    <td>{r.salesOwner?.fullName || '—'}</td>
                    <td>{formatTaLeadNames(r)}</td>
                    <td>{formatTaOwnerNames(r)}</td>
                    <td>
                      <span className={`reqx-status reqx-status--${String(r.status || 'ACTIVE').toLowerCase()}`}>
                        {(r.status || 'ACTIVE').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{formatDate(r.createdAt)}</td>

                    <td className="reqx-action-cell" onClick={(e) => e.stopPropagation()}>
                      <div className="reqx-row-actions">
                        <button
                          type="button"
                          className="reqx-icon-button"
                          onClick={() => openRequirementDetails(r)}
                          title="View pipeline"
                          aria-label="View pipeline"
                        >
                          <IconClipboardCheck />
                        </button>

                        <button
                          type="button"
                          className="reqx-icon-button"
                          onClick={() => openEdit(r)}
                          title="Edit requirement"
                          aria-label="Edit requirement"
                        >
                          <IconEdit />
                        </button>

                        {canManageStatus && (r.status || 'ACTIVE') === 'ACTIVE' && (
                          <button
                            type="button"
                            className="reqx-small-button"
                            disabled={statusBusyId === r.id}
                            onClick={() => changeRequirementStatus(r, 'ON_HOLD')}
                          >
                            Hold
                          </button>
                        )}

                        {canManageStatus && r.status === 'ON_HOLD' && (
                          <button
                            type="button"
                            className="reqx-small-button"
                            disabled={statusBusyId === r.id}
                            onClick={() => changeRequirementStatus(r, 'ACTIVE')}
                          >
                            Resume
                          </button>
                        )}

                        {canManageStatus && (r.status === 'ACTIVE' || r.status === 'ON_HOLD') && (
                          <button
                            type="button"
                            className="reqx-small-button reqx-small-button--danger"
                            disabled={statusBusyId === r.id}
                            onClick={() => changeRequirementStatus(r, 'CANCELLED')}
                          >
                            Cancel
                          </button>
                        )}

                        {canDelete && (
                          <button
                            type="button"
                            className="reqx-small-button reqx-small-button--danger"
                            disabled={deletingId === r.id || bulkDeleting || statusBusyId === r.id}
                            onClick={() => deleteRequirement(r)}
                          >
                            {deletingId === r.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="reqx-table-footer">
            <span>
              Showing <strong>{visible.length}</strong> of <strong>{items.length}</strong> requirements
            </span>
            <span className="reqx-scroll-hint">Scroll horizontally to view all columns</span>
          </div>
        </section>
      )}

      {/* Requirement pipeline modal */}
      {viewingRequirement && (
        <div className="reqx-overlay" onClick={closeRequirementDetails}>
          <div className="reqx-modal reqx-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="reqx-modal-header">
              <div className="reqx-modal-heading">
                <span className="reqx-modal-eyebrow">Requirement pipeline</span>
                <h3>
                  {viewingRequirement.publicId || viewingRequirement.id}
                  <span className={`reqx-status reqx-status--${String(viewingRequirement.status || 'ACTIVE').toLowerCase()}`}>
                    {(viewingRequirement.status || 'ACTIVE').replace(/_/g, ' ')}
                  </span>
                </h3>
                <p>
                  {[viewingRequirement.client?.name, viewingRequirement.roleSkill]
                    .filter(Boolean)
                    .join(' · ') || 'Candidate pipeline'}
                </p>
              </div>
              <button
                type="button"
                className="reqx-modal-close"
                onClick={closeRequirementDetails}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>

            <div className="reqx-modal-body">
              <RequirementPipelineBoard
                requirementId={viewingRequirement.id}
                requirement={viewingRequirement}
                mode="readonly"
                refreshKey={pipelineRefreshKey}
                onViewCandidate={(c) => setViewingCandidate(c)}
                onDeleteCandidate={canDelete ? async (c) => {
                  const candidateId = c.id || c.publicId;
                  if (!candidateId) return;
                  const ok = window.confirm(
                    'Delete this candidate? The candidate and any linked offer/onboarding will be removed from active views. This cannot be undone from the UI.',
                  );
                  if (!ok) return;
                  try {
                    const res = await del(`${ENDPOINTS.CANDIDATES}/${candidateId}`);
                    toast(res?.message || 'Candidate deleted');
                    if (viewingCandidate && (viewingCandidate.id === candidateId || viewingCandidate.publicId === candidateId)) {
                      setViewingCandidate(null);
                    }
                    setPipelineRefreshKey((k) => k + 1);
                  } catch (err) {
                    const msg = err?.response?.data?.message || err?.message || 'Failed to delete candidate';
                    toast(Array.isArray(msg) ? msg.join(', ') : msg);
                  }
                } : undefined}
              />
            </div>

            <div className="reqx-modal-footer">
              <button type="button" className="reqx-button reqx-button--secondary" onClick={closeRequirementDetails}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Candidate details modal */}
      {viewingCandidate && (
        <div className="reqx-overlay" onClick={() => setViewingCandidate(null)}>
          <div className="reqx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reqx-modal-header">
              <div className="reqx-modal-heading">
                <span className="reqx-modal-eyebrow">Candidate details</span>
                <h3>{viewingCandidate.publicId || viewingCandidate.name}</h3>
              </div>
              <button
                type="button"
                className="reqx-modal-close"
                onClick={() => setViewingCandidate(null)}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>

            <div className="reqx-modal-body">
              <div className="reqx-detail-grid">
                {[
                  ['Name', viewingCandidate.name],
                  ['Email', viewingCandidate.email],
                  ['Mobile', viewingCandidate.mobile],
                  ['Stage', viewingCandidate.pipelineLabel || viewingCandidate.stageCode],
                  ['Status', viewingCandidate.candidateStatus],
                  ['Interview', viewingCandidate.interviewRound],
                  ['Offer', viewingCandidate.offer?.statusCode],
                  ['Onboarding', viewingCandidate.onboarding?.statusCode],
                ].map(([label, value]) => (
                  <div className="reqx-detail-item" key={label}>
                    <span>{label}</span>
                    <strong>{value || '—'}</strong>
                  </div>
                ))}
              </div>

              <div className="reqx-description">
                <span className="reqx-field-label">Remarks</span>
                <p>{viewingCandidate.remarks || 'No remarks.'}</p>
              </div>

              <CandidateResumeSection
                candidateId={viewingCandidate.id || viewingCandidate.publicId}
                initialHasResume={viewingCandidate.hasResume}
                initialFileName={viewingCandidate.resumeFileName}
                className="reqx-resume-section"
              />
            </div>

            <div className="reqx-modal-footer">
              {canDelete && (
                <button
                  type="button"
                  className="reqx-button reqx-button--danger"
                  title="Delete candidate"
                  onClick={async () => {
                    const candidateId = viewingCandidate.id || viewingCandidate.publicId;
                    if (!candidateId) return;
                    const ok = window.confirm(
                      'Delete this candidate? The candidate and any linked offer/onboarding will be removed from active views. This cannot be undone from the UI.',
                    );
                    if (!ok) return;
                    try {
                      const res = await del(`${ENDPOINTS.CANDIDATES}/${candidateId}`);
                      toast(res?.message || 'Candidate deleted');
                      setViewingCandidate(null);
                      setPipelineRefreshKey((k) => k + 1);
                    } catch (err) {
                      const msg = err?.response?.data?.message || err?.message || 'Failed to delete candidate';
                      toast(Array.isArray(msg) ? msg.join(', ') : msg);
                    }
                  }}
                >
                  <IconTrash />
                  Delete
                </button>
              )}
              <button type="button" className="reqx-button reqx-button--secondary" onClick={() => setViewingCandidate(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {statusModal && (
        <div className="reqx-overlay" onClick={closeStatusReasonModal}>
          <div className="reqx-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reqx-modal-header">
              <div className="reqx-modal-heading">
                <span className="reqx-modal-eyebrow">Requirement status</span>
                <h3>
                  {statusModal.nextStatus === 'ON_HOLD' ? 'Put requirement on hold' : 'Cancel requirement'}
                </h3>
                <p>
                  {statusModal.requirement?.publicId || statusModal.requirement?.roleSkill || 'Requirement'}
                </p>
              </div>
              <button
                type="button"
                className="reqx-modal-close"
                onClick={closeStatusReasonModal}
                disabled={Boolean(statusBusyId)}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>

            <div className="reqx-modal-body">
              {statusError && <div className="reqx-alert reqx-alert--error">{statusError}</div>}
              <p className="reqx-modal-copy">
                {statusModal.nextStatus === 'ON_HOLD'
                  ? 'Recruiting pauses until the requirement is resumed. This reason appears on dashboard Hold KPIs.'
                  : 'Recruiting stops and this appears under Cancelled on the dashboard with the reason below.'}
              </p>
              <label className="reqx-form-field reqx-form-field--full">
                <span>Reason</span>
                <textarea
                  rows={4}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder={statusModal.nextStatus === 'ON_HOLD'
                    ? 'Why is this requirement on hold?'
                    : 'Why is this requirement cancelled?'}
                  disabled={Boolean(statusBusyId)}
                />
              </label>
            </div>

            <div className="reqx-modal-footer">
              <button
                type="button"
                className="reqx-button reqx-button--secondary"
                onClick={closeStatusReasonModal}
                disabled={Boolean(statusBusyId)}
              >
                Back
              </button>
              <button
                type="button"
                className={statusModal.nextStatus === 'CANCELLED' ? 'reqx-button reqx-button--danger' : 'reqx-button reqx-button--primary'}
                disabled={Boolean(statusBusyId) || !statusReason.trim()}
                onClick={() => changeRequirementStatus(statusModal.requirement, statusModal.nextStatus, statusReason)}
              >
                {statusBusyId === statusModal.requirement?.id
                  ? 'Saving…'
                  : statusModal.nextStatus === 'ON_HOLD'
                    ? 'Confirm Hold'
                    : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit requirement modal */}
      {editing && (
        <div className="reqx-overlay" onClick={closeEdit}>
          <div className="reqx-modal reqx-modal--edit" onClick={(e) => e.stopPropagation()}>
            <div className="reqx-modal-header">
              <div className="reqx-modal-heading">
                <span className="reqx-modal-eyebrow">Manage requirement</span>
                <h3>Edit requirement</h3>
                <p>{editing.publicId || editing.id}</p>
              </div>
              <button
                type="button"
                className="reqx-modal-close"
                onClick={closeEdit}
                aria-label="Close"
              >
                <IconX />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="reqx-modal-body">
                <div className="reqx-form-grid">
                  <label className="reqx-form-field">
                    <span>Requirement Date</span>
                    <input
                      type="date"
                      value={form.requirementDate}
                      onChange={(e) => setField('requirementDate', e.target.value)}
                    />
                  </label>

                  <label className="reqx-form-field">
                    <span>Client</span>
                    <select value={form.clientId} onChange={(e) => setField('clientId', e.target.value)}>
                      <option value="">Select client...</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>

                  <label className="reqx-form-field">
                    <span>Role / Skill</span>
                    <input value={form.roleSkill} onChange={(e) => setField('roleSkill', e.target.value)} />
                  </label>

                  <label className="reqx-form-field">
                    <span>Job Family</span>
                    <select value={form.jobFamilyId} onChange={(e) => setField('jobFamilyId', e.target.value)}>
                      <option value="">Select job family...</option>
                      {jobFamilies.map((jf) => <option key={jf.id} value={jf.id}>{jf.name}</option>)}
                    </select>
                  </label>

                  <label className="reqx-form-field">
                    <span>Positions</span>
                    <input
                      type="number"
                      min="0"
                      value={form.numberOfPositions}
                      onChange={(e) => setField('numberOfPositions', e.target.value)}
                    />
                  </label>

                  <label className="reqx-form-field">
                    <span>Sales Owner</span>
                    <select
                      value={form.salesOwnerId}
                      disabled={!canReassignSalesOwner}
                      onChange={(e) => setField('salesOwnerId', e.target.value)}
                    >
                      <option value="">Select sales owner...</option>
                      {salesOwners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </label>

                  <label className="reqx-form-field">
                    <span>Priority</span>
                    <select value={form.priorityCode} onChange={(e) => setField('priorityCode', e.target.value)}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>

                  <div className="reqx-form-field reqx-form-field--full">
                    <span>TA assignment</span>

                    {canAssignTas ? (
                      <>
                        <div className="reqx-assign-options">
                          <label className={assignMode === 'none' ? 'reqx-assign-option is-active' : 'reqx-assign-option'}>
                            <input
                              type="radio"
                              name="editAssignMode"
                              checked={assignMode === 'none'}
                              onChange={() => {
                                setAssignMode('none');
                                setField('taOwnerIds', []);
                                setField('taLeadIds', []);
                              }}
                            />
                            <span>Unassigned</span>
                          </label>

                          <label className={assignMode === 'lead' ? 'reqx-assign-option is-active' : 'reqx-assign-option'}>
                            <input
                              type="radio"
                              name="editAssignMode"
                              checked={assignMode === 'lead'}
                              onChange={() => {
                                setAssignMode('lead');
                                setField('taOwnerIds', []);
                                if (taLeadOptions.length === 0) void loadTaLeadOptions();
                              }}
                            />
                            <span>Via TA Lead</span>
                          </label>

                          <label className={assignMode === 'owners' ? 'reqx-assign-option is-active' : 'reqx-assign-option'}>
                            <input
                              type="radio"
                              name="editAssignMode"
                              checked={assignMode === 'owners'}
                              onChange={() => {
                                setAssignMode('owners');
                                setField('taLeadIds', []);
                              }}
                            />
                            <span>Direct TA Owner(s)</span>
                          </label>
                        </div>

                        {assignMode === 'lead' && (
                          <>
                            <TaOwnersMultiSelect
                              options={taLeadOptions}
                              value={form.taLeadIds || []}
                              onChange={(ids) => setField('taLeadIds', ids)}
                              idPrefix="edit-ta-lead"
                              placeholder="Select TA Lead(s)..."
                              emptyMessage={
                                taLeadLoadError
                                  ? taLeadLoadError
                                  : 'No TA Lead users found. Create a TA Lead from Admin first.'
                              }
                              ariaLabel="TA Leads"
                            />
                            {taLeadLoadError && (
                              <div className="reqx-inline-error">
                                {taLeadLoadError}
                                <button type="button" onClick={() => void loadTaLeadOptions()}>
                                  Retry
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {assignMode === 'owners' && (
                          <TaOwnersMultiSelect
                            options={taOwnerOptions}
                            value={form.taOwnerIds || []}
                            onChange={(ids) => setField('taOwnerIds', ids)}
                            idPrefix="edit-ta-owner"
                          />
                        )}
                      </>
                    ) : (
                      <input
                        readOnly
                        value={
                          formatTaOwnerNames(editing) !== '—'
                            ? `Owners: ${formatTaOwnerNames(editing)}`
                            : formatTaLeadNames(editing) !== '—'
                              ? `TA Leads: ${formatTaLeadNames(editing)}`
                              : 'Unassigned'
                        }
                      />
                    )}
                  </div>

                  <label className="reqx-form-field">
                    <span>TA Handoff Date <span className="reqx-required" aria-hidden="true">*</span></span>
                    <input
                      type="date"
                      required
                      value={form.taHandoffDate}
                      onChange={(e) => setField('taHandoffDate', e.target.value)}
                    />
                  </label>

                  <label className="reqx-form-field">
                    <span>Target Closure Date <span className="reqx-required" aria-hidden="true">*</span></span>
                    <input
                      type="date"
                      required
                      value={form.targetClosureDate}
                      onChange={(e) => setField('targetClosureDate', e.target.value)}
                    />
                  </label>

                  <label className="reqx-form-field">
                    <span>Experience</span>
                    <input value={form.experience} onChange={(e) => setField('experience', e.target.value)} />
                  </label>

                  <label className="reqx-form-field">
                    <span>Job Location</span>
                    <input value={form.jobLocation} onChange={(e) => setField('jobLocation', e.target.value)} />
                  </label>

                  <label className="reqx-form-field">
                    <span>Min Budget</span>
                    <input
                      type="number"
                      min="0"
                      value={form.minBudget}
                      onChange={(e) => setField('minBudget', e.target.value)}
                    />
                  </label>

                  <label className="reqx-form-field">
                    <span>Max Budget</span>
                    <input
                      type="number"
                      min="0"
                      value={form.maxBudget}
                      onChange={(e) => setField('maxBudget', e.target.value)}
                    />
                  </label>

                  <label className="reqx-form-field">
                    <span>Duration (Months)</span>
                    <input
                      type="number"
                      min="0"
                      value={form.durationMonths}
                      onChange={(e) => setField('durationMonths', e.target.value)}
                    />
                  </label>

                  <label className="reqx-form-field reqx-form-field--full">
                    <span>Job Description</span>
                    <textarea
                      rows={4}
                      value={form.remarks}
                      onChange={(e) => setField('remarks', e.target.value)}
                    />
                  </label>
                </div>

                {editError && <div className="reqx-alert reqx-alert--error">{editError}</div>}
                {editSuccess && <div className="reqx-alert reqx-alert--success">{editSuccess}</div>}

                {editing?.id && <RequirementNotes requirementId={editing.id} />}
              </div>

              <div className="reqx-modal-footer">
                <button type="button" className="reqx-button reqx-button--secondary" onClick={closeEdit}>
                  Cancel
                </button>
                <button type="submit" className="reqx-button reqx-button--primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
