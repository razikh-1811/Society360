import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, CreditCard, Download, FileText, Printer } from 'lucide-react';
import api, { errorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import useFetch from '../hooks/useFetch';
import { Alert, Async, Badge, Button, EmptyState, Field, Modal, PageHeader, StatCard, Tabs } from '../components/ui';
import { billTone, date, money, periodLabel } from '../utils/format';

const newRequestId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);
const flatIdOf = (flat) => (flat && typeof flat === 'object' ? flat._id : flat);

function ReceiptModal({ paymentId, onClose }) {
  const state = useFetch(() => api.get(`/payments/${paymentId}/receipt`).then((r) => r.data.receipt), [paymentId]);
  return (
    <Modal title="Payment receipt" onClose={onClose} footer={<><button className="btn btn-ghost no-print" onClick={onClose}>Close</button><button className="btn btn-primary no-print" onClick={() => window.print()}><Printer size={16} />Print / Save PDF</button></>}>
      <Async state={state}>
        {(r) => (
          <div className="print-area stack" style={{ gap: 16 }}>
            <div className="row between"><div><h2>{r.society}</h2><div className="muted small">Maintenance payment receipt</div></div><Badge tone="success">Paid</Badge></div>
            <dl className="kv">
              <dt>Receipt no.</dt><dd className="mono">{r.receiptNo}</dd>
              <dt>Transaction ref</dt><dd className="mono">{r.txnRef}</dd>
              <dt>Date &amp; time</dt><dd>{new Date(r.paidAt).toLocaleString('en-IN')}</dd>
              <dt>Flat</dt><dd>{r.flatNumber} (Tower {r.tower})</dd>
              <dt>Resident</dt><dd>{r.ownerName}</dd>
              <dt>Bill period</dt><dd>{periodLabel(r.period)}</dd>
              <dt>Mode</dt><dd>{r.method === 'mock_online' ? 'Online (demo)' : r.method === 'bank_reconciliation' ? 'Bank transfer (reconciled)' : 'Recorded'}</dd>
              <dt>Amount paid</dt><dd><strong style={{ fontSize: 18 }}>{money(r.amount)}</strong></dd>
            </dl>
            <p className="muted small">This is a system-generated receipt for a demonstration environment. No real money was transferred.</p>
          </div>
        )}
      </Async>
    </Modal>
  );
}

