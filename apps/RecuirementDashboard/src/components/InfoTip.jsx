import { useId } from 'react';

export default function InfoTip({ text, inline = false, label = 'How this is calculated' }) {
  const id = useId();
  return (
    <button
      type="button"
      className={inline ? 'kpi-info kpi-info--inline' : 'kpi-info'}
      aria-label={label}
      aria-describedby={id}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span aria-hidden="true">i</span>
      <span id={id} className="kpi-info-tip" role="tooltip">{text}</span>
    </button>
  );
}
