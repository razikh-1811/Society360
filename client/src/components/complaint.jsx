import { AlertTriangle, Bot, ShieldAlert } from 'lucide-react';
import { Alert, Badge } from './ui';
import { dateTime } from '../utils/format';

export const CATEGORIES = ['Plumbing', 'Electrical', 'Lift', 'Security', 'Cleaning', 'Other'];
export const URGENCIES = ['Low', 'Medium', 'High', 'Critical'];

const SOURCE = { gemini: 'AI (Gemini)', safety_rule: 'Safety rule', fallback: 'Fallback (AI unavailable)', manual: 'Set by help desk' };

// Shows how a complaint was classified, including emergency and fallback notices.
export function AiBox({ complaint: c }) {
  const emergency = c.emergencyKeywords?.length > 0;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {emergency && (
        <Alert tone="critical" icon={ShieldAlert}>
          <strong>Emergency detected: {c.emergencyKeywords.join(', ')}.</strong> Marked Critical and escalated to the duty manager{c.assignedTo?.isDutyManager ? ` (${c.assignedTo.name})` : ''}. If anyone is in danger, also call the security desk now.
        </Alert>
      )}
      {c.ai?.source === 'fallback' && (
        <Alert tone="warning" icon={AlertTriangle}>Automatic classification was unavailable, so this was filed under <strong>Other</strong>. The help desk will review and set the right category.</Alert>
      )}
      <div className="card card-pad" style={{ background: '#fafbfd' }}>
        <div className="row between" style={{ marginBottom: 8 }}><span className="row" style={{ gap: 6 }}><Bot size={16} color="var(--teal)" /><strong className="small">Classification</strong></span><Badge tone="neutral">{SOURCE[c.ai?.source] || '–'}</Badge></div>
        <div className="row wrap"><Badge tone="teal">{c.category}</Badge><Badge tone={{ Critical: 'critical', High: 'warning', Medium: 'info', Low: 'neutral' }[c.urgency]}>{c.urgency} urgency</Badge>
          {c.ai?.confidence != null && <Badge tone="neutral">Confidence {Math.round(c.ai.confidence * 100)}%</Badge>}
          {c.ai?.needsManualReview && <Badge tone="warning">Needs manual review</Badge>}</div>
        {c.ai?.reasoning && c.ai?.source !== 'fallback' && <p className="muted small" style={{ marginTop: 8 }}>{c.ai.reasoning}</p>}
      </div>
    </div>
  );
}

const describe = (h) => {
  switch (h.action) {
    case 'created': return 'Complaint raised';
    case 'status_change': return `Status: ${h.fromValue} → ${h.toValue}`;
    case 'assigned': return `Assigned to ${h.toValue}`;
    case 'category_change': return `Category: ${h.fromValue} → ${h.toValue}`;
    case 'urgency_change': return `Priority: ${h.fromValue} → ${h.toValue}`;
    case 'escalated': return 'Escalated to duty manager';
    case 'linked_duplicate': return `Linked to similar complaint ${h.toValue}`;
    case 'rated': return `Rated ${h.toValue} / 5`;
    default: return h.action;
  }
};

export const Timeline = ({ history }) => (
  <ul className="timeline">
    {history.map((h) => (
      <li key={h._id}>
        <div className="small"><strong>{describe(h)}</strong></div>
        <div className="muted small">{dateTime(h.createdAt)} · {h.changedBy?.name || 'System'}{h.note ? ` · ${h.note}` : ''}</div>
      </li>
    ))}
  </ul>
);
