import { Link } from 'react-router-dom';
import { AlertCircle, CreditCard, FileText, Megaphone, MessageSquarePlus, Receipt, Search, Wallet } from 'lucide-react';
import api from '../services/api';
import useFetch from '../hooks/useFetch';
import { Async, Badge, EmptyState, PageHeader, StatCard } from '../components/ui';
import { billTone, date, dateTime, money, periodLabel, statusTone, urgencyTone } from '../utils/format';
import './Dashboard.css';

const statusTone2 = { Paid: 'success', 'Partially paid': 'warning', Due: 'info', Overdue: 'critical' };

function Tile({ to, icon: Icon, title, sub, disabled }) {
  return <Link to={to} className={`action-tile ${disabled ? 'disabled' : ''}`} aria-disabled={disabled}><span className="ico"><Icon size={20} /></span><span>{title}<small>{sub}</small></span></Link>;
}

export default function ResidentDashboard() {
  const state = useFetch(() => api.get('/dashboard/resident').then((r) => r.data), []);

  return (
    <Async state={state}>
      {(d) => {
        const bill = d.currentBill;
        const payable = bill && bill.balance > 0;
        return (
          <>
            <PageHeader title={`Hello, ${d.resident.name.split(' ')[0]}`} subtitle={`Flat ${d.flat.flatNumber} · Tower ${d.flat.tower} · ${d.flat.areaSqft} sq ft`} />

            <div className="actions-grid">
              <Tile to={payable ? `/billing?pay=${bill.id}` : '/billing'} icon={CreditCard} title="Pay maintenance" sub={payable ? `${money(bill.balance)} due` : 'All paid up'} disabled={!payable} />
              <Tile to="/billing" icon={Receipt} title="View bills" sub="Bills, payments, ledger" />
              <Tile to="/complaints?new=1" icon={MessageSquarePlus} title="Raise complaint" sub="Plumbing, lift, security…" />
              <Tile to="/complaints" icon={Search} title="Track complaint" sub={`${d.openComplaints.count} open`} />
            </div>

            <div className="grid cols-3 section">
              <div className="card bill-hero" style={{ gridColumn: 'span 2' }}>
                <div>
                  <div className="eyebrow">Current maintenance bill{bill && ` · ${periodLabel(bill.period)}`}</div>
                  {bill ? (
                    <>
                      <div className="big-number" style={{ marginTop: 6 }}>{money(bill.amount)}</div>
                      <div className="muted small" style={{ marginTop: 4 }}>{bill.areaSqft} sq ft × ₹{bill.ratePerSqft.toFixed(2)} · due {date(bill.dueDate)}</div>
                    </>
                  ) : <p className="muted">No bill has been generated yet.</p>}
                </div>
                {bill && (
                  <div className="row wrap">
                    <Badge tone={statusTone2[d.paymentStatus]}>{d.paymentStatus}</Badge>
                    <Badge tone={billTone(bill.status)}>Bill {bill.status}</Badge>
                    {bill.isOverdue && <Badge tone="critical">{bill.daysOverdue} days overdue</Badge>}
                  </div>
                )}
              </div>
              <StatCard icon={Wallet} tone={d.outstanding.totalDue > 0 ? 'critical' : 'success'} label="Outstanding amount" value={money(d.outstanding.totalDue)}
                sub={d.outstanding.totalDue > 0 ? `${money(d.outstanding.principal)} dues${d.outstanding.lateFees ? ` + ${money(d.outstanding.lateFees)} late fee (demo rule)` : ''}` : 'Nothing pending'} />
            </div>

            <div className="grid main-side section">
              <div className="card">
                <div className="card-head"><h2>Recent transactions</h2><Link to="/billing" className="small">View all</Link></div>
                {d.recentTransactions.length === 0 ? <EmptyState icon={FileText} title="No payments yet" text="Your payments will appear here once you pay a bill." /> : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Date</th><th>Reference</th><th>For</th><th className="num">Amount</th><th /></tr></thead>
                      <tbody>
                        {d.recentTransactions.map((p) => (
                          <tr key={p._id}>
                            <td>{date(p.paidAt)}</td><td className="mono small">{p.txnRef}</td><td>{periodLabel(p.bill?.period)}</td><td className="num">{money(p.amount)}</td>
                            <td className="right"><Link className="small" to={`/billing?receipt=${p._id}`}>Receipt</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="stack">
                <div className="card card-pad">
                  <div className="row between" style={{ marginBottom: 8 }}><h2>Open complaints</h2><Badge tone={d.openComplaints.count ? 'warning' : 'success'}>{d.openComplaints.count}</Badge></div>
                  {d.openComplaints.items.length === 0 ? <p className="muted small">No open complaints.</p> : d.openComplaints.items.map((c) => (
                    <div key={c._id} className="list-item">
                      <div className="grow"><Link to="/complaints" style={{ fontWeight: 600 }}>{c.title}</Link><div className="muted small">{c.ticketNo} · {dateTime(c.createdAt)}</div></div>
                      <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}><Badge tone={statusTone(c.status)}>{c.status}</Badge>{c.urgency === 'Critical' && <Badge tone={urgencyTone(c.urgency)}><AlertCircle size={11} />Critical</Badge>}</div>
                    </div>
                  ))}
                </div>
                <div className="card card-pad">
                  <div className="row" style={{ marginBottom: 8 }}><Megaphone size={16} color="var(--teal)" /><h2>Notices</h2></div>
                  {d.notices.map((n) => <div key={n._id} className="list-item" style={{ display: 'block' }}><strong className="small">{n.title}</strong><p className="muted small">{n.body}</p></div>)}
                </div>
              </div>
            </div>
          </>
        );
      }}
    </Async>
  );
}
