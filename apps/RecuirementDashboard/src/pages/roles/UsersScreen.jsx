import { useCallback, useEffect, useState } from 'react';
import { get, post, patch, del } from '../../services/apiClient';
import { ENDPOINTS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import {
  IconUser,
  IconFilePlus,
  IconFilter,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconX,
} from '../../components/Icons';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { formatDate } from '../../utils/formatDate';
import { useToast } from '../../context/ToastContext';
import TableSearch from '../../components/TableSearch';
import { EmptyState } from '../../components/ui';
import DownloadExcelButton from '../../components/DownloadExcelButton';
import './../pageCss/UsersScreen.css';

const EMPTY_FORM = {
  email: '',
  fullName: '',
  role: 'ADMIN',
  password: '',
};

const PAGE_SIZE = 20;

const FALLBACK_ROLES = [
  { value: 'SALES', label: 'Sales Owner' },
  { value: 'SALES_LEAD', label: 'Sales Lead' },
  { value: 'TA', label: 'TA Owner' },
  { value: 'TA_LEAD', label: 'TA Lead' },
  { value: 'HR', label: 'HR Owner' },
  { value: 'HR_LEAD', label: 'HR Lead' },
  { value: 'ADMIN', label: 'Admin' },
];

function normalizeRoleOptions(res) {
  const options = res?.options || res?.items || (Array.isArray(res) ? res : []);

  return options
    .map((o) => ({
      value: o.value || o.code || o.role || o,
      label: o.label || o.name || o.value || o.code || String(o),
      description: o.description || '',
    }))
    .filter((o) => o.value);
}

function roleLabel(roles, value) {
  return roles.find((r) => r.value === value)?.label || value;
}

function errorMessage(err, fallback) {
  const msg = err?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg || fallback;
}

export default function UsersScreen() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  // Create user
  const [form, setForm] = useState(EMPTY_FORM);
  const [createOpen, setCreateOpen] = useState(false);
  const [roles, setRoles] = useState(FALLBACK_ROLES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // User listing
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState(null);

  // Edit user
  const [editing, setEditing] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Delete user
  const [deletingId, setDeletingId] = useState(null);

  const selectedRole = roles.find((r) => r.value === form.role);
  const editSelectedRole = roles.find((r) => r.value === editing?.role);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const isSelf = (id) => currentUser?.id && id === currentUser.id;

  const hasFilters = Boolean(
    roleFilter || statusFilter || searchInput.trim()
  );

  const activeFilterCount =
    (roleFilter ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (searchInput.trim() ? 1 : 0);

  // Load role options
  useEffect(() => {
    let active = true;

    get(ENDPOINTS.USER_ROLES)
      .then((res) => {
        if (!active) return;

        const list = normalizeRoleOptions(res);

        if (list.length) {
          setRoles(list);

          setForm((p) => ({
            ...p,
            role: list.some((r) => r.value === p.role)
              ? p.role
              : list[0].value,
          }));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQ(searchInput.trim());
      setPage(1);
    }, 300);

    return () => clearTimeout(t);
  }, [searchInput]);

  // Load users
  const loadUsers = useCallback(async () => {
    setListLoading(true);
    setListError(null);

    try {
      const params = new URLSearchParams();

      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));

      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter === 'active') params.set('isActive', 'true');
      if (statusFilter === 'inactive') params.set('isActive', 'false');
      if (searchQ) params.set('q', searchQ);

      const res = await get(`${ENDPOINTS.USERS}?${params.toString()}`);

      setUsers(Array.isArray(res?.items) ? res.items : []);
      setTotal(Number(res?.total) || 0);
      setPageSize(Number(res?.pageSize) || PAGE_SIZE);
    } catch (err) {
      setUsers([]);
      setTotal(0);
      setListError(errorMessage(err, 'Failed to load users.'));
    } finally {
      setListLoading(false);
    }
  }, [page, roleFilter, statusFilter, searchQ]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Modal handling
  const openCreate = () => {
    setForm({
      ...EMPTY_FORM,
      role: roles.some((r) => r.value === 'ADMIN')
        ? 'ADMIN'
        : roles[0]?.value || '',
    });
    setError(null);
    setSuccess(null);
    setShowCreatePassword(false);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (saving) return;
    setCreateOpen(false);
    setError(null);
    setShowCreatePassword(false);
  };

  const openEdit = (u) => {
    setEditError(null);
    setSuccess(null);
    setShowResetPassword(false);

    setEditing({
      id: u.id,
      email: u.email,
      fullName: u.fullName || '',
      role: u.role,
      isActive: Boolean(u.isActive),
      newPassword: '',
    });
  };

  const closeEdit = () => {
    if (editSaving) return;
    setEditing(null);
    setEditError(null);
    setShowResetPassword(false);
  };

  useEscapeKey(Boolean(createOpen || editing), () => {
    if (createOpen && !saving) closeCreate();
    else if (editing && !editSaving) closeEdit();
  });

  // Clear filters
  const clearFilters = () => {
    setRoleFilter('');
    setStatusFilter('');
    setSearchInput('');
    setSearchQ('');
    setPage(1);
  };

  // Create user
  const saveUser = async (e) => {
    e.preventDefault();

    if (!form.email.trim()) {
      setError('Email is required.');
      return;
    }

    if (!form.fullName.trim()) {
      setError('Full name is required.');
      return;
    }

    if (!form.role) {
      setError('Role is required.');
      return;
    }

    if (!form.password || form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        role: form.role,
        password: form.password,
      };

      const res = await post(ENDPOINTS.USERS, payload);

      const message =
        res?.message ||
        `User created: ${payload.fullName} (${payload.role})`;

      setSuccess(message);
      toast(message);

      setForm({ ...EMPTY_FORM, role: form.role });
      setCreateOpen(false);
      setPage(1);

      await loadUsers();
    } catch (err) {
      setError(errorMessage(err, 'Failed to create user.'));
    } finally {
      setSaving(false);
    }
  };

  // Edit user
  const saveEdit = async (e) => {
    e.preventDefault();

    if (!editing?.id) return;

    if (!editing.fullName.trim()) {
      setEditError('Full name is required.');
      return;
    }

    if (!editing.role) {
      setEditError('Role is required.');
      return;
    }

    if (editing.newPassword && editing.newPassword.length < 8) {
      setEditError('New password must be at least 8 characters.');
      return;
    }

    if (isSelf(editing.id) && !editing.isActive) {
      setEditError('You cannot deactivate your own account.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    setError(null);
    setSuccess(null);

    try {
      await patch(`${ENDPOINTS.USERS}/${editing.id}`, {
        fullName: editing.fullName.trim(),
        role: editing.role,
        isActive: editing.isActive,
      });

      if (editing.newPassword) {
        await post(`${ENDPOINTS.USERS}/${editing.id}/reset-password`, {
          password: editing.newPassword,
        });
      }

      const message = editing.newPassword
        ? `User updated and password reset: ${editing.fullName}`
        : `User updated: ${editing.fullName}`;

      setSuccess(message);
      toast(message);

      setEditing(null);
      setShowResetPassword(false);

      await loadUsers();
    } catch (err) {
      setEditError(errorMessage(err, 'Failed to update user.'));
    } finally {
      setEditSaving(false);
    }
  };

  // Delete user
  const deleteUser = async (u) => {
    if (!u?.id) return;

    if (isSelf(u.id)) {
      setError('You cannot delete your own account.');
      return;
    }

    const confirmed = window.confirm(
      `Delete user "${u.fullName}" (${u.email})?\n\nThey will be deactivated and removed from the active user list.`
    );

    if (!confirmed) return;

    setDeletingId(u.id);
    setError(null);
    setSuccess(null);

    try {
      await del(`${ENDPOINTS.USERS}/${u.id}`);

      const message = `User deleted: ${u.fullName}`;

      setSuccess(message);
      toast(message);

      if (editing?.id === u.id) {
        setEditing(null);
      }

      await loadUsers();
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete user.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className={`usrx-screen ${isDark ? 'usrx-dark' : 'usrx-light'}`}>

      {/* PAGE HEADER */}
      <header className="usrx-header">
        <div className="usrx-header-main">
          <span className="usrx-header-icon">
            <IconUser />
          </span>

          <div className="usrx-heading-copy">
            <span className="usrx-eyebrow">ADMINISTRATION</span>
            <h2>User management</h2>
            <p>Manage accounts, access roles and user permissions.</p>
          </div>
        </div>

        <div className="usrx-header-actions">
          <div className="usrx-total">
            <strong>{total}</strong>
            <span>Total users</span>
          </div>

          <button
            type="button"
            className="usrx-create-btn"
            onClick={openCreate}
          >
            <IconFilePlus />
            <span>Create user</span>
          </button>
        </div>
      </header>

      {/* SUMMARY */}
      <section className="usrx-summary">
        <div className="usrx-summary-card">
          <span className="usrx-summary-label">Total accounts</span>
          <strong>{total}</strong>
          <span className="usrx-summary-caption">Across all roles</span>
        </div>

        <div className="usrx-summary-card">
          <span className="usrx-summary-label">Current page</span>
          <strong>{users.length}</strong>
          <span className="usrx-summary-caption">Users displayed</span>
        </div>

        <div className="usrx-summary-card">
          <span className="usrx-summary-label">Page</span>
          <strong>{page} / {totalPages}</strong>
          <span className="usrx-summary-caption">Current pagination</span>
        </div>
      </section>

      {/* FILTERS */}
      <section className="usrx-filter-panel">
        <div className="usrx-filter-top">
          <div className="usrx-filter-title">
            <span className="usrx-filter-icon">
              <IconFilter />
            </span>
            <div>
              <h3>Users directory</h3>
              <p>Search and filter accounts by role or status.</p>
            </div>
          </div>

          <div className="usrx-filter-actions">
            {hasFilters && (
              <span className="usrx-filter-count">
                {activeFilterCount} active
              </span>
            )}

            {hasFilters && (
              <button
                type="button"
                className="usrx-text-btn"
                onClick={clearFilters}
              >
                <IconX />
                Clear filters
              </button>
            )}

            {!listLoading && (
              <DownloadExcelButton
                filename="users"
                rows={users}
                columns={[
                  {
                    label: 'Full name',
                    value: (u) => isSelf(u.id) ? `${u.fullName} (you)` : u.fullName,
                  },
                  { label: 'Email', value: (u) => u.email },
                  { label: 'Role', value: (u) => roleLabel(roles, u.role) },
                  { label: 'Status', value: (u) => u.isActive ? 'Active' : 'Inactive' },
                  { label: 'Created', value: (u) => formatDate(u.createdAt) },
                ]}
              />
            )}
          </div>
        </div>

        <div className="usrx-filter-fields">
          <label className="usrx-field">
            <span>Role</span>
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label className="usrx-field">
            <span>Account status</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          <div className="usrx-search">
            <span className="usrx-search-label">Search users</span>
            <TableSearch
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search by name or email..."
            />
          </div>
        </div>

        {hasFilters && (
          <div className="usrx-active-filters">
            {roleFilter && (
              <button
                type="button"
                onClick={() => {
                  setRoleFilter('');
                  setPage(1);
                }}
              >
                Role: {roleLabel(roles, roleFilter)}
                <IconX />
              </button>
            )}

            {statusFilter && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  setPage(1);
                }}
              >
                Status: {statusFilter}
                <IconX />
              </button>
            )}

            {searchInput.trim() && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQ('');
                  setPage(1);
                }}
              >
                Search: {searchInput.trim()}
                <IconX />
              </button>
            )}
          </div>
        )}
      </section>

      {/* FEEDBACK */}
      {listError && (
        <div className="usrx-alert usrx-alert-error">{listError}</div>
      )}

      {error && !createOpen && (
        <div className="usrx-alert usrx-alert-error">{error}</div>
      )}

      {success && (
        <div className="usrx-alert usrx-alert-success">{success}</div>
      )}

      {/* USER TABLE */}
      <section className="usrx-table-panel">
        <div className="usrx-table-heading">
          <div>
            <h3>All users</h3>
            <p>
              {listLoading
                ? 'Loading user records...'
                : `${users.length} records on this page`}
            </p>
          </div>

          <span className="usrx-table-count">
            {total} records
          </span>
        </div>

        {listLoading && users.length === 0 ? (
          <div className="usrx-loading">
            <span className="usrx-spinner" />
            Loading users...
          </div>
        ) : !listLoading && users.length === 0 ? (
          <EmptyState
            icon={IconUser}
            title="No users found"
            description={
              hasFilters
                ? 'Try changing your search or clearing the filters.'
                : 'Create your first user account to get started.'
            }
          />
        ) : (
          <div className="usrx-table-scroll">
            <table className="usrx-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th className="usrx-actions-heading">Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="usrx-user-cell">
                        <span className="usrx-avatar">
                          {(u.fullName || u.email || 'U')
                            .charAt(0)
                            .toUpperCase()}
                        </span>

                        <div className="usrx-user-info">
                          <strong>
                            {u.fullName || 'Unnamed user'}
                            {isSelf(u.id) && (
                              <span className="usrx-you">You</span>
                            )}
                          </strong>
                          <span>{u.email}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="usrx-role-pill">
                        {roleLabel(roles, u.role)}
                      </span>
                    </td>

                    <td>
                      <span
                        className={`usrx-status ${
                          u.isActive ? 'is-active' : 'is-inactive'
                        }`}
                      >
                        <span />
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td className="usrx-date">
                      {formatDate(u.createdAt)}
                    </td>

                    <td>
                      <div className="usrx-row-actions">
                        <button
                          type="button"
                          className="usrx-edit-btn"
                          onClick={() => openEdit(u)}
                          title="Edit user"
                        >
                          <IconEdit />
                          Edit
                        </button>

                        <button
                          type="button"
                          className="usrx-delete-btn"
                          disabled={isSelf(u.id) || deletingId === u.id}
                          onClick={() => deleteUser(u)}
                          title={
                            isSelf(u.id)
                              ? 'Cannot delete your own account'
                              : 'Delete user'
                          }
                        >
                          {deletingId === u.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* PAGINATION */}
      {total > 0 && (
        <footer className="usrx-pagination">
          <span>
            Showing {users.length} of {total} users
          </span>

          <div className="usrx-pagination-controls">
            <button
              type="button"
              disabled={page <= 1 || listLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>

            <span>
              Page <strong>{page}</strong> of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || listLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      )}

      {/* CREATE USER MODAL */}
      {createOpen && (
        <div
          className="usrx-modal-overlay"
          onClick={closeCreate}
          role="presentation"
        >
          <section
            className="usrx-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="usrx-create-title"
          >
            <header className="usrx-modal-header">
              <div className="usrx-modal-title-group">
                <span className="usrx-modal-icon">
                  <IconFilePlus />
                </span>

                <div>
                  <span className="usrx-eyebrow">USER ADMINISTRATION</span>
                  <h3 id="usrx-create-title">Create new user</h3>
                  <p>Add a new account and assign its access role.</p>
                </div>
              </div>

              <button
                type="button"
                className="usrx-modal-close"
                onClick={closeCreate}
                disabled={saving}
                aria-label="Close create user modal"
              >
                <IconX />
              </button>
            </header>

            <form onSubmit={saveUser}>
              <div className="usrx-modal-body">
                {error && (
                  <div className="usrx-alert usrx-alert-error" role="alert">
                    {error}
                  </div>
                )}

                <div className="usrx-form-grid">
                  <label className="usrx-form-field">
                    <span>Full name <i>*</i></span>
                    <input
                      type="text"
                      placeholder="Enter full name"
                      value={form.fullName}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, fullName: e.target.value }))
                      }
                      required
                    />
                  </label>

                  <label className="usrx-form-field">
                    <span>Email address <i>*</i></span>
                    <input
                      type="email"
                      placeholder="name@company.com"
                      value={form.email}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, email: e.target.value }))
                      }
                      required
                    />
                  </label>

                  <label className="usrx-form-field">
                    <span>Access role <i>*</i></span>
                    <select
                      value={form.role}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, role: e.target.value }))
                      }
                      required
                    >
                      {roles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>

                    {selectedRole?.description && (
                      <small>{selectedRole.description}</small>
                    )}
                  </label>

                  <label className="usrx-form-field">
                    <span>Password <i>*</i></span>
                    <div className="usrx-password-wrap">
                      <input
                        type={showCreatePassword ? 'text' : 'password'}
                        placeholder="Minimum 8 characters"
                        value={form.password}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, password: e.target.value }))
                        }
                        required
                        minLength={8}
                      />

                      <button
                        type="button"
                        onClick={() => setShowCreatePassword((v) => !v)}
                        aria-label={
                          showCreatePassword ? 'Hide password' : 'Show password'
                        }
                      >
                        {showCreatePassword ? <IconEyeOff /> : <IconEye />}
                      </button>
                    </div>
                    <small>Use at least 8 characters.</small>
                  </label>
                </div>
              </div>

              <footer className="usrx-modal-footer">
                <button
                  type="button"
                  className="usrx-secondary-btn"
                  onClick={closeCreate}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="usrx-primary-btn"
                  disabled={saving}
                >
                  <IconFilePlus />
                  {saving ? 'Creating user...' : 'Create user'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editing && (
        <div
          className="usrx-modal-overlay"
          onClick={closeEdit}
          role="presentation"
        >
          <section
            className="usrx-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="usrx-edit-title"
          >
            <header className="usrx-modal-header">
              <div className="usrx-modal-title-group">
                <span className="usrx-modal-icon">
                  <IconEdit />
                </span>

                <div>
                  <span className="usrx-eyebrow">USER ADMINISTRATION</span>
                  <h3 id="usrx-edit-title">Edit user</h3>
                  <p>{editing.email}</p>
                </div>
              </div>

              <button
                type="button"
                className="usrx-modal-close"
                onClick={closeEdit}
                disabled={editSaving}
                aria-label="Close edit user modal"
              >
                <IconX />
              </button>
            </header>

            <form onSubmit={saveEdit}>
              <div className="usrx-modal-body">
                {editError && (
                  <div className="usrx-alert usrx-alert-error" role="alert">
                    {editError}
                  </div>
                )}

                <div className="usrx-form-grid">
                  <label className="usrx-form-field">
                    <span>Email address</span>
                    <input
                      type="email"
                      value={editing.email}
                      readOnly
                      disabled
                    />
                  </label>

                  <label className="usrx-form-field">
                    <span>Full name <i>*</i></span>
                    <input
                      type="text"
                      value={editing.fullName}
                      onChange={(e) =>
                        setEditing((p) => ({
                          ...p,
                          fullName: e.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <label className="usrx-form-field">
                    <span>Access role <i>*</i></span>
                    <select
                      value={editing.role}
                      onChange={(e) =>
                        setEditing((p) => ({
                          ...p,
                          role: e.target.value,
                        }))
                      }
                      required
                    >
                      {roles.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>

                    {editSelectedRole?.description && (
                      <small>{editSelectedRole.description}</small>
                    )}
                  </label>

                  <label className="usrx-form-field">
                    <span>Account status</span>
                    <select
                      value={editing.isActive ? 'active' : 'inactive'}
                      disabled={isSelf(editing.id)}
                      onChange={(e) =>
                        setEditing((p) => ({
                          ...p,
                          isActive: e.target.value === 'active',
                        }))
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>

                    {isSelf(editing.id) && (
                      <small>You cannot deactivate your own account.</small>
                    )}
                  </label>

                  <label className="usrx-form-field usrx-field-full">
                    <span>Reset password</span>
                    <div className="usrx-password-wrap">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        placeholder="Leave blank to keep current password"
                        value={editing.newPassword}
                        onChange={(e) =>
                          setEditing((p) => ({
                            ...p,
                            newPassword: e.target.value,
                          }))
                        }
                        minLength={8}
                      />

                      <button
                        type="button"
                        onClick={() => setShowResetPassword((v) => !v)}
                        aria-label={
                          showResetPassword ? 'Hide password' : 'Show password'
                        }
                      >
                        {showResetPassword ? <IconEyeOff /> : <IconEye />}
                      </button>
                    </div>
                    <small>Leave blank if you do not want to change the password.</small>
                  </label>
                </div>
              </div>

              <footer className="usrx-modal-footer usrx-edit-footer">
                <button
                  type="button"
                  className="usrx-secondary-btn"
                  onClick={closeEdit}
                  disabled={editSaving}
                >
                  Cancel
                </button>

                {!isSelf(editing.id) && (
                  <button
                    type="button"
                    className="usrx-delete-btn"
                    disabled={editSaving || deletingId === editing.id}
                    onClick={() => deleteUser(editing)}
                  >
                    {deletingId === editing.id ? 'Deleting...' : 'Delete user'}
                  </button>
                )}

                <button
                  type="submit"
                  className="usrx-primary-btn"
                  disabled={editSaving}
                >
                  <IconEdit />
                  {editSaving ? 'Saving changes...' : 'Save changes'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
