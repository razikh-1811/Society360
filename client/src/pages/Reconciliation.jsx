import { useEffect, useRef, useState } from 'react';
import Papa from 'papaparse';
import toast from 'react-hot-toast';
import { CheckCircle2, CircleHelp, Copy, Download, FileSpreadsheet, Landmark, Search, UploadCloud, XCircle } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import useFetch from '../hooks/useFetch';
import { Alert, Async, Badge, Button, EmptyState, Modal, PageHeader, StatCard, Tabs } from '../components/ui';
import { date, dateTime, money, num, periodLabel, txnLabel, txnTone } from '../utils/format';

const MAX_BYTES = 2 * 1024 * 1024;

function UploadCard({ onDone }) {
  const input = useRef();
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const choose = (e) => {
    const file = e.target.files[0];
    setError(''); setParsed(null);
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setError('Please choose a .csv file.');
    if (file.size > MAX_BYTES) return setError('The file is larger than 2 MB.');
    Papa.parse(file, {
      header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim(),
      complete: (res) => {
        if (!res.data.length) return setError('The CSV has no data rows.');
        if (res.data.length > 5000) return setError('Maximum 5,000 rows per upload.');
        setParsed({ filename: file.name, rows: res.data, columns: res.meta.fields || [] });
      },
      error: () => setError('Could not read this file as CSV.'),
    });
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/reconciliation/upload', { filename: parsed.filename, rows: parsed.rows });
      toast.success('Statement processed');
      setParsed(null); input.current.value = '';
      onDone(data);
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <div className="card card-pad stack">
      <div className="row between wrap">
        <div><h2>Upload bank statement</h2><p className="muted small">CSV with Txn ID, Date, Description, Amount, Type, UPI ID and Reference columns.</p></div>
        <a className="btn btn-ghost" href="/sample-bank-statement.csv" download="sample-bank-statement.csv"><Download size={16} />Sample CSV</a>
      </div>
      <input ref={input} id="csv" className="sr-only" type="file" accept=".csv,text/csv" onChange={choose} />
      <label htmlFor="csv" className="btn btn-ghost btn-lg" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}><UploadCloud size={18} />Choose CSV file</label>
      {error && <Alert tone="critical">{error}</Alert>}
      {parsed && (
        <div className="stack" style={{ gap: 10 }}>
          <Alert tone="info" icon={FileSpreadsheet}><strong>{parsed.filename}</strong> · {num(parsed.rows.length)} rows read · columns: {parsed.columns.join(', ')}</Alert>
          <div className="row"><Button variant="teal" loading={busy} onClick={submit}>Match transactions</Button><button className="btn btn-ghost" disabled={busy} onClick={() => { setParsed(null); input.current.value = ''; }}>Cancel</button></div>
          <p className="hint">Nothing is posted until matching rules are satisfied. Ambiguous items go to the review queue.</p>
        </div>
      )}
    </div>
  );
}

