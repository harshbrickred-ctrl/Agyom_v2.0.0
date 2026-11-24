import { useEffect, useMemo, useState } from 'react';
import { ENDPOINTS } from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { IconBriefcase, IconClipboardCheck, IconX } from '../../components/Icons';
import RequirementPipelineBoard from '../../components/RequirementPipelineBoard';
import CandidateResumeSection from '../../components/CandidateResumeSection';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { EmptyState, ScreenSkeleton } from '../../components/ui';
import { fetchAllPages } from '../../utils/fetchAllPages';
import { formatDate } from '../../utils/formatDate';
import { matchesQuery, useDebouncedValue } from '../../utils/listSearch';
import './../pageCss/AssignTaskScreen.css';

const TASK_SECTIONS = [
  { status: 'ACTIVE', label: 'Active' },
  { status: 'ON_HOLD', label: 'On hold' },
  { status: 'CLOSED', label: 'Closed' },
  { status: 'CANCELLED', label: 'Cancelled' },
];

export default function MyTasksScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pipelineReq, setPipelineReq] = useState(null);
  const [viewingCandidate, setViewingCandidate] = useState(null);
  const [taskSearch, setTaskSearch] = useState('');
  const taskSearchQ = useDebouncedValue(taskSearch);
  const [activeTaskStatus, setActiveTaskStatus] = useState('ACTIVE');

  useEscapeKey(Boolean(pipelineReq || viewingCandidate), () => {
    if (viewingCandidate) setViewingCandidate(null);
    else setPipelineReq(null);
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchAllPages(ENDPOINTS.REQUIREMENTS, { pageSize: 100 })
      .then((reqList) => {
        if (!active) return;
        const email = user?.email?.toLowerCase?.();
        const salesOnly = (r) => r.salesOwner?.email?.toLowerCase?.() === email;
        const owned = reqList.filter(salesOnly).map((r) => {
          const numberOfPositions = Number(r.numberOfPositions) || 0;
          const closedPositions = Number(r.closedPositions) || 0;
          return {
            ...r,
            id: r.id,
            publicId: r.publicId,
            clientName: r.client?.name || '—',
            roleSkill: r.roleSkill || '—',
            status: r.status || 'ACTIVE',
            numberOfPositions,
            noOfPositions: numberOfPositions,
            closedPositions,
            isCompleted: numberOfPositions > 0 && closedPositions >= numberOfPositions,
            taHandoffSlaRag: r.taHandoffSlaRag || 'NONE',
            targetClosureDate: r.targetClosureDate || null,
          };
        });
        setTasks(owned);
      })
      .catch(() => active && setTasks([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [user]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => matchesQuery(taskSearchQ, t.clientName, t.roleSkill, t.publicId, t.id)),
    [tasks, taskSearchQ],
  );

  const taskCounts = useMemo(() => {
    const counts = Object.fromEntries(TASK_SECTIONS.map(({ status }) => [status, 0]));
    visibleTasks.forEach((t) => {
      const status = t.status || 'ACTIVE';
      if (counts[status] != null) counts[status] += 1;
      else counts.ACTIVE += 1;
    });
    return counts;
  }, [visibleTasks]);

  const activeTasks = useMemo(
    () => visibleTasks.filter((t) => (t.status || 'ACTIVE') === activeTaskStatus),
    [visibleTasks, activeTaskStatus],
  );

  const closePipeline = () => {
    setPipelineReq(null);
    setViewingCandidate(null);
  };

  if (loading) return <ScreenSkeleton cards={0} rows={8} />;

  const renderTaskCard = (task) => {
    const openCount =
      Number(task.noOfPositions) > 0
        ? Math.max(Number(task.noOfPositions) - Number(task.closedPositions || 0), 0)
        : '—';
    const status = String(task.status || 'ACTIVE').toUpperCase();

    return (
      <article
        key={task.id}
        className={`ats-card${task.isCompleted ? ' ats-card--completed' : ''}`}
      >
        <button
          type="button"
          className="ats-card-main"
          onClick={() => setPipelineReq(task)}
          aria-label={`Open pipeline for ${task.clientName} - ${task.roleSkill}`}
        >
          <div className="ats-card-top">
            <div className="ats-card-title">
              <strong>{task.clientName}</strong>
            </div>
            <span className={`ats-status ats-status--${status.toLowerCase()}`}>
              {status.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="ats-position">{task.roleSkill}</div>

          <div className="ats-card-meta">
            <span className="ats-req-id">{task.publicId || task.id}</span>
            {task.taHandoffSlaRag && task.taHandoffSlaRag !== 'NONE' && (
              <span className={`ats-rag ats-rag--${String(task.taHandoffSlaRag).toLowerCase()}`}>
                {task.taHandoffSlaRag}
              </span>
            )}
          </div>

          <div className="ats-position-summary">
            <span>
              Filled <strong>{task.closedPositions ?? 0}</strong>/{task.noOfPositions ?? '—'}
            </span>
            <span>
              Open <strong>{openCount}</strong>
            </span>
            {task.targetClosureDate && (
              <span>
                Target <strong>{formatDate(task.targetClosureDate, '—')}</strong>
              </span>
            )}
          </div>
        </button>

        <div className="ats-card-actions">
          <button
            type="button"
            className="ats-action ats-action--primary"
            onClick={() => setPipelineReq(task)}
          >
            <IconClipboardCheck />
            View pipeline
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="my-tasks-screen">
      <div className="assign-head">
        <span className="assign-badge"><IconBriefcase /></span>
        <div>
          <h2 className="assign-title">Task History</h2>
          <p className="assign-sub">
            Your requirements — open the candidate pipeline to track recruiting progress (view only).
          </p>
        </div>
        {tasks.length > 0 && <span className="yr-count">{visibleTasks.length}</span>}
      </div>

      <div className="assign-body">
        <div className="ats-list">
          <div className="ats-toolbar">
            <div className="ats-toolbar-info">
              <h3 className="ats-section-title">Requirements</h3>
              <span className="ats-total-count">{visibleTasks.length} total</span>
            </div>

            {tasks.length > 0 && (
              <div className="ats-search">
                <IconClipboardCheck />
                <input
                  type="search"
                  value={taskSearch}
                  aria-label="Search requirements"
                  placeholder="Search client, position or req ID..."
                  onChange={(e) => setTaskSearch(e.target.value)}
                />
                {taskSearch && (
                  <button
                    type="button"
                    className="ats-search-clear"
                    onClick={() => setTaskSearch('')}
                    aria-label="Clear search"
                  >
                    <IconX />
                  </button>
                )}
              </div>
            )}
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              icon={IconBriefcase}
              title="No task history"
              description="Requirements you own will appear here."
            />
          ) : (
            <>
              <div className="ats-tabs" role="tablist" aria-label="Requirement status">
                {TASK_SECTIONS.map(({ status, label }) => (
                  <button
                    key={status}
                    type="button"
                    role="tab"
                    aria-selected={activeTaskStatus === status}
                    className={`ats-tab${activeTaskStatus === status ? ' is-active' : ''}`}
                    onClick={() => setActiveTaskStatus(status)}
                  >
                    <span>{label}</span>
                    <span className="ats-tab-count">{taskCounts[status] || 0}</span>
                  </button>
                ))}
              </div>

              {visibleTasks.length === 0 ? (
                <EmptyState
                  icon={IconClipboardCheck}
                  title="No matching requirements"
                  description="Try a different search term."
                />
              ) : (
                <div className="ats-results">
                  <div className="ats-results-heading">
                    <span>
                      {TASK_SECTIONS.find((section) => section.status === activeTaskStatus)?.label
                        || 'Requirements'}
                    </span>
                    <span>{activeTasks.length} requirements</span>
                  </div>

                  {activeTasks.length > 0 ? (
                    <div className="ats-grid">
                      {activeTasks.map(renderTaskCard)}
                    </div>
                  ) : (
                    <EmptyState
                      icon={IconClipboardCheck}
                      title="No requirements in this status"
                      description="Choose another status to view requirements."
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {pipelineReq && (
        <div className="modal-overlay" onClick={closePipeline}>
          <div className="modal-card detail-modal pipeline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="pipeline-modal-heading">
                <h3>
                  {pipelineReq.clientName} — {pipelineReq.roleSkill}
                  <span className="kpi-modal-count">{pipelineReq.publicId || pipelineReq.id}</span>
                  <span className={`yr-status ${(pipelineReq.status || 'ACTIVE').toLowerCase()}`}>
                    {pipelineReq.status || 'ACTIVE'}
                  </span>
                </h3>
                <p className="pipeline-modal-sub">
                  Filled {pipelineReq.closedPositions ?? 0}/{pipelineReq.noOfPositions ?? '—'}
                  {' · '}
                  Open {
                    Number(pipelineReq.noOfPositions) > 0
                      ? Math.max(Number(pipelineReq.noOfPositions) - Number(pipelineReq.closedPositions || 0), 0)
                      : '—'
                  }
                </p>
              </div>
              <button type="button" className="modal-close" onClick={closePipeline} title="Close">
                <IconX />
              </button>
            </div>
            <div className="modal-body">
              <RequirementPipelineBoard
                requirementId={pipelineReq.id}
                requirement={pipelineReq}
                mode="readonly"
                onViewCandidate={(c) => setViewingCandidate(c)}
              />
            </div>
          </div>
        </div>
      )}

      {viewingCandidate && (
        <div className="modal-overlay" onClick={() => setViewingCandidate(null)}>
          <div className="modal-card detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Candidate — {viewingCandidate.publicId || viewingCandidate.name}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setViewingCandidate(null)}
                title="Close"
              >
                <IconX />
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-grid detail-grid-2">
                <div className="detail-item"><span className="detail-label">Name</span><span className="detail-value">{viewingCandidate.name || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Email</span><span className="detail-value">{viewingCandidate.email || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Mobile</span><span className="detail-value">{viewingCandidate.mobile || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Stage</span><span className="detail-value">{viewingCandidate.pipelineLabel || viewingCandidate.stageCode || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Offer</span><span className="detail-value">{viewingCandidate.offer?.statusCode || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Onboarding</span><span className="detail-value">{viewingCandidate.onboarding?.statusCode || '—'}</span></div>
              </div>
              <CandidateResumeSection
                candidateId={viewingCandidate.id || viewingCandidate.publicId}
                initialHasResume={viewingCandidate.hasResume}
                initialFileName={viewingCandidate.resumeFileName}
              />
            </div>
            <div className="modal-foot">
              <button type="button" className="filter-clear" onClick={() => setViewingCandidate(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
