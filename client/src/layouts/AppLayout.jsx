import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, BookOpen, Building2, Headset, Landmark, LayoutDashboard, LogOut, MessageSquareWarning, Receipt } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { initials } from '../utils/format';

const NAV = {
  resident: [
    { to: '/resident', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/billing', label: 'Billing', icon: Receipt },
    { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning },
  ],
  helpdesk: [
    { to: '/helpdesk', label: 'Help Desk', icon: Headset },
    { to: '/reconciliation', label: 'Reconciliation', icon: Landmark },
    { to: '/ledgers', label: 'Flat ledgers', icon: BookOpen },
  ],
  committee: [
    { to: '/committee', label: 'Overview', icon: BarChart3 },
    { to: '/ledgers', label: 'Flat ledgers', icon: BookOpen },
  ],
};
const ROLE_LABEL = { resident: 'Resident', helpdesk: 'Help desk staff', committee: 'Committee (read-only)' };

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const items = NAV[user.role] || [];
  const current = items.find((i) => pathname.startsWith(i.to));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Building2 size={20} color="#fff" /></div>
          <div><div className="brand-name">Society360</div><div className="brand-sub">Smart Township Management</div></div>
        </div>
        <nav className="nav" aria-label="Main">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={18} />{label}</NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">Pune township · 28 towers · 2,400 homes</div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="row">
            <div className="brand-inline row" style={{ display: 'none', gap: 8 }}><Building2 size={20} color="var(--teal)" /><strong style={{ color: 'var(--navy)' }}>Society360</strong></div>
            <span className="topbar-title">{current?.label}</span>
          </div>
          <div className="user-chip">
            <div className="user-meta"><div className="user-name">{user.name}</div><div className="user-role">{ROLE_LABEL[user.role]}</div></div>
            <div className="avatar" aria-hidden="true">{initials(user.name)}</div>
            <button className="icon-btn" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={18} /></button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
