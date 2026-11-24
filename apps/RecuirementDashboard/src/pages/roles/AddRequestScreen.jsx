import { useState, useEffect, useCallback } from 'react';
import { post, get } from '../../services/apiClient';
import { ENDPOINTS } from '../../config/api';
import { addRequirement } from '../../services/requirementsStore';
import { useAuth } from '../../context/AuthContext';
import TaOwnersMultiSelect from '../../components/TaOwnersMultiSelect';


import {
  IconBriefcase,
  IconUser,
  IconTarget,
  IconFolderOpen,
  IconWallet,
  IconMapPin,
  IconClock,
  IconPlus,
  IconCalendar,
  IconFlag,
} from '../../components/Icons';

import { PageHeader } from '../../components/ui';
import { useToast } from '../../context/ToastContext';

import './../pageCss/AddRequestScreen.css';

const EMPTY = {
  requirementDate: '',
  clientName: '',
  roleSkill: '',
  jobFamilyName: '',
  numberOfPositions: '',
  salesOwnerId: '',
  priorityCode: 'HIGH',
  taHandoffDate: '',
  targetClosureDate: '',
  remarks: '',
  experience: '',
  jobLocation: '',
  minBudget: '',
  maxBudget: '',
  durationMonths: '',
};

const PRIORITY_OPTIONS = ['HIGH', 'MEDIUM', 'LOW'];

const FIELDS = [
  {
    key: 'requirementDate',
    label: 'Requirement Date',
    type: 'date',
    icon: IconCalendar,
    required: true,
  },
  {
    key: 'clientName',
    label: 'Client',
    type: 'combobox-client',
    icon: IconBriefcase,
    required: true,
    placeholder: 'Select or type a client',
  },
  {
    key: 'roleSkill',
    label: 'Role / Skill',
    type: 'text',
    icon: IconUser,
    placeholder: 'e.g. Core Python Developer',
    required: true,
  },
  {
    key: 'jobFamilyName',
    label: 'Job Family',
    type: 'combobox-jobfamily',
    icon: IconFolderOpen,
    required: true,
    placeholder: 'Select or type a job family',
  },
  {
    key: 'numberOfPositions',
    label: 'Number of Positions',
    type: 'number',
    icon: IconTarget,
    placeholder: 'e.g. 5',
    required: true,
    min: 1,
  },
  {
    key: 'priorityCode',
    label: 'Priority',
    type: 'select',
    icon: IconFlag,
    options: PRIORITY_OPTIONS,
    required: true,
  },
  {
    key: 'jobLocation',
    label: 'Job Location',
    type: 'text',
    icon: IconMapPin,
    placeholder: 'e.g. Bangalore',
    required: true,
  },
  {
    key: 'salesOwnerId',
    label: 'Sales Owner',
    type: 'select-owner',
    icon: IconUser,
    required: true,
  },
  {
    key: 'taHandoffDate',
    label: 'TA Handoff Date',
    type: 'date',
    icon: IconCalendar,
    required: true,
  },
  {
    key: 'targetClosureDate',
    label: 'Target Closure Date',
    type: 'date',
    icon: IconCalendar,
    required: true,
  },
  {
    key: 'experience',
    label: 'Experience',
    type: 'text',
    icon: IconUser,
    placeholder: 'e.g. 3-5 years',
    required: false,
  },
  {
    key: 'minBudget',
    label: 'Minimum Budget',
    type: 'number',
    icon: IconWallet,
    placeholder: 'e.g. 50000',
    required: false,
    min: 0,
  },
  {
    key: 'maxBudget',
    label: 'Maximum Budget',
    type: 'number',
    icon: IconWallet,
    placeholder: 'e.g. 80000',
    required: false,
    min: 0,
  },
  {
    key: 'durationMonths',
    label: 'Duration (Months)',
    type: 'number',
    icon: IconClock,
    placeholder: 'e.g. 6',
    required: false,
    min: 1,
  },
];

const FIELD_SECTIONS = [
  {
    id: 'role',
    number: '01',
    legend: 'Requirement details',
    description: 'Define the client, role and hiring requirements.',
    keys: [
      'requirementDate',
      'clientName',
      'roleSkill',
      'jobFamilyName',
      'numberOfPositions',
      'priorityCode',
      'jobLocation',
    ],
  },
  {
    id: 'owners',
    number: '02',
    legend: 'Ownership',
    description: 'Choose the sales owner responsible for this requirement.',
    keys: ['salesOwnerId'],
  },
  {
    id: 'commercial',
    number: '03',
    legend: 'Timeline & budget',
    description: 'TA Handoff and Target Closure dates are required. Budget fields are optional.',
    keys: [
      'taHandoffDate',
      'targetClosureDate',
      'experience',
      'minBudget',
      'maxBudget',
      'durationMonths',
    ],
  },
];

