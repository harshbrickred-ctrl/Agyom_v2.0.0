
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { get } from '../../services/apiClient';
import { ENDPOINTS } from '../../config/api';
import { IconInbox } from '../../components/Icons';
import { EmptyState, ScreenSkeleton } from '../../components/ui';
import './../pageCss/MyWorkScreen.css';

const SECTIONS = [
  { key: 'needs', title: 'Needs you', description: 'Requires your attention' },
  { key: 'waiting', title: 'Waiting', description: 'Pending responses or updates' },
  { key: 'dates', title: 'Dates', description: 'Upcoming deadlines and events' },
];

export default function MyWorkScreen() {
  const [, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('needs');

  useEffect(() => {
    let active = true;

    get(ENDPOINTS.WORK_MINE)
      .then((res) => {
        if (!active) return;
        setItems(Array.isArray(res?.items) ? res.items : []);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load work'
        );
        setItems([]);
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, []);

  const openItem = (item) => {
    const next = { tab: item.tab || 'work' };

    if (
      item.requirementId &&
      ['assign', 'your', 'lead-assign'].includes(item.tab)
    ) {
      next.req = item.requirementId;
    }

    setSearchParams(next);
  };

  if (loading) return <ScreenSkeleton rows={6} />;

  const activeSection = SECTIONS.find(
    (section) => section.key === activeTab
  );

  const activeItems = items.filter(
    (item) => item.section === activeTab
  );

  return (
    <div className="work-inbox-screen">

      {/* Header */}
      <header className="work-inbox-header">
        <div className="work-inbox-heading">
          <span className="work-inbox-icon">
            <IconInbox />
          </span>

          <div className="work-inbox-heading-content">
            <h2>My Work</h2>
            <p>Your tasks, pending actions and important dates.</p>
          </div>
        </div>

        <div className="work-inbox-total">
          <span>Total items</span>
          <strong>{items.length}</strong>
        </div>
      </header>

      {error && (
        <div className="work-inbox-error">{error}</div>
      )}

      {!error && (
        <>
          {/* Navigation tabs */}
          <div className="work-inbox-tabs" role="tablist" aria-label="My work sections">
            {SECTIONS.map((section) => {
              const count = items.filter(
                (item) => item.section === section.key
              ).length;

              return (
                <button
                  key={section.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === section.key}
                  aria-controls="work-inbox-panel"
                  className={`work-inbox-tab ${
                    activeTab === section.key ? 'is-active' : ''
                  }`}
                  onClick={() => setActiveTab(section.key)}
                >
                  <span>{section.title}</span>
                  <span className="work-inbox-tab-count">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Selected tab content */}
          <section
            id="work-inbox-panel"
            className="work-inbox-panel"
            role="tabpanel"
          >
            <div className="work-inbox-panel-header">
              <div>
                <h3>{activeSection.title}</h3>
                <p>{activeSection.description}</p>
              </div>

              <span className="work-inbox-panel-count">
                {activeItems.length} items
              </span>
            </div>

            {activeItems.length === 0 ? (
              <div className="work-inbox-empty">
                <EmptyState
                  icon={IconInbox}
                  title="You're all caught up"
                  description="Nothing in this section right now."
                />
              </div>
            ) : (
              <div className="work-inbox-list">
                {activeItems.map((item) => {
                  const severity = (
                    item.severity || 'medium'
                  ).toLowerCase();

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`work-inbox-item severity-${severity}`}
                      onClick={() => openItem(item)}
                    >
                      <span className="work-inbox-item-indicator" />

                      <span className="work-inbox-item-content">
                        <span className="work-inbox-item-type">
                          {item.kind?.replace(/_/g, ' ')}
                        </span>

                        <strong className="work-inbox-item-title">
                          {item.title}
                        </strong>

                        {item.subtitle && (
                          <span className="work-inbox-item-subtitle">
                            {item.subtitle}
                          </span>
                        )}
                      </span>

                      <span className="work-inbox-item-actions">
                        <span className={`work-inbox-priority priority-${severity}`}>
                          {item.severity || 'Medium'}
                        </span>

                        <span className="work-inbox-arrow">→</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