function ReviewModal({ txn, onClose, onDone }) {
  const [q, setQ] = useState('');
  const [flats, setFlats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [choice, setChoice] = useState(null); // { flatId, billId }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const search = async (terms) => {
    setLoading(true);
    try {
      const results = await Promise.all(terms.map((t) => api.get('/reconciliation/search-flats', { params: { q: t } }).then((r) => r.data.flats)));
      const seen = new Map();
      results.flat().forEach((f) => seen.set(f.id, f));
      setFlats([...seen.values()]);
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  };
  useEffect(() => { const c = (txn.candidateFlats || []).map((f) => f.flatNumber); if (c.length) search(c); }, []); // eslint-disable-line

  const resolve = async (body) => {
    setBusy(true); setError('');
    try { await api.post(`/reconciliation/transactions/${txn._id}/resolve`, body); toast.success(body.action === 'approve' ? 'Payment posted' : 'Transaction rejected'); onDone(); onClose(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  return (
    <Modal title="Review transaction" onClose={onClose} wide
      footer={<>
        <Button variant="danger" disabled={busy} onClick={() => window.confirm('Reject this transaction? It will not be posted to any flat.') && resolve({ action: 'reject' })}><XCircle size={16} />Reject</Button>
        <Button variant="teal" loading={busy} disabled={!choice} onClick={() => resolve({ action: 'approve', flatId: choice.flatId, billId: choice.billId })}><CheckCircle2 size={16} />Approve &amp; post payment</Button>
      </>}>
      <div className="stack">
        <dl className="kv">
          <dt>Transaction</dt><dd className="mono">{txn.txnId}</dd><dt>Date</dt><dd>{date(txn.date)}</dd><dt>Amount</dt><dd><strong>{money(txn.amount)}</strong></dd>
          <dt>UPI ID</dt><dd className="mono">{txn.upiId || '–'}</dd><dt>Reference</dt><dd className="mono">{txn.reference || '–'}</dd><dt>Narration</dt><dd>{txn.description || '–'}</dd>
        </dl>
        <Alert tone="warning" icon={CircleHelp}><strong>Why it needs review:</strong> {txn.matchReason}</Alert>
        {error && <Alert tone="critical">{error}</Alert>}
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) search([q.trim()]); }}>
          <input className="input" placeholder="Search flat number, e.g. T12-0408" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search flats" />
          <button className="btn btn-ghost" type="submit"><Search size={16} />Search</button>
        </form>
        {loading ? <div className="muted small">Searching…</div> : flats.length === 0 ? <p className="muted small">No flats to show. Search by flat number to pick one.</p> : (
          <div className="stack" style={{ gap: 10 }} role="radiogroup" aria-label="Choose flat and bill">
            {flats.map((f) => (
              <div key={f.id} className="card card-pad">
                <strong>{f.flatNumber}</strong> <span className="muted small">· {f.ownerName}</span>
                {f.openBills.length === 0 ? <div className="muted small">No open bills</div> : f.openBills.map((b) => {
                  const fits = b.balance >= txn.amount - 0.005;
                  const exact = Math.abs(b.balance - txn.amount) < 0.005;
                  return (
                    <label key={b.id} className="row" style={{ padding: '6px 0', opacity: fits ? 1 : 0.5, minHeight: 40 }}>
                      <input type="radio" name="bill" disabled={!fits} checked={choice?.billId === b.id} onChange={() => setChoice({ flatId: f.id, billId: b.id })} />
                      <span className="small">{periodLabel(b.period)} · balance {money(b.balance)}</span>
                      {exact && <Badge tone="success">Exact amount</Badge>}{!fits && <Badge tone="neutral">Amount exceeds balance</Badge>}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function TxnTable({ rows, onReview }) {
  if (rows.length === 0) return <EmptyState icon={Landmark} title="Nothing here" text="No transactions in this view." />;
  return (
    <div className="table-wrap"><table className="table" style={{ minWidth: 900 }}>
      <thead><tr><th>Transaction ID</th><th>Date</th><th className="num">Amount</th><th>UPI ID</th><th>Reference</th><th>Matched flat</th><th>Status</th><th /></tr></thead>
      <tbody>{rows.map((t) => (
        <tr key={t._id}>
          <td className="mono small">{t.txnId}</td><td>{date(t.date)}</td><td className="num"><strong>{money(t.amount)}</strong></td>
          <td className="mono small">{t.upiId || '–'}</td><td className="mono small">{t.reference || '–'}</td>
          <td>{t.matchedFlat ? <strong>{t.matchedFlat.flatNumber}</strong> : t.candidateFlats?.length ? <span className="muted small">Candidates: {t.candidateFlats.map((f) => f.flatNumber).join(', ')}</span> : <span className="muted">–</span>}</td>
          <td><Badge tone={txnTone(t.status)}>{txnLabel(t.status)}</Badge><div className="muted small" style={{ maxWidth: 260, whiteSpace: 'normal' }}>{t.matchReason}</div></td>
          <td className="right">{['manual_review', 'unmatched'].includes(t.status) ? <button className="btn btn-teal btn-sm" onClick={() => onReview(t)}>Review</button> : t.payment ? <span className="muted small mono">{t.payment.receiptNo}</span> : null}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

export default function Reconciliation() {
  const [tab, setTab] = useState('review');
  const [last, setLast] = useState(null);
  const [batchFilter, setBatchFilter] = useState(null);
  const [reviewing, setReviewing] = useState(null);

  const txns = useFetch(() => api.get('/reconciliation/transactions').then((r) => r.data), []);
  const batches = useFetch(() => api.get('/reconciliation/batches').then((r) => r.data.batches), []);
  const refresh = () => { txns.reload(); batches.reload(); };

  const onUploaded = (data) => { setLast(data.batch); setTab(data.batch.counts.manualReview + data.batch.counts.unmatched ? 'review' : 'matched'); setBatchFilter(null); refresh(); };

  const all = txns.data?.transactions || [];
  const sum = txns.data?.summary || {};
  const inBatch = (t) => !batchFilter || t.batchId === batchFilter.batchId;
  const views = {
    review: all.filter((t) => ['manual_review', 'unmatched'].includes(t.status)),
    matched: all.filter((t) => t.status === 'matched'),
    all: all.filter(inBatch),
  };
  const queueCount = (sum.manual_review || 0) + (sum.unmatched || 0);
  const dupTotal = (batches.data || []).reduce((s, b) => s + b.counts.duplicates, 0);

  return (
    <>
      <PageHeader title="Bank reconciliation" subtitle="Match bank credits to flats. Only exact, unambiguous matches post automatically." />
      <UploadCard onDone={onUploaded} />

      {last && (
        <div className="section stack">
          <Alert tone="success" icon={CheckCircle2}>Processed <strong>{last.filename}</strong>: {last.counts.rows} rows, {last.counts.matched} matched and posted, {last.counts.manualReview + last.counts.unmatched} waiting for review, {last.counts.duplicates} duplicates ignored.</Alert>
          {(last.duplicates.length > 0 || last.invalidRows.length > 0) && (
            <div className="grid cols-2">
              {last.duplicates.length > 0 && <div className="card card-pad"><div className="row" style={{ marginBottom: 8 }}><Copy size={16} /><h3>Duplicates detected, not processed again</h3></div>{last.duplicates.map((d, i) => <div key={i} className="list-item small"><span className="mono">{d.txnId} · {money(d.amount)}</span><span className="muted">{d.reason}</span></div>)}</div>}
              {last.invalidRows.length > 0 && <div className="card card-pad"><h3 style={{ marginBottom: 8 }}>Rows that could not be read</h3>{last.invalidRows.map((r, i) => <div key={i} className="list-item small"><span>CSV row {r.row}</span><span className="muted">{r.reason}</span></div>)}</div>}
            </div>
          )}
        </div>
      )}

      <div className="grid cols-4 section">
        <StatCard icon={CheckCircle2} tone="success" label="Matched" value={num(sum.matched)} sub="Posted to flat ledgers" />
        <StatCard icon={CircleHelp} tone="warning" label="Manual review" value={num(sum.manual_review)} sub="Never auto-allocated" />
        <StatCard icon={XCircle} tone="critical" label="Unmatched" value={num(sum.unmatched)} sub="No flat identified" />
        <StatCard icon={Copy} label="Duplicates blocked" value={num(dupTotal)} sub="Across all uploads" />
      </div>

      <div className="card section">
        <div style={{ padding: '0 8px' }}><Tabs value={tab} onChange={setTab} tabs={[
          { key: 'review', label: 'Review queue', count: queueCount }, { key: 'matched', label: 'Matched', count: sum.matched || 0 },
          { key: 'all', label: 'All transactions', count: all.length }, { key: 'history', label: 'History', count: batches.data?.length },
        ]} /></div>
        {tab !== 'history' ? (
          <Async state={txns}>
            {() => (
              <>
                {tab === 'all' && batchFilter && <div style={{ padding: '12px 16px' }}><span className="chip active">{batchFilter.filename} <button className="icon-btn" style={{ width: 20, height: 20, color: '#fff', display: 'inline-grid', verticalAlign: 'middle' }} onClick={() => setBatchFilter(null)} aria-label="Clear batch filter">×</button></span></div>}
                <TxnTable rows={views[tab]} onReview={setReviewing} />
              </>
            )}
          </Async>
        ) : (
          <Async state={batches}>
            {(list) => list.length === 0 ? <EmptyState icon={FileSpreadsheet} title="No uploads yet" text="Each statement you upload is kept here." /> : (
              <div className="table-wrap"><table className="table" style={{ minWidth: 820 }}>
                <thead><tr><th>Uploaded</th><th>File</th><th>By</th><th className="num">Rows</th><th className="num">Matched</th><th className="num">Review</th><th className="num">Unmatched</th><th className="num">Duplicates</th><th /></tr></thead>
                <tbody>{list.map((b) => (
                  <tr key={b._id}><td>{dateTime(b.createdAt)}</td><td>{b.filename}</td><td>{b.uploadedBy?.name || '–'}</td><td className="num">{b.counts.rows}</td>
                    <td className="num">{b.counts.matched}</td><td className="num">{b.counts.manualReview}</td><td className="num">{b.counts.unmatched}</td><td className="num">{b.counts.duplicates}</td>
                    <td className="right"><button className="btn btn-ghost btn-sm" onClick={() => { setBatchFilter(b); setTab('all'); }}>View</button></td></tr>))}</tbody>
              </table></div>
            )}
          </Async>
        )}
      </div>
      {reviewing && <ReviewModal txn={reviewing} onClose={() => setReviewing(null)} onDone={refresh} />}
    </>
  );
}
