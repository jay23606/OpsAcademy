import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Terminal,
  Shield,
  Cpu,
  Wifi,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import './LabTransitionPage.css';

const TRANSITION_STEPS = [
  {
    id: 1,
    label: 'Authenticating learner session',
    detail: 'Cryptographic token verified via Supabase Auth',
    icon: Shield,
    doneAt: 15,
  },
  {
    id: 2,
    label: 'Claiming pre-warmed sandbox container',
    detail: 'Allocating isolated Linux environment from standby pool',
    icon: Cpu,
    doneAt: 40,
  },
  {
    id: 3,
    label: 'Enforcing sandbox security controls',
    detail: 'CapDrop: ALL, no-new-privileges, 64MB tmpfs',
    icon: Shield,
    doneAt: 65,
  },
  {
    id: 4,
    label: 'Establishing live WebSocket stream',
    detail: 'Sub-millisecond xterm.js terminal predictor ready',
    icon: Wifi,
    doneAt: 85,
  },
  {
    id: 5,
    label: 'Socratic AI Mentor synchronized',
    detail: 'Inspection engine armed with zero-leak protection',
    icon: Sparkles,
    doneAt: 100,
  },
];

export default function LabTransitionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Determine target destination
  const unitParam = searchParams.get('unit');
  const toParam = searchParams.get('to');
  const targetUrl = toParam || (unitParam ? `/unit/${encodeURIComponent(unitParam)}/practice` : '/dashboard');

  const [progress, setProgress] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const duration = 2000; // 2 seconds total transition
    const intervalTime = 40;
    const increment = 100 / (duration / intervalTime);

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return Math.min(100, prev + increment);
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (progress >= 100 && !isRedirecting) {
      setIsRedirecting(true);
      const redirectTimeout = setTimeout(() => {
        navigate(targetUrl, { replace: true });
      }, 350);
      return () => clearTimeout(redirectTimeout);
    }
  }, [progress, isRedirecting, navigate, targetUrl]);

  return (
    <div className="lab-portal-stage">
      {/* Ambient background glows matching landing page */}
      <div className="portal-ambient-glow portal-glow-top" />
      <div className="portal-ambient-glow portal-glow-bottom" />

      <div className="portal-container">
        <div className="portal-card animate-scale-in">
          {/* Header pill */}
          <div className="portal-badge-pill">
            <span className="portal-pulse-dot" />
            <span className="portal-badge-text">OPSACADEMY SECURE SANDBOX CLOUD</span>
          </div>

          {/* Title */}
          <h1 className="portal-title">Welcome to the Labs</h1>
          <p className="portal-subtitle">
            Booting your isolated Linux sandbox with live terminal streaming, automated check verifications, and AI guidance.
          </p>

          {/* High-tech Progress Gauge */}
          <div className="portal-progress-wrapper">
            <div className="portal-progress-header">
              <span className="portal-progress-label">
                {progress < 100 ? (
                  <>
                    <Loader2 size={14} className="portal-spin-icon" />
                    Initializing Environment...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    Sandbox Ready. Entering...
                  </>
                )}
              </span>
              <span className="portal-progress-percent">{Math.round(progress)}%</span>
            </div>
            <div className="portal-progress-bar-track">
              <div
                className="portal-progress-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Stepper Status Log */}
          <div className="portal-stepper">
            {TRANSITION_STEPS.map((step) => {
              const isDone = progress >= step.doneAt;
              const isCurrent = progress < step.doneAt && progress >= (step.doneAt - 25);
              const StepIcon = step.icon;

              return (
                <div
                  key={step.id}
                  className={`portal-step-item ${isDone ? 'done' : isCurrent ? 'active' : 'pending'}`}
                >
                  <div className="portal-step-icon-wrap">
                    {isDone ? (
                      <CheckCircle2 size={16} className="text-emerald-500" />
                    ) : (
                      <StepIcon size={15} className="step-icon" />
                    )}
                  </div>
                  <div className="portal-step-content">
                    <span className="portal-step-label">{step.label}</span>
                    <span className="portal-step-detail">{step.detail}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer Action Button */}
          <div className="portal-footer">
            <Link to={targetUrl} className="portal-enter-btn">
              <span>Enter Lab Cockpit</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