function findByName(list, name) {
  const needle = String(name || '').trim().toLowerCase();

  if (!needle) return null;

  return (
    list.find(
      (item) =>
        String(item.name || '').trim().toLowerCase() === needle,
    ) || null
  );
}

function normalizeMemberList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data?.items)) return res.data.items;
  if (Array.isArray(res?.data)) return res.data;

  return [];
}

function memberLoadError(err, fallback) {
  const raw =
    err?.response?.data?.message || err?.message || fallback;

  return Array.isArray(raw) ? raw.join('; ') : String(raw);
}

export default function AddRequestScreen() {
  const { user } = useAuth();
  const { toast } = useToast();

  const isSales = user?.userType === 'sales';
  const canAssign = ['admin', 'sales', 'sales_lead'].includes(
    user?.userType,
  );

  const [form, setForm] = useState(EMPTY);

  const [jobFamilies, setJobFamilies] = useState([]);
  const [clients, setClients] = useState([]);
  const [salesMembers, setSalesMembers] = useState([]);
  const [taMembers, setTaMembers] = useState([]);
  const [taLeadMembers, setTaLeadMembers] = useState([]);

  const [assignMode, setAssignMode] = useState('none');
  const [taLeadIds, setTaLeadIds] = useState([]);
  const [taOwnerIds, setTaOwnerIds] = useState([]);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [taLeadLoadError, setTaLeadLoadError] = useState(null);

  const loadTaLeadMembers = useCallback(async () => {
    const url = ENDPOINTS.TA_LEAD_MEMBERS;

    if (!url) {
      setTaLeadLoadError(
        'TA Lead members endpoint is not configured.',
      );
      setTaLeadMembers([]);
      return [];
    }

    try {
      const res = await get(url);
      const list = normalizeMemberList(res);

      setTaLeadMembers(list);
      setTaLeadLoadError(null);

      return list;
    } catch (err) {
      setTaLeadMembers([]);
      setTaLeadLoadError(
        memberLoadError(err, 'Failed to load TA Lead users.'),
      );

      return [];
    }
  }, []);

  const loadTaMembers = useCallback(async () => {
    const url = ENDPOINTS.TA_MEMBERS;

    if (!url) {
      setTaMembers([]);
      return [];
    }

    try {
      const res = await get(url);
      const list = normalizeMemberList(res);

      setTaMembers(list);

      return list;
    } catch {
      setTaMembers([]);
      return [];
    }
  }, []);

  useEffect(() => {
    let active = true;

    get(ENDPOINTS.JOB_FAMILIES)
      .then((res) => {
        if (active) {
          setJobFamilies(
            Array.isArray(res) ? res : res?.data || [],
          );
        }
      })
      .catch(() => active && setJobFamilies([]));

    get(ENDPOINTS.CLIENTS)
      .then((res) => {
        if (active) {
          setClients(
            Array.isArray(res) ? res : res?.data || [],
          );
        }
      })
      .catch(() => active && setClients([]));

    get(ENDPOINTS.SALES_MEMBERS)
      .then((res) => {
        if (active) {
          setSalesMembers(normalizeMemberList(res));
        }
      })
      .catch(() => active && setSalesMembers([]));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canAssign || !user?.id) return undefined;

    let cancelled = false;

    (async () => {
      await Promise.all([
        loadTaMembers(),
        loadTaLeadMembers(),
      ]);

      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [canAssign, user?.id, loadTaMembers, loadTaLeadMembers]);

  useEffect(() => {
    if (!isSales || !user?.id || !salesMembers.length) return;

    const me = salesMembers.find(
      (member) => String(member.id) === String(user.id),
    );

    if (me) {
      setForm((current) =>
        current.salesOwnerId
          ? current
          : { ...current, salesOwnerId: me.id },
      );
    }
  }, [isSales, user?.id, salesMembers]);

  const update = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const setMode = (mode) => {
    setAssignMode(mode);
    setTaLeadIds([]);
    setTaOwnerIds([]);

    if (mode === 'lead' && taLeadMembers.length === 0) {
      void loadTaLeadMembers();
    }
  };

  const ensureMasterRecord = async (
    list,
    setList,
    name,
    createUrl,
  ) => {
    const trimmed = String(name || '').trim();

    if (!trimmed) {
      throw new Error('Name is required');
    }

    const existing = findByName(list, trimmed);

    if (existing) return existing.id;

    const created = await post(createUrl, {
      name: trimmed,
    });

    const row = created?.id ? created : created?.data || created;

    if (!row?.id) {
      throw new Error(`Failed to create "${trimmed}"`);
    }

    setList((prev) =>
      findByName(prev, row.name || trimmed)
        ? prev
        : [...prev, row],
    );

    return row.id;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError(null);
    setSuccess(null);

    const missing = [
      { key: 'requirementDate', label: 'Requirement Date', required: true },
      { key: 'clientName', label: 'Client', required: true },
      { key: 'roleSkill', label: 'Role / Skill', required: true },
      { key: 'jobFamilyName', label: 'Job Family', required: true },
      { key: 'numberOfPositions', label: 'Number of Positions', required: true },
      { key: 'salesOwnerId', label: 'Sales Owner', required: true },
      { key: 'priorityCode', label: 'Priority', required: true },
      { key: 'jobLocation', label: 'Job Location', required: true },
      { key: 'taHandoffDate', label: 'TA Handoff Date', required: true },
      { key: 'targetClosureDate', label: 'Target Closure Date', required: true },
    ].filter(
      (field) =>
        field.required &&
        !String(form[field.key] ?? '').trim(),
    );

    if (missing.length) {
      setError(
        `Please fill: ${missing.map((field) => field.label).join(', ')}`,
      );
      return;
    }

    if (!salesMembers.length) {
      setError(
        'No Sales users found. Create a Sales user from Admin first.',
      );
      return;
    }

    if (assignMode === 'lead' && !taLeadIds.length) {
      setError(
        'Select at least one TA Lead, or choose a different assignment mode.',
      );
      return;
    }

    if (assignMode === 'owners' && !taOwnerIds.length) {
      setError(
        'Select at least one TA Owner, or choose a different assignment mode.',
      );
      return;
    }

    setSubmitting(true);

    try {
      const toInt = (value) => {
        if (value === '' || value == null) return undefined;

        const number = parseInt(value, 10);

        return Number.isFinite(number) ? number : undefined;
      };

      const toNum = (value) => {
        if (value === '' || value == null) return undefined;

        const number = Number(value);

        return Number.isFinite(number) ? number : undefined;
      };

      const clientId = await ensureMasterRecord(
        clients,
        setClients,
        form.clientName,
        ENDPOINTS.CLIENTS,
      );

      const jobFamilyId = await ensureMasterRecord(
        jobFamilies,
        setJobFamilies,
        form.jobFamilyName,
        ENDPOINTS.JOB_FAMILIES,
      );

      const payload = {
        requirementDate: form.requirementDate,
        clientId,
        roleSkill: form.roleSkill,
        jobFamilyId,
        numberOfPositions: toInt(form.numberOfPositions),
        salesOwnerId: form.salesOwnerId,
        priorityCode: form.priorityCode,
        taHandoffDate: form.taHandoffDate,
        targetClosureDate: form.targetClosureDate,
        remarks: form.remarks || undefined,
        experience: form.experience || undefined,
        jobLocation: form.jobLocation,
        minBudget: toNum(form.minBudget),
        maxBudget: toNum(form.maxBudget),
        durationMonths: toInt(form.durationMonths),

        ...(canAssign && assignMode === 'lead'
          ? { taLeadIds, taOwnerIds: [] }
          : {}),

        ...(canAssign && assignMode === 'owners'
          ? { taOwnerIds, taLeadIds: [] }
          : {}),

        ...(canAssign && assignMode === 'none'
          ? { taOwnerIds: [], taLeadIds: [] }
          : {}),
      };

      const res = await post(ENDPOINTS.ADD_REQUEST, payload);

      addRequirement({
        id: res?.request?.id || res?.id,
        status: res?.request?.status || 'Submitted',
        clientName: form.clientName.trim(),
        jobFamilyName: form.jobFamilyName.trim(),
        ...payload,
      });

      const okMsg =
        assignMode === 'owners'
          ? 'Requirement created and assigned to TA owner(s).'
          : assignMode === 'lead'
            ? 'Requirement created and sent to TA Lead(s) for TA assignment.'
            : 'Requirement created. All TA Leads have been notified.';

      setSuccess(res.message || okMsg);
      toast(res.message || okMsg);

      setForm({
        ...EMPTY,
        ...(isSales && user?.id
          ? { salesOwnerId: user.id }
          : {}),
      });

      setMode('none');
    } catch (err) {
      const raw =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to submit request. Please try again.';

      setError(
        Array.isArray(raw) ? raw.join('; ') : String(raw),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      ...EMPTY,
      ...(isSales && user?.id
        ? { salesOwnerId: user.id }
        : {}),
    });

    setMode('none');
    setError(null);
    setSuccess(null);
    setTaLeadLoadError(null);
  };

  const renderField = (field) => {
    const FieldIcon = field.icon;

    return (
      <label
        key={field.key}
        className={`ar-field${field.required ? ' ar-field--required' : ''}`}
      >
        <span className="ar-field-label">
          <span className="ar-field-icon">
            <FieldIcon />
          </span>

          {field.label}

          {field.required && (
            <span className="ar-required">*</span>
          )}
        </span>

        {field.type === 'select' ? (
          <select
            className="ar-control"
            value={form[field.key]}
            required={field.required}
            onChange={(e) => update(field.key, e.target.value)}
          >
            <option value="">Select {field.label}...</option>

            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : field.type === 'combobox-client' ? (
          <>
            <input
              className="ar-control"
              list="ar-client-options"
              value={form.clientName}
              placeholder={field.placeholder}
              autoComplete="off"
              required={field.required}
              onChange={(e) => update('clientName', e.target.value)}
            />

            <datalist id="ar-client-options">
              {clients.map((client) => (
                <option key={client.id} value={client.name} />
              ))}
            </datalist>
          </>
        ) : field.type === 'combobox-jobfamily' ? (
          <>
            <input
              className="ar-control"
              list="ar-jobfamily-options"
              value={form.jobFamilyName}
              placeholder={field.placeholder}
              autoComplete="off"
              required={field.required}
              onChange={(e) => update('jobFamilyName', e.target.value)}
            />

            <datalist id="ar-jobfamily-options">
              {jobFamilies.map((family) => (
                <option key={family.id} value={family.name} />
              ))}
            </datalist>
          </>
        ) : field.type === 'select-owner' ? (
          <select
            className="ar-control"
            value={form[field.key]}
            required={field.required}
            onChange={(e) => update(field.key, e.target.value)}
            disabled={isSales}
          >
            <option value="">Select Sales Owner...</option>

            {salesMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
              </option>
            ))}
          </select>
        ) : (
          <input
            className="ar-control"
            type={field.type}
            value={form[field.key]}
            placeholder={field.placeholder}
            min={field.min}
            required={field.required}
            onChange={(e) => {
              if (
                field.min === 0 &&
                Number(e.target.value) < 0
              ) {
                return;
              }

              update(field.key, e.target.value);
            }}
          />
        )}
      </label>
    );
  };

  return (
    <div className="ar-screen">
      <PageHeader
        icon={IconPlus}
        title="Add Recruitment Request"
        subtitle="Create a new requirement and configure its ownership, timeline and budget."
      />

      <form className="ar-form" onSubmit={handleSubmit}>
        {FIELD_SECTIONS.map((section) => (
          <section
            key={section.id}
            className="ar-section"
          >
            <div className="ar-section-header">
              <div className="ar-section-number">
                {section.number}
              </div>

              <div className="ar-section-heading">
                <h3>{section.legend}</h3>
                <p>{section.description}</p>
              </div>
            </div>

            <div
              className={`ar-grid ar-grid--${section.id}`}
            >
              {section.keys.map((key) => {
                const field = FIELDS.find(
                  (item) => item.key === key,
                );

                return field ? renderField(field) : null;
              })}
            </div>
          </section>
        ))}

        {/* TA Assignment */}

        {canAssign && (
          <section className="ar-section ar-assignment">
            <div className="ar-section-header">
              <div className="ar-section-number">04</div>

              <div className="ar-section-heading">
                <h3>TA assignment</h3>
                <p>
                  Decide how this requirement should be assigned to
                  the Talent Acquisition team.
                </p>
              </div>
            </div>

            <div className="ar-assignment-options">
              <label
                className={`ar-assignment-option${
                  assignMode === 'none' ? ' is-selected' : ''
                }`}
              >
                <input
                  type="radio"
                  name="assignMode"
                  checked={assignMode === 'none'}
                  onChange={() => setMode('none')}
                />

                <span className="ar-radio-indicator" />

                <span className="ar-option-content">
                  <strong>Unassigned</strong>
                  <small>Notify all TA Leads</small>
                </span>
              </label>

              <label
                className={`ar-assignment-option${
                  assignMode === 'lead' ? ' is-selected' : ''
                }`}
              >
                <input
                  type="radio"
                  name="assignMode"
                  checked={assignMode === 'lead'}
                  onChange={() => setMode('lead')}
                />

                <span className="ar-radio-indicator" />

                <span className="ar-option-content">
                  <strong>Via TA Lead</strong>
                  <small>Let a TA Lead assign owners</small>
                </span>
              </label>

              <label
                className={`ar-assignment-option${
                  assignMode === 'owners' ? ' is-selected' : ''
                }`}
              >
                <input
                  type="radio"
                  name="assignMode"
                  checked={assignMode === 'owners'}
                  onChange={() => setMode('owners')}
                />

                <span className="ar-radio-indicator" />

                <span className="ar-option-content">
                  <strong>Direct TA Owners</strong>
                  <small>Choose owners directly</small>
                </span>
              </label>
            </div>

            {assignMode === 'lead' && (
              <div className="ar-assignment-select">
                <div className="ar-assignment-select-heading">
                  <strong>Select TA Lead(s)</strong>
                  <span>Required</span>
                </div>

                <TaOwnersMultiSelect
                  options={taLeadMembers}
                  value={taLeadIds}
                  onChange={setTaLeadIds}
                  idPrefix="create-ta-lead"
                  placeholder="Select TA Lead(s)..."
                  emptyMessage={
                    taLeadLoadError ||
                    'No TA Lead users found. Create a TA Lead from Admin first.'
                  }
                  ariaLabel="TA Leads"
                />

                {taLeadLoadError && (
                  <div className="ar-inline-error">
                    <span>{taLeadLoadError}</span>

                    <button
                      type="button"
                      onClick={() => void loadTaLeadMembers()}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            )}

            {assignMode === 'owners' && (
              <div className="ar-assignment-select">
                <div className="ar-assignment-select-heading">
                  <strong>Select TA Owner(s)</strong>
                  <span>Required</span>
                </div>

                <TaOwnersMultiSelect
                  options={taMembers}
                  value={taOwnerIds}
                  onChange={setTaOwnerIds}
                  idPrefix="create-ta-owner"
                  placeholder="Select TA owner(s)..."
                  emptyMessage="No TA users found. Create a TA user from Admin first."
                  ariaLabel="TA owners"
                />
              </div>
            )}
          </section>
        )}

        {/* Job Description */}

        <section className="ar-section ar-description-section">
          <div className="ar-section-header">
            <div className="ar-section-number">
              {canAssign ? '05' : '04'}
            </div>

            <div className="ar-section-heading">
              <h3>Job description</h3>
              <p>
                Add any additional responsibilities, skills or
                instructions for the recruitment team.
              </p>
            </div>
          </div>

          <label className="ar-field ar-field--full">
            <span className="ar-field-label">
              <span className="ar-field-icon">
                <IconBriefcase />
              </span>
              Additional details
              <span className="ar-optional">Optional</span>
            </span>

            <textarea
              className="ar-control ar-textarea"
              value={form.remarks}
              placeholder="Write job description, key responsibilities, required skills or any additional instructions..."
              rows={4}
              onChange={(e) => update('remarks', e.target.value)}
            />
          </label>
        </section>

        {/* Feedback */}

        {error && (
          <div className="ar-feedback ar-feedback--error" role="alert">
            <strong>Unable to submit request</strong>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="ar-feedback ar-feedback--success" role="status">
            <strong>Request created successfully</strong>
            <span>{success}</span>
          </div>
        )}

        {/* Form Actions */}

        <div className="ar-footer">
          <div className="ar-footer-note">
            <span className="ar-required">*</span>
            Required fields
          </div>

          <div className="ar-actions">
            <button
              type="button"
              className="ar-reset"
              onClick={resetForm}
              disabled={submitting}
            >
              Reset form
            </button>

            <button
              type="submit"
              className="ar-submit"
              disabled={submitting}
            >
              {submitting ? (
                'Submitting...'
              ) : (
                <>
                  <IconPlus />
                  Submit Request
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
