import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ImagePlus, Info, MessageSquarePlus, RotateCcw, Star } from 'lucide-react';
import api, { errorMessage, fileUrl } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Alert, Async, Badge, Button, EmptyState, Field, Modal, PageHeader, Stars } from '../components/ui';
import { AiBox, Timeline } from '../components/complaint';
import { dateTime, minutesLabel, statusTone, urgencyTone } from '../utils/format';

const MAX_IMG = 3 * 1024 * 1024;

function NewComplaint({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', location: '' });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const input = useRef();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setErrors({ ...errors, image: 'Choose a JPEG, PNG or WebP image.' }); e.target.value = ''; return; }
    if (f.size > MAX_IMG) { setErrors({ ...errors, image: 'Image must be under 3 MB.' }); e.target.value = ''; return; }
    setErrors({ ...errors, image: '' }); setFile(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.title.trim().length < 3) errs.title = 'Add a short title (at least 3 characters).';
    if (form.description.trim().length < 10) errs.description = 'Please describe the issue in a little more detail (at least 10 characters).';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v.trim()));
      if (file) fd.append('image', file);
      const { data } = await api.post('/complaints', fd);
      setResult(data); onCreated(); toast.success(`Complaint ${data.complaint.ticketNo} submitted`);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  if (result) {
    const c = result.complaint;
    return (
      <Modal title={`Submitted · ${c.ticketNo}`} onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}>
        <div className="stack">
          <p>Thanks, your complaint has been recorded. You can track it from this page.</p>
          <AiBox complaint={c} />
          {result.duplicatesLinked > 0 && <Alert tone="info" icon={Info}>A similar complaint was already reported in your tower. We linked them so the team handles them together. Yours stays open and is not closed automatically.</Alert>}
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Raise a complaint" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><Button form="complaint-form" type="submit" loading={busy}>Submit complaint</Button></>}>
      <form id="complaint-form" className="stack" onSubmit={submit} noValidate>
        <Alert tone="warning">In an emergency (fire, gas leak, lift stuck, electric shock) call the security desk immediately, then raise it here.</Alert>
        {error && <Alert tone="critical">{error}</Alert>}
        <Field label="Title" htmlFor="c-title" error={errors.title}><input id="c-title" className="input" maxLength={150} value={form.title} onChange={set('title')} placeholder="e.g. Water leaking from bathroom ceiling" /></Field>
        <Field label="Description" htmlFor="c-desc" error={errors.description} hint="Say what is wrong, where, and since when. We use this to set the category and urgency."><textarea id="c-desc" className="textarea" maxLength={2000} value={form.description} onChange={set('description')} /></Field>
        <Field label="Location (optional)" htmlFor="c-loc"><input id="c-loc" className="input" maxLength={100} value={form.location} onChange={set('location')} placeholder="e.g. Tower 5 lobby, 7th floor corridor" /></Field>
        <Field label="Photo (optional)" error={errors.image} hint="JPEG, PNG or WebP, up to 3 MB.">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} className="sr-only" id="c-img" />
          <div className="row">
            <button type="button" className="btn btn-ghost" onClick={() => input.current.click()}><ImagePlus size={16} />{file ? 'Change photo' : 'Add photo'}</button>
            {file && <><span className="small muted">{file.name}</span><button type="button" className="btn btn-ghost btn-sm" onClick={() => { setFile(null); input.current.value = ''; }}>Remove</button></>}
          </div>
          {file && <img src={URL.createObjectURL(file)} alt="Selected upload preview" style={{ maxHeight: 140, borderRadius: 8, marginTop: 8, border: '1px solid var(--border)' }} />}
        </Field>
      </form>
    </Modal>
  );
}

