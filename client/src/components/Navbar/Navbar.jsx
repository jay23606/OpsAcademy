import { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Terminal, LayoutDashboard, Compass, Sparkles, ExternalLink, Flame, Zap, LogOut } from 'lucide-react';
import { sandboxApi } from '../../services/api';
import useAuth from '../../hooks/useAuth';
import useProgress from '../../hooks/useProgress';
import usePolling from '../../hooks/usePolling';
import './Navbar.css';

const STATS_POLL_MS = 30000;

/** Sandbox engine status from the gateway's own measurements. */
function engineLabel(stats) {
  if (!stats) return { text: 'Engine: offline', title: 'The sandbox gateway is not responding', online: false };

  const { pool, claimLatencyMs, mode } = stats;
  const measured = claimLatencyMs.pool.samples ? claimLatencyMs.pool : claimLatencyMs.cold;
  const latency = measured.samples ? ` • ${measured.p50 < 1 ? '<1' : Math.round(measured.p50)}ms start` : '';
  const text = pool.enabled ? `Engine: ${pool.available}/${pool.targetSize} warm${latency}` : `Engine: ${mode}${latency}`;
  return {
    text,
    title: `Sandbox mode: ${mode}. ${stats.activeSessions} of ${stats.capacity} sandboxes in use. Start time is the median measured by this server.`,
    online: true,
  };
}

export default function Navbar() {
  const location = useLocation();
  const { user, isRegistered, logout } = useAuth();
  const progress = useProgress();
  const [stats, setStats] = useState(null);

  // The navbar is mounted for the whole visit, so there is nothing to cancel.
  const loadStats = useCallback(() => {
    sandboxApi.stats()
      .then((res) => setStats(res.data.data))
      .catch(() => setStats(null));
  }, []);
  usePolling(loadStats, STATS_POLL_MS);

  const isActive = (path) => location.pathname === path ? 'active' : '';
  const engine = engineLabel(stats);

  // The landing page has its own framed architectural header matching the hero design
  if (location.pathname === '/') {
    return null;
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        {/* Brand */}
        <Link to="/" className="navbar-brand">
          <div className="navbar-logo">
            <span className="navbar-logo-prompt">&gt;_</span>
          </div>
          <div className="navbar-brand-text">
            Ops<span>Academy</span>
          </div>
        </Link>

        {/* Navigation Links */}
        <ul className="navbar-nav">
          <li>
            <Link to="/dashboard" className={`navbar-link ${isActive('/dashboard')}`}>
              <LayoutDashboard size={16} />
              <span>Dashboard</span>
            </Link>
          </li>
          <li>
            <Link to="/roadmap" className={`navbar-link ${isActive('/roadmap')}`}>
              <Compass size={16} />
              <span>DevOps Roadmap</span>
            </Link>
          </li>
          <li>
            <Link to="/casestudies" className={`navbar-link ${isActive('/casestudies')}`}>
              <Sparkles size={16} className="text-lime" />
              <span>Case Studies</span>
            </Link>
          </li>
        </ul>

        {/* Right Actions */}
        <div className="navbar-actions">
          <div className={`nav-telemetry-badge ${engine.online ? '' : 'offline'}`} title={engine.title}>
            <span className="pulse-dot">●</span> {engine.text}
          </div>

          {progress.xp > 0 && (
            <Link to="/dashboard" className="nav-progress" title={`Level ${progress.level}`}>
              <span><Zap size={13} /> {progress.xp} XP</span>
              {progress.streak.current > 0 && <span><Flame size={13} /> {progress.streak.current}</span>}
            </Link>
          )}

          <a
            href="https://github.com/yashsrivastava1408/OpsAcademy"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-icon hide-mobile"
            title="GitHub Repository"
          >
            <ExternalLink size={18} />
          </a>

          {isRegistered ? (
            <div className="nav-user">
              <span className="nav-user-name" title={user.email}>{user.name}</span>
              <button className="btn btn-ghost btn-icon" onClick={logout} title="Log out" aria-label="Log out">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-secondary btn-sm">
              Sign in
            </Link>
          )}

          <Link to="/dashboard" className="btn btn-primary btn-sm hide-mobile">
            Start Learning
          </Link>
        </div>
      </div>
    </nav>
  );
}
