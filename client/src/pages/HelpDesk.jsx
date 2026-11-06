import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertOctagon, CheckCircle2, Clock, Inbox, ListChecks, Loader, ShieldAlert, Siren } from 'lucide-react';
import api, { errorMessage, fileUrl } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Alert, Async, Badge, Button, EmptyState, Field, Modal, PageHeader, StatCard } from '../components/ui';
import { AiBox, CATEGORIES, Timeline, URGENCIES } from '../components/complaint';
import { dateTime, minutesLabel, num, statusTone, urgencyTone } from '../utils/format';

const NEXT = { New: ['Assigned', 'In Progress', 'Resolved', 'Closed'], Assigned: ['In Progress', 'Resolved', 'Closed', 'New'], 'In Progress': ['Assigned', 'Resolved', 'Closed'], Resolved: ['Closed', 'Reopened', 'In Progress'], Reopened: ['Assigned', 'In Progress', 'Resolved', 'Closed'], Closed: ['Reopened'] };
const STATUS_FILTERS = ['New', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Reopened'];

function Manage({ id, staff, onClose, onChanged }) {
  const state = useFetch(() => api.get(`/complaints/${id}`).then((r) => r.data), [id]);
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const act = async (key, fn, ok) => {
    setBusy(key);
    try { await fn(); toast.success(ok); state.reload(); onChanged(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(''); }
  };
  const patch = (path, body) => api.patch(`/complaints/${id}/${path}`, body);

  return (
    <Modal title="Manage complaint" onClose={onClose} wide>
      <Async state={state}>
        {({ complaint: c, history }) => {
          const locked = c.emergencyKeywords?.length > 0;
          return (
            <div className="stack">
              <div className="row between wrap">
                <div><h2>{c.title}</h2><div className="muted small">{c.ticketNo} · Flat {c.flat?.flatNumber} · {c.raisedBy?.name} · {dateTime(c.createdAt)}</div></div>
                <div className="row wrap"><Badge tone={statusTone(c.status)}>{c.status}</Badge><Badge tone={urgencyTone(c.urgency)}>{c.urgency}</Badge>
                  {c.sla && !c.sla.responded && c.status !== 'Closed' && <Badge tone={c.sla.breached ? 'critical' : 'info'}><Clock size={11} />{minutesLabel(c.sla.minutesRemaining)}</Badge>}</div>
              </div>
              <p>{c.description}</p>
              {c.location && <p className="muted small">Location: {c.location}</p>}
              {c.imagePath && <a href={fileUrl(c.imagePath)} target="_blank" rel="noreferrer"><img src={fileUrl(c.imagePath)} alt="Attached by resident" style={{ maxHeight: 180, borderRadius: 10, border: '1px solid var(--border)' }} /></a>}
              {(c.duplicateOf || c.relatedComplaints?.length > 0) && (
                <Alert tone="info">Possible duplicates (linked, not closed): {[c.duplicateOf, ...(c.relatedComplaints || [])].filter(Boolean).filter((x, i, a) => a.findIndex((y) => y._id === x._id) === i).map((x) => `${x.ticketNo} (${x.status})`).join(', ')}</Alert>
              )}
              <AiBox complaint={c} />

              <div className="card card-pad stack">
                <h3>Actions</h3>
                <div className="grid cols-3">
                  <Field label="Assign to" htmlFor="as">
                    <div className="row"><select id="as" className="select" value={assignee || c.assignedTo?._id || ''} onChange={(e) => setAssignee(e.target.value)}><option value="" disabled>Select staff…</option>{staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select>
                      <Button size="sm" loading={busy === 'assign'} disabled={!assignee || assignee === c.assignedTo?._id} onClick={() => act('assign', () => patch('assign', { assignedTo: assignee, note }), 'Assigned')}>Assign</Button></div>
                  </Field>
                  <Field label="Category" htmlFor="cat" hint={c.ai?.needsManualReview ? 'AI flagged this for review' : undefined}>
                    <select id="cat" className="select" value={c.category} disabled={busy === 'cat'} onChange={(e) => act('cat', () => patch('category', { category: e.target.value }), 'Category updated')}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select>
                  </Field>
                  <Field label="Priority" htmlFor="urg" hint={locked ? 'Emergency: locked at Critical' : undefined}>
                    <select id="urg" className="select" value={c.urgency} disabled={locked || busy === 'urg'} onChange={(e) => act('urg', () => patch('urgency', { urgency: e.target.value }), 'Priority updated')}>{URGENCIES.map((x) => <option key={x}>{x}</option>)}</select>
                  </Field>
                </div>
                <Field label="Note (optional, saved with the next assignment or status change)" htmlFor="note"><input id="note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Plumber visiting between 3 and 5 PM" /></Field>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Update status</div>
                  <div className="row wrap">
                    {(NEXT[c.status] || []).map((s) => (
                      <Button key={s} size="sm" variant={s === 'Closed' ? 'danger' : s === 'Resolved' ? 'teal' : 'ghost'} loading={busy === s}
                        onClick={() => act(s, async () => { await patch('status', { status: s, note }); setNote(''); }, s === 'Closed' ? 'Complaint closed' : `Marked ${s}`)}>
                        {s === 'Closed' ? 'Close complaint' : s}
                      </Button>))}
                  </div>
                </div>
              </div>
              <div><h3 style={{ marginBottom: 12 }}>History</h3><Timeline history={history} /></div>
            </div>
          );
        }}
      </Async>
    </Modal>
  );
}

export default function HelpDesk() {
  const [filters, setFilters] = useState({ status: '', urgency: '', category: '', assignedTo: '', q: '' });
  const [openId, setOpenId] = useState(null);
  const dash = useFetch(() => api.get('/dashboard/helpdesk').then((r) => r.data), []);
  const staff = useFetch(() => api.get('/complaints/assignees').then((r) => r.data.staff), []);
  const list = useFetch(() => api.get('/complaints', { params: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) }).then((r) => r.data.complaints), [filters.status, filters.urgency, filters.category, filters.assignedTo, filters.q]);
  const refresh = () => { dash.reload(); list.reload(); };
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Help desk" subtitle="Triage, assign and resolve resident complaints." />
      <Async state={dash}>
        {(d) => (
          <>
            <div className="grid cols-6">
              <StatCard icon={ListChecks} label="Total complaints" value={num(d.totals.total)} />
              <StatCard icon={Inbox} tone="teal" label="New" value={num(d.totals.new)} sub={`${d.totals.assigned} assigned`} />
              <StatCard icon={Loader} tone="warning" label="In progress" value={num(d.totals.inProgress)} sub={d.totals.reopened ? `${d.totals.reopened} reopened` : undefined} />
              <StatCard icon={Siren} tone={d.totals.critical ? 'critical' : undefined} label="Critical (open)" value={num(d.totals.critical)} />
              <StatCard icon={CheckCircle2} tone="success" label="Resolved" value={num(d.totals.resolved)} />
              <StatCard icon={AlertOctagon} tone={d.totals.slaBreached ? 'critical' : undefined} label="Response overdue" value={num(d.totals.slaBreached)} sub={d.totals.needsReview ? `${d.totals.needsReview} need AI review` : undefined} />
            </div>

            <div className="grid cols-3 section">
              <div className="card"><div className="card-head"><h2>Assignment queue</h2><Badge tone="info">{d.assignmentQueue.length}</Badge></div>
                {d.assignmentQueue.length === 0 ? <EmptyState icon={CheckCircle2} title="Queue is clear" text="Every open complaint has an owner." /> : <div style={{ padding: '4px 20px' }}>{d.assignmentQueue.map((c) => (
                  <div key={c._id} className="list-item"><div className="grow"><button className="btn-link" style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, color: 'var(--navy)' }} onClick={() => setOpenId(c._id)}>{c.title}</button><div className="muted small">{c.ticketNo} · {c.flat?.flatNumber} · {c.category}</div></div><Badge tone={urgencyTone(c.urgency)}>{c.urgency}</Badge></div>))}</div>}
              </div>
              <div className="card"><div className="card-head"><h2>Response timers</h2><Badge tone="neutral">first response</Badge></div>
                {d.responseTimers.length === 0 ? <EmptyState icon={Clock} title="No pending responses" /> : <div style={{ padding: '4px 20px' }}>{d.responseTimers.map((c) => (
                  <div key={c._id} className="list-item"><div className="grow"><button style={{ all: 'unset', cursor: 'pointer', fontWeight: 600, color: 'var(--navy)' }} onClick={() => setOpenId(c._id)}>{c.title}</button><div className="muted small">{c.ticketNo} · target {c.sla.targetMinutes} min</div></div><Badge tone={c.sla.breached ? 'critical' : 'info'}>{minutesLabel(c.sla.minutesRemaining)}</Badge></div>))}</div>}
              </div>
              <div className="card"><div className="card-head"><h2>Recent activity</h2></div>
                {d.recentActivity.length === 0 ? <EmptyState title="No activity yet" /> : <div style={{ padding: '4px 20px' }}>{d.recentActivity.map((h) => (
                  <div key={h._id} className="list-item" style={{ display: 'block' }}><div className="small"><strong>{h.complaint?.ticketNo}</strong> · {h.action.replace('_', ' ')}{h.toValue ? ` → ${h.toValue}` : ''}</div><div className="muted small">{dateTime(h.createdAt)} · {h.changedBy?.name || 'System'}</div></div>))}</div>}
              </div>
            </div>
          </>
        )}
      </Async>

      <div className="card section">
        <div className="card-head"><h2>All complaints</h2></div>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div className="filters">
            <Field label="Search" htmlFor="f-q"><input id="f-q" className="input" placeholder="Title, ticket…" value={filters.q} onChange={set('q')} /></Field>
            <Field label="Status" htmlFor="f-s"><select id="f-s" className="select" value={filters.status} onChange={set('status')}><option value="">All</option><option value="open">Open (any)</option>{STATUS_FILTERS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Priority" htmlFor="f-u"><select id="f-u" className="select" value={filters.urgency} onChange={set('urgency')}><option value="">All</option>{URGENCIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Category" htmlFor="f-c"><select id="f-c" className="select" value={filters.category} onChange={set('category')}><option value="">All</option>{CATEGORIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Assigned to" htmlFor="f-a"><select id="f-a" className="select" value={filters.assignedTo} onChange={set('assignedTo')}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{(staff.data || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></Field>
            {Object.values(filters).some(Boolean) && <button className="btn btn-ghost" onClick={() => setFilters({ status: '', urgency: '', category: '', assignedTo: '', q: '' })}>Clear</button>}
          </div>
        </div>
        <Async state={list}>
          {(rows) => rows.length === 0 ? <EmptyState icon={Inbox} title="No complaints match" text="Try clearing some filters." /> : (
            <div className="table-wrap" style={{ marginTop: 16 }}><table className="table" style={{ minWidth: 860 }}>
              <thead><tr><th>Ticket</th><th>Issue</th><th>Flat</th><th>Category</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Response</th><th /></tr></thead>
              <tbody>{rows.map((c) => (
                <tr key={c._id} className="clickable" onClick={() => setOpenId(c._id)}>
                  <td className="mono small">{c.ticketNo}</td>
                  <td><strong>{c.title}</strong><div className="row wrap" style={{ gap: 4, marginTop: 2 }}>{c.escalatedToDutyManager && <Badge tone="critical"><ShieldAlert size={11} />Emergency</Badge>}{c.ai?.needsManualReview && <Badge tone="warning">AI review</Badge>}{c.duplicateOf && <Badge tone="info">Duplicate?</Badge>}</div></td>
                  <td>{c.flat?.flatNumber}</td><td>{c.category}</td><td><Badge tone={urgencyTone(c.urgency)}>{c.urgency}</Badge></td><td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td>{c.assignedTo?.name || <span className="muted">Unassigned</span>}</td>
                  <td>{c.sla.responded ? <span className="muted small">{c.sla.breached ? 'Late' : 'On time'}</span> : c.status === 'Closed' ? '–' : <Badge tone={c.sla.breached ? 'critical' : 'info'}>{minutesLabel(c.sla.minutesRemaining)}</Badge>}</td>
                  <td className="right"><button className="btn btn-ghost btn-sm">Manage</button></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Async>
      </div>
      {openId && <Manage id={openId} staff={staff.data || []} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </>
  );
}