function Detail({ id, onClose, onChanged }) {
  const state = useFetch(() => api.get(`/complaints/${id}`).then((r) => r.data), [id]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); state.reload(); onChanged(); } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title="Complaint details" onClose={onClose} wide>
      <Async state={state}>
        {({ complaint: c, history }) => (
          <div className="stack">
            <div className="row between wrap"><div><h2>{c.title}</h2><div className="muted small">{c.ticketNo} · raised {dateTime(c.createdAt)}</div></div>
              <div className="row wrap"><Badge tone={statusTone(c.status)}>{c.status}</Badge><Badge tone={urgencyTone(c.urgency)}>{c.urgency}</Badge></div></div>
            <p>{c.description}</p>
            {c.imagePath && <a href={fileUrl(c.imagePath)} target="_blank" rel="noreferrer"><img src={fileUrl(c.imagePath)} alt="Attached by you" style={{ maxHeight: 200, borderRadius: 10, border: '1px solid var(--border)' }} /></a>}
            <dl className="kv">
              <dt>Category</dt><dd>{c.category}</dd>
              <dt>Location</dt><dd>{c.location || '–'}</dd>
              <dt>Assigned to</dt><dd>{c.assignedTo ? c.assignedTo.name : <span className="muted">Not assigned yet</span>}</dd>
              {c.sla && !c.sla.responded && c.status !== 'Closed' && <><dt>First response</dt><dd><Badge tone={c.sla.breached ? 'critical' : 'info'}>{minutesLabel(c.sla.minutesRemaining)}</Badge></dd></>}
              {c.duplicateOf && <><dt>Similar to</dt><dd>{c.duplicateOf.ticketNo} · {c.duplicateOf.title}</dd></>}
            </dl>
            <AiBox complaint={c} />

            {c.rating ? <div className="row"><strong className="small">Your rating</strong><Stars value={c.rating} /></div>
              : ['Resolved', 'Closed'].includes(c.status) && (
                <div className="card card-pad stack" style={{ gap: 10 }}>
                  <strong>How did we do?</strong>
                  <div className="row" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => <button key={n} className="icon-btn" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}><Star size={22} fill={n <= rating ? 'var(--warning)' : 'none'} color="var(--warning)" /></button>)}</div>
                  <input className="input" placeholder="Optional comment" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
                  <div className="row"><Button variant="teal" size="sm" disabled={!rating} loading={busy} onClick={() => act(() => api.post(`/complaints/${c._id}/rating`, { rating, comment }), 'Thanks for your feedback')}>Submit rating</Button>
                    {c.status === 'Resolved' && <Button variant="ghost" size="sm" loading={busy} onClick={() => act(() => api.post(`/complaints/${c._id}/reopen`, {}), 'Complaint reopened')}><RotateCcw size={13} />Not fixed? Reopen</Button>}</div>
                </div>
              )}
            <div><h3 style={{ marginBottom: 12 }}>History</h3><Timeline history={history} /></div>
          </div>
        )}
      </Async>
    </Modal>
  );
}

export default function Complaints() {
  const [params, setParams] = useSearchParams();
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [openId, setOpenId] = useState(null);
  const state = useFetch(() => api.get('/complaints/mine').then((r) => r.data.complaints), []);
  const closeNew = () => { setShowNew(false); if (params.get('new')) { params.delete('new'); setParams(params, { replace: true }); } };

  return (
    <>
      <PageHeader title="My complaints" subtitle="Raise an issue and follow it until it is resolved." actions={<button className="btn btn-teal btn-lg" onClick={() => setShowNew(true)}><MessageSquarePlus size={18} />Raise complaint</button>} />
      <div className="card">
        <Async state={state}>
          {(list) => list.length === 0 ? <EmptyState icon={MessageSquarePlus} title="No complaints yet" text="When you raise a complaint, you can track its status and history here." action={<button className="btn btn-teal" onClick={() => setShowNew(true)}>Raise your first complaint</button>} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Ticket</th><th>Issue</th><th>Category</th><th>Urgency</th><th>Status</th><th>Assigned to</th><th>Raised</th></tr></thead>
              <tbody>{list.map((c) => (
                <tr key={c._id} className="clickable" onClick={() => setOpenId(c._id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpenId(c._id)}>
                  <td className="mono small">{c.ticketNo}</td><td><strong>{c.title}</strong>{c.duplicateOf && <div className="muted small">Similar to {c.duplicateOf.ticketNo}</div>}</td>
                  <td>{c.category}</td><td><Badge tone={urgencyTone(c.urgency)}>{c.urgency}</Badge></td><td><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                  <td>{c.assignedTo?.name || <span className="muted">Unassigned</span>}</td><td className="small">{dateTime(c.createdAt)}</td>
                </tr>))}</tbody>
            </table></div>
          )}
        </Async>
      </div>
      {showNew && <NewComplaint onClose={closeNew} onCreated={state.reload} />}
      {openId && <Detail id={openId} onClose={() => setOpenId(null)} onChanged={state.reload} />}
    </>
  );
}
