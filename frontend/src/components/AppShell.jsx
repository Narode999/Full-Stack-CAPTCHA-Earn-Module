import { NavLink, useLocation } from 'react-router-dom';
import { LayoutGrid, Zap, History as HistoryIcon, ShieldCheck, LogOut } from 'lucide-react';
import GemMark from './GemMark.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWallet } from '../context/WalletContext.jsx';
import { CountUp } from './ui.jsx';

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { to: '/earn', label: 'Earn Gems', icon: Zap },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/security', label: 'Security', icon: ShieldCheck }
];

const TABS = [
  { to: '/dashboard', label: 'Home', icon: LayoutGrid },
  { to: '/earn', label: 'Earn', icon: Zap },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/security', label: 'Security', icon: ShieldCheck }
];

function initials(name) {
  return String(name || 'V')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('');
}

function Brand() {
  return (
    <NavLink to="/dashboard" className="brand" aria-label="VELoop Rewards home">
      <GemMark size={30} tone="gold" />
      <span className="brand__text">
        <span className="brand__name">VELOOP</span>
        <span className="brand__sub">REWARDS</span>
      </span>
    </NavLink>
  );
}

/**
 * Application shell.
 *
 * Desktop gets a persistent left rail. Mobile gets a fixed bottom tab bar
 * with safe-area padding. The same balance is rendered in both so the user
 * can always see it without scrolling.
 */
export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { balance } = useWallet();
  const { pathname } = useLocation();

  const name = user ? user.name : 'there';

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* --- Desktop rail ------------------------------------------------- */}
      <aside className="rail">
        <Brand />

        <nav className="nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav__item${isActive ? ' nav__item--active' : ''}`}
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className="nav__icon" aria-hidden="true" />
                  <span>{label}</span>
                  {isActive ? <span className="sr-only">(current page)</span> : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="nav__foot">
          <div className="user">
            <span className="avatar" aria-hidden="true">
              {initials(name)}
            </span>
            <span className="user__body">
              <span className="user__name">{name}</span>
              <span className="user__status">
                <span className="dot dot--pulse" aria-hidden="true" />
                Online
              </span>
            </span>
          </div>

          <button type="button" className="icon-btn" onClick={logout} aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {/* --- Main column -------------------------------------------------- */}
      <div className="shell__main">
        <header className="topbar">
          <GemMark size={26} tone="gold" />
          <span className="brand__name" style={{ fontSize: '0.9rem' }}>
            VELOOP
          </span>
          <span className="topbar__balance">
            <GemMark size={14} />
            <CountUp value={Number(balance) || 0} />
          </span>
        </header>

        <main id="main" className="main" key={pathname}>
          {children}
        </main>
      </div>

      {/* --- Mobile tab bar ----------------------------------------------- */}
      <nav className="tabbar" aria-label="Main">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`}
          >
            <Icon size={20} className="tabbar__icon" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
