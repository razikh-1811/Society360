const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (n) => (n == null ? '–' : Number.isInteger(n) ? inr.format(n) : inr2.format(n));
export const num = (n) => new Intl.NumberFormat('en-IN').format(n ?? 0);
export const date = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–');
export const dateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–');
export const periodLabel = (p) => (p ? new Date(`${p}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : '–');

export function minutesLabel(m) {
  if (m == null) return '–';
  const abs = Math.abs(m);
  const t = abs >= 1440 ? `${Math.round(abs / 1440)}d` : abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs}m`;
  return m < 0 ? `${t} overdue` : `${t} left`;
}

export const urgencyTone = (u) => ({ Critical: 'critical', High: 'warning', Medium: 'info', Low: 'neutral' }[u] || 'neutral');
export const statusTone = (s) => ({ New: 'info', Assigned: 'teal', 'In Progress': 'warning', Resolved: 'success', Closed: 'neutral', Reopened: 'critical' }[s] || 'neutral');
export const billTone = (s) => ({ paid: 'success', partial: 'warning', unpaid: 'critical' }[s] || 'neutral');
export const txnTone = (s) => ({ matched: 'success', manual_review: 'warning', unmatched: 'critical', duplicate: 'neutral', rejected: 'neutral' }[s] || 'neutral');
export const txnLabel = (s) => ({ matched: 'Matched', manual_review: 'Manual review', unmatched: 'Unmatched', duplicate: 'Duplicate', rejected: 'Rejected' }[s] || s);
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
