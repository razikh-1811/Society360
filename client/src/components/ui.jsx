import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';
import './ui.css';

export const Spinner = () => <span className="spinner" aria-hidden="true" />;

export const PageLoader = ({ label = 'Loading…' }) => (
  <div className="page-loader" role="status" aria-live="polite"><Spinner /><span className="sr-only">{label}</span></div>
);

export const SkeletonRows = ({ rows = 4 }) => (
  <div className="state-skel" role="status" aria-label="Loading">
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton" style={{ height: 18, width: `${90 - i * 9}%` }} />)}
  </div>
);

export const EmptyState = ({ icon: Icon = Inbox, title, text, action }) => (
  <div className="state">
    <div className="state-icon"><Icon size={22} /></div>
    <h3>{title}</h3>
    {text && <p style={{ maxWidth: 380 }}>{text}</p>}
    {action}
  </div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="state error" role="alert">
    <div className="state-icon"><AlertTriangle size={22} /></div>
    <h3>Could not load this</h3>
    <p>{message}</p>
    {onRetry && <button className="btn btn-ghost" onClick={onRetry}>Try again</button>}
  </div>
);

// Renders loading / error / empty states around data.
export function Async({ state, empty, children, skeleton = <SkeletonRows /> }) {
  if (state.loading) return skeleton;
  if (state.error) return <ErrorState message={state.error} onRetry={state.retry} />;
  if (empty && empty(state.data)) return empty.render;
  return children(state.data);
}

export const Badge = ({ tone = 'neutral', children, ...p }) => <span className={`badge badge-${tone}`} {...p}>{children}</span>;

export const StatCard = ({ label, value, sub, icon: Icon, tone }) => (
  <div className={`card stat ${tone ? `tone-${tone}` : ''}`}>
    <div className="stat-label">{Icon && <span className="stat-icon"><Icon size={16} /></span>}{label}</div>
    <div className="stat-value">{value}</div>
    {sub && <div className="stat-sub">{sub}</div>}
  </div>
);

export const PageHeader = ({ title, subtitle, actions }) => (
  <div className="page-header">
    <div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {actions && <div className="row wrap">{actions}</div>}
  </div>
);

export const Alert = ({ tone = 'info', icon: Icon, children }) => (
  <div className={`alert alert-${tone}`} role={tone === 'critical' ? 'alert' : 'status'}>{Icon && <Icon size={16} />}<div>{children}</div></div>
);

export const Button = ({ loading, children, variant = 'primary', size, className = '', ...p }) => (
  <button className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} disabled={loading || p.disabled} {...p}>
    {loading && <Loader2 size={16} className="spinner-icon" style={{ animation: 'spin 0.8s linear infinite' }} />}{children}
  </button>
);

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export const Tabs = ({ tabs, value, onChange }) => (
  <div className="tabs" role="tablist">
    {tabs.map((t) => (
      <button key={t.key} role="tab" aria-selected={value === t.key} className={`tab ${value === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
        {t.label}{t.count != null && <span className="badge badge-neutral count">{t.count}</span>}
      </button>
    ))}
  </div>
);

export const Field = ({ label, hint, error, children, htmlFor }) => (
  <div className="field">
    {label && <label htmlFor={htmlFor}>{label}</label>}
    {children}
    {hint && !error && <span className="hint">{hint}</span>}
    {error && <span className="error-text" role="alert">{error}</span>}
  </div>
);

export const Stars = ({ value }) => <span className="stars" aria-label={`${value} out of 5`}>{'★'.repeat(value)}<span style={{ color: '#d5dbe6' }}>{'★'.repeat(5 - value)}</span></span>;