function PayModal({ bill, onClose, onPaid, onReceipt }) {
  const [amount, setAmount] = useState(String(bill.balance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const requestId = useRef(newRequestId()); // reused on retries, so a double click can never pay twice

  const value = Number(amount);
  const invalid = !(value > 0) ? 'Enter an amount greater than zero.' : value > bill.balance ? `Amount cannot exceed the balance of ${money(bill.balance)}.` : '';

  const pay = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/payments/mock', { billId: bill.id, amount: value, clientRequestId: requestId.current });
      setDone(data); onPaid(); toast.success('Payment successful');
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal title="Payment confirmed" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Done</button><button className="btn btn-teal" onClick={() => onReceipt(done.payment._id)}><FileText size={16} />View receipt</button></>}>
        <div className="state" style={{ padding: '8px 0' }}>
          <div className="state-icon" style={{ background: 'var(--success-50)', color: 'var(--success)' }}><CheckCircle2 size={26} /></div>
          <h2>{money(done.payment.amount)} paid</h2>
          <p className="mono small">Ref {done.payment.txnRef}</p>
          <p className="small">{done.bill.balance > 0 ? `Remaining balance: ${money(done.bill.balance)}` : 'This bill is fully paid.'}</p>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={`Pay maintenance · ${periodLabel(bill.period)}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><Button variant="teal" onClick={pay} loading={busy} disabled={!!invalid}><CreditCard size={16} />Pay {invalid ? '' : money(value)}</Button></>}>
      <div className="stack">
        <Alert tone="info">Demo payment. No real money is transferred.</Alert>
        <dl className="kv"><dt>Bill amount</dt><dd>{money(bill.amount)}</dd><dt>Already paid</dt><dd>{money(bill.paidAmount)}</dd><dt>Balance</dt><dd><strong>{money(bill.balance)}</strong></dd></dl>
        {bill.lateFee > 0 && <Alert tone="warning">Indicative late fee under the demo rule: {money(bill.lateFee)}. It is shown for information and is not collected by this demo payment.</Alert>}
        <Field label="Amount to pay (₹)" htmlFor="amt" error={invalid && amount !== '' ? invalid : ''} hint="You can pay the full balance or part of it.">
          <input id="amt" className="input" type="number" min="1" max={bill.balance} step="1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="toggle-row"><button className="chip" onClick={() => setAmount(String(bill.balance))}>Full balance</button>{bill.balance > 2000 && <button className="chip" onClick={() => setAmount('2000')}>₹2,000</button>}</div>
        {error && <Alert tone="critical">{error}</Alert>}
      </div>
    </Modal>
  );
}

export default function Billing({ staff = false }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('bills');
  const [payBill, setPayBill] = useState(null);
  const [receiptId, setReceiptId] = useState(params.get('receipt'));
  const [selected, setSelected] = useState('');

  const flats = useFetch(() => (staff ? api.get('/flats').then((r) => r.data.flats) : Promise.resolve([])), [staff]);
  const flatId = staff ? selected || flats.data?.[0]?._id : flatIdOf(user.flat);

  const data = useFetch(async () => {
    if (!flatId) return null;
    const [bills, payments, ledger] = await Promise.all([
      api.get(`/flats/${flatId}/bills`), api.get(`/flats/${flatId}/payments`), api.get(`/flats/${flatId}/ledger`),
    ]);
    return { bills: bills.data.bills, payments: payments.data.payments, ledger: ledger.data };
  }, [flatId]);

  // Deep link from the dashboard: ?pay=<billId> opens the payment dialog directly.
  useEffect(() => {
    const id = params.get('pay');
    if (id && data.data && !staff) {
      const b = data.data.bills.find((x) => x.id === id && x.balance > 0);
      if (b) setPayBill(b);
      params.delete('pay'); setParams(params, { replace: true });
    }
  }, [data.data]); // eslint-disable-line

  const closeReceipt = () => { setReceiptId(null); if (params.get('receipt')) { params.delete('receipt'); setParams(params, { replace: true }); } };
  const summary = data.data?.ledger.summary;
  const flatMeta = useMemo(() => (staff ? flats.data?.find((f) => f._id === flatId) : null), [flats.data, flatId, staff]);

  return (
    <>
      <PageHeader title={staff ? 'Flat ledgers' : 'Billing & payments'} subtitle={staff ? 'Read-only view of any flat’s bills, payments and ledger.' : 'Your maintenance bills, payment history and ledger.'}
        actions={staff && flats.data && (
          <Field label="Flat" htmlFor="flat"><select id="flat" className="select" value={flatId || ''} onChange={(e) => setSelected(e.target.value)}>{flats.data.map((f) => <option key={f._id} value={f._id}>{f.flatNumber} · {f.ownerName}</option>)}</select></Field>
        )} />
      {staff && flats.error && <Alert tone="critical">{flats.error}</Alert>}
      {staff && flatMeta && <p className="muted small" style={{ marginBottom: 16 }}>{flatMeta.ownerName} · {flatMeta.areaSqft} sq ft × ₹6.50 = {money(Math.round(flatMeta.areaSqft * 6.5))} per month</p>}

      <Async state={data}>
        {(d) => !d ? <EmptyState title="No flat selected" /> : (
          <>
            <div className="grid cols-4">
              <StatCard label="Total billed" value={money(summary.totalBilled)} />
              <StatCard label="Total paid" value={money(summary.totalPaid)} tone="success" />
              <StatCard label="Outstanding" value={money(summary.outstanding)} tone={summary.outstanding > 0 ? 'critical' : 'success'} />
              <StatCard label="Late fees (demo rule)" value={money(summary.lateFees)} tone={summary.lateFees > 0 ? 'warning' : undefined} sub="Configurable; shown for information" />
            </div>

            <div className="card section">
              <div style={{ padding: '0 8px' }}><Tabs value={tab} onChange={setTab} tabs={[{ key: 'bills', label: 'Bills', count: d.bills.length }, { key: 'payments', label: 'Payment history', count: d.payments.length }, { key: 'ledger', label: 'Ledger' }]} /></div>

              {tab === 'bills' && (d.bills.length === 0 ? <EmptyState title="No bills yet" /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Period</th><th>Area × rate</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th><th>Due</th><th>Status</th><th className="num">Late fee</th><th /></tr></thead>
                  <tbody>{d.bills.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{periodLabel(b.period)}</strong></td><td className="muted">{b.areaSqft} × ₹{b.ratePerSqft.toFixed(2)}</td>
                      <td className="num">{money(b.amount)}</td><td className="num">{money(b.paidAmount)}</td><td className="num"><strong>{money(b.balance)}</strong></td>
                      <td>{date(b.dueDate)}{b.isOverdue && <div className="small" style={{ color: 'var(--critical)' }}>{b.daysOverdue} days overdue</div>}</td>
                      <td><Badge tone={billTone(b.status)}>{b.status}</Badge></td><td className="num">{b.lateFee ? money(b.lateFee) : '–'}</td>
                      <td className="right">{!staff && b.balance > 0 && <button className="btn btn-teal btn-sm" onClick={() => setPayBill(b)}>Pay now</button>}</td>
                    </tr>))}</tbody>
                </table></div>
              ))}

              {tab === 'payments' && (d.payments.length === 0 ? <EmptyState icon={FileText} title="No payments recorded" text="Payments will be listed here with a receipt for each." /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Date</th><th>Reference</th><th>For</th><th>Mode</th><th className="num">Amount</th><th /></tr></thead>
                  <tbody>{d.payments.map((p) => (
                    <tr key={p._id}><td>{date(p.paidAt)}</td><td className="mono small">{p.txnRef}</td><td>{periodLabel(p.bill?.period)}</td>
                      <td><Badge tone={p.method === 'bank_reconciliation' ? 'info' : 'neutral'}>{p.method === 'mock_online' ? 'Online (demo)' : p.method === 'bank_reconciliation' ? 'Bank transfer' : 'Recorded'}</Badge></td>
                      <td className="num">{money(p.amount)}</td><td className="right"><button className="btn btn-ghost btn-sm" onClick={() => setReceiptId(p._id)}><Download size={13} />Receipt</button></td></tr>))}</tbody>
                </table></div>
              ))}

              {tab === 'ledger' && (d.ledger.entries.length === 0 ? <EmptyState title="Ledger is empty" /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>Date</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
                  <tbody>{d.ledger.entries.map((e, i) => (
                    <tr key={i}><td>{date(e.date)}</td><td>{e.description}{e.receiptNo && <> · <button className="btn btn-ghost btn-sm" onClick={() => setReceiptId(e.paymentId)}>{e.receiptNo}</button></>}</td>
                      <td className="num">{e.debit ? money(e.debit) : '–'}</td><td className="num" style={{ color: 'var(--success)' }}>{e.credit ? money(e.credit) : '–'}</td><td className="num"><strong>{money(e.balance)}</strong></td></tr>))}</tbody>
                </table></div>
              ))}
            </div>
          </>
        )}
      </Async>

      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} onPaid={data.reload} onReceipt={(id) => { setPayBill(null); setReceiptId(id); }} />}
      {receiptId && <ReceiptModal paymentId={receiptId} onClose={closeReceipt} />}
    </>
  );
}
