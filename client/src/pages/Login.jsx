import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Building2, CheckCircle2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { HOME, useAuth } from '../context/AuthContext';
import { errorMessage } from '../services/api';
import { Alert, Button, Field } from '../components/ui';
import './Login.css';

const DEMOS = [
  { label: 'Resident', who: 'Swati Joshi · T12-0408', email: 'swati@society360.demo' },
  { label: 'Resident', who: 'Neeraj Kulkarni · T07-1203', email: 'neeraj@society360.demo' },
  { label: 'Help Desk Staff', who: 'Priya Deshmukh', email: 'helpdesk@society360.demo' },
];

export default function Login() {
  const { user, login, demoCommittee } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to={HOME[user.role]} replace />;

  const run = async (fn) => {
    setBusy(true); setError('');
    try { const u = await fn(); toast.success(`Welcome, ${u.name.split(' ')[0]}`); }
    catch (err) { setError(errorMessage(err, 'Sign in failed')); }
    finally { setBusy(false); }
  };
  const submit = (e) => { e.preventDefault(); if (!email || !password) return setError('Enter your email and password.'); run(() => login(email.trim(), password)); };

  return (
    <div className="login">
      <section className="login-brand">
        <div className="row"><div className="brand-mark"><Building2 size={20} color="#fff" /></div><strong style={{ fontSize: 20 }}>Society360</strong></div>
        <div>
          <span className="eyebrow" style={{ color: 'rgba(255,255,255,.6)' }}>Smart Township Management</span>
          <h1>One place for billing, payments and complaints.</h1>
          <p>Built for a 2,400-home gated township in Pune.</p>
          <ul className="login-points">
            <li><CheckCircle2 size={18} />Pay maintenance and download receipts</li>
            <li><CheckCircle2 size={18} />Bank statements reconciled safely, never guessed</li>
            <li><CheckCircle2 size={18} />Complaints triaged, with emergencies escalated instantly</li>
          </ul>
        </div>
        <small style={{ color: 'rgba(255,255,255,.5)' }}>Demo environment · fictional data · no real payments</small>
      </section>

      <section className="login-form-side">
        <div className="login-card stack" style={{ gap: 24 }}>
          <div><h1>Sign in</h1><p className="muted" style={{ marginTop: 4 }}>Use your society account.</p></div>
          {error && <Alert tone="critical">{error}</Alert>}
          <form className="stack" onSubmit={submit} noValidate>
            <Field label="Email" htmlFor="email"><input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@society360.demo" /></Field>
            <Field label="Password" htmlFor="password">
              <div style={{ position: 'relative' }}>
                <input id="password" className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ paddingRight: 44 }} />
                <button type="button" className="icon-btn" style={{ position: 'absolute', right: 3, top: 3 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </Field>
            <Button className="btn-lg" type="submit" loading={busy}>Sign in</Button>
          </form>

          <div className="stack" style={{ gap: 10 }}>
            <div className="eyebrow">Demo access · password Demo@1234</div>
            <div className="demo-grid">
              {DEMOS.map((d) => (
                <button key={d.email} className="demo-btn" disabled={busy} onClick={() => { setEmail(d.email); setPassword('Demo@1234'); setError(''); }}>
                  <strong>{d.label}</strong><span>{d.who}</span>
                </button>
              ))}
              <button className="demo-btn" disabled={busy} onClick={() => run(demoCommittee)}><strong><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Committee member</strong><span>One-click read-only access</span></button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
