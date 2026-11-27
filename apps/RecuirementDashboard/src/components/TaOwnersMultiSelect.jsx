import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/** Compact multi-select dropdown for assigning TAs / TA Leads to a requirement. */
export default function TaOwnersMultiSelect({
  options = [],
  value = [],
  onChange,
  disabled = false,
  idPrefix = 'ta-owner',
  placeholder = 'Select TA owners…',
  emptyMessage = 'No TA users found. Create a TA user from Admin first.',
  ariaLabel = 'TA owners',
}) {
  const selected = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight || 220;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < Math.min(panelHeight, 160) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(220, openUp ? spaceAbove : spaceBelow));
    const top = openUp
      ? Math.max(8, rect.top - maxHeight - 4)
      : rect.bottom + 4;

    setPanelStyle({
      position: 'fixed',
      top,
      left: rect.left,
      width: rect.width,
      maxHeight,
      zIndex: 10050,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }
    updatePanelPosition();
    const onReposition = () => updatePanelPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, options.length, updatePanelPosition]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const labelById = useMemo(() => {
    const map = new Map();
    for (const o of options) {
      const label = o.fullName || o.name || o.email;
      if (label) map.set(o.id, label);
    }
    return map;
  }, [options]);

  const summary = useMemo(() => {
    if (!selected.length) return placeholder;
    const names = selected.map((id) => {
      const fromOptions = labelById.get(id);
      if (fromOptions) return fromOptions;
      // Never surface raw UUIDs/keys in the trigger summary.
      if (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) return 'Unknown user';
      return id || 'Unknown user';
    });
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  }, [selected, labelById, placeholder]);

  const toggle = (id) => {
    if (disabled) return;
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  if (!options.length) {
    return (
      <div className="ta-multi-empty">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`ta-multi-dropdown${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="ta-multi-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`ta-multi-summary${selected.length ? '' : ' is-placeholder'}`}>
          {summary}
        </span>
        <span className="ta-multi-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="ta-multi-panel ta-multi-panel--fixed"
          role="listbox"
          aria-multiselectable="true"
          aria-label={ariaLabel}
          style={panelStyle || undefined}
        >
          {options.map((o) => {
            const id = o.id;
            const label = o.fullName || o.name || o.email || (typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? 'Unknown user' : id);
            const checked = selected.includes(id);
            const inputId = `${idPrefix}-${id}`;
            return (
              <label
                key={id}
                className={`ta-multi-option${checked ? ' is-selected' : ''}`}
                htmlFor={inputId}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(id)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function formatTaOwnerNames(requirement) {
  if (Array.isArray(requirement?.taOwners) && requirement.taOwners.length) {
    return requirement.taOwners.map((t) => t.fullName || t.name || t.email).filter(Boolean).join(', ');
  }
  return requirement?.taOwner?.fullName || requirement?.taOwner?.name || '—';
}

export function formatTaLeadNames(requirement) {
  if (Array.isArray(requirement?.taLeads) && requirement.taLeads.length) {
    return requirement.taLeads.map((t) => t.fullName || t.name || t.email).filter(Boolean).join(', ');
  }
  return '—';
}
