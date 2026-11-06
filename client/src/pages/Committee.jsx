import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, CheckCircle2, Clock, Eye, Home, IndianRupee, MessageSquareWarning, Percent, RotateCcw, Timer, TrendingDown } from 'lucide-react';
import api from '../services/api';
import useFetch from '../hooks/useFetch';
import { Async, Badge, EmptyState, PageHeader, StatCard } from '../components/ui';
import { money, num, periodLabel } from '../utils/format';

// Mirrors the CSS design tokens (SVG charts need literal colours).
const C = { navy: '#172B4D', teal: '#0F9D8A', warning: '#E8A23B', critical: '#DC4C4C', success: '#16A36A', muted: '#778195', grid: '#E3E8F0' };
const URGENCY_COLOR = { Critical: C.critical, High: C.warning, Medium: '#3B6FD4', Low: '#A9B2C3' };
const lakh = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}k`);
const tip = { contentStyle: { borderRadius: 10, border: `1px solid ${C.grid}`, fontSize: 13 } };

export default function Committee() {
  const state = useFetch(() => api.get('/dashboard/committee').then((r) => r.data), []);
  return (
    <>
      <PageHeader title="Committee overview" subtitle="Finance and service performance across the township." actions={<Badge tone="neutral"><Eye size={12} />Read-only</Badge>} />
      <Async state={state}>
        {({ financial: f, ageing, complaints: c, generatedAt }) => (
          <>
            <div className="grid cols-6">
              <StatCard icon={IndianRupee} label="Total billed" value={money(f.totalBilled)} />
              <StatCard icon={Banknote} tone="success" label="Total collected" value={money(f.totalCollected)} />
              <StatCard icon={TrendingDown} tone={f.outstanding > 0 ? 'critical' : 'success'} label="Outstanding" value={money(f.outstanding)} />
              <StatCard icon={Percent} tone="teal" label="Collection" value={`${f.collectionPercentage}%`} />
              <StatCard icon={CheckCircle2} tone="success" label="Paid flats" value={num(f.paidFlats)} sub={`of ${num(f.paidFlats + f.unpaidFlats)} billed`} />
              <StatCard icon={Home} tone={f.unpaidFlats ? 'warning' : 'success'} label="Unpaid flats" value={num(f.unpaidFlats)} />
            </div>

            <div className="grid cols-2 section">
              <div className="card card-pad">
                <h2>Billed vs collected</h2><p className="muted small" style={{ marginBottom: 12 }}>By billing month</p>
                {f.byPeriod.length === 0 ? <EmptyState title="No billing data" /> : (
                  <div style={{ height: 280 }}><ResponsiveContainer><BarChart data={f.byPeriod.map((p) => ({ ...p, name: periodLabel(p.period) }))} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="name" tick={{ fontSize: 12, fill: C.muted }} /><YAxis tickFormatter={lakh} tick={{ fontSize: 12, fill: C.muted }} width={56} />
                    <Tooltip formatter={(v) => money(v)} {...tip} /><Legend /><Bar dataKey="billed" name="Billed" fill={C.navy} radius={[4, 4, 0, 0]} /><Bar dataKey="collected" name="Collected" fill={C.teal} radius={[4, 4, 0, 0]} />
                  </BarChart></ResponsiveContainer></div>
                )}
              </div>
              <div className="card card-pad">
                <h2>Dues ageing</h2><p className="muted small" style={{ marginBottom: 12 }}>Outstanding amount by days past due</p>
                <div style={{ height: 280 }}><ResponsiveContainer><BarChart data={ageing} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} stroke={C.grid} /><XAxis dataKey="label" tick={{ fontSize: 12, fill: C.muted }} /><YAxis tickFormatter={lakh} tick={{ fontSize: 12, fill: C.muted }} width={56} />
                  <Tooltip formatter={(v, n, p) => [`${money(v)} · ${p.payload.flats} flats`, 'Outstanding']} {...tip} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>{ageing.map((a, i) => <Cell key={a.bucket} fill={[C.teal, C.warning, '#E07B3A', C.critical][i]} />)}</Bar>
                </BarChart></ResponsiveContainer></div>
                <div className="grid cols-4" style={{ marginTop: 12, gap: 8 }}>{ageing.map((a) => <div key={a.bucket} className="small"><div className="muted">{a.label}</div><strong>{money(a.amount)}</strong><div className="muted">{a.flats} flats</div></div>)}</div>
              </div>
            </div>

            <h2 className="section">Complaints</h2>
            <div className="grid cols-4" style={{ marginTop: 12 }}>
              <StatCard icon={MessageSquareWarning} label="Total complaints" value={num(c.total)} />
              <StatCard icon={Clock} tone="warning" label="Open" value={num(c.open)} />
              <StatCard icon={CheckCircle2} tone="success" label="Resolved" value={num(c.resolved)} />
              <StatCard icon={RotateCcw} tone={c.reopened ? 'critical' : undefined} label="Reopened" value={num(c.reopened)} />
            </div>
            <div className="grid cols-3 section">
              <div className="card card-pad"><h2>Average resolution time</h2>
                <div className="row" style={{ marginTop: 12 }}><Timer size={28} color={C.teal} /><div><div className="big-number">{c.averageResolutionHours}<span className="muted" style={{ fontSize: 16 }}> hrs</span></div><div className="muted small">across {c.resolvedSample} resolved complaints</div></div></div>
              </div>
              <div className="card card-pad"><h2>By category</h2>
                {c.byCategory.length === 0 ? <EmptyState title="No complaints" /> : <div style={{ height: 220, marginTop: 8 }}><ResponsiveContainer><BarChart data={c.byCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke={C.grid} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: C.muted }} /><YAxis type="category" dataKey="category" width={76} tick={{ fontSize: 12, fill: C.muted }} />
                  <Tooltip {...tip} /><Bar dataKey="count" name="Complaints" fill={C.teal} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>}
              </div>
              <div className="card card-pad"><h2>By urgency</h2>
                {c.byUrgency.length === 0 ? <EmptyState title="No complaints" /> : <div style={{ height: 220, marginTop: 8 }}><ResponsiveContainer><PieChart>
                  <Pie data={c.byUrgency} dataKey="count" nameKey="urgency" innerRadius={48} outerRadius={78} paddingAngle={2}>{c.byUrgency.map((u) => <Cell key={u.urgency} fill={URGENCY_COLOR[u.urgency]} />)}</Pie>
                  <Tooltip {...tip} /><Legend /></PieChart></ResponsiveContainer></div>}
              </div>
            </div>
            <p className="muted small section">Figures are calculated live from the database · updated {new Date(generatedAt).toLocaleTimeString('en-IN')}. Ageing counts every unpaid bill by days past its due date (not-yet-due bills fall in 0–30).</p>
          </>
        )}
      </Async>
    </>
  );
}
