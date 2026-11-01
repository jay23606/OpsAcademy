import { useState, useEffect, useRef } from 'react';
import {
  Terminal as TerminalIcon,
  Cpu,
  GitBranch,
  ShieldCheck,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Server,
  Layers,
  Zap,
  Lock,
  Activity,
  Sparkles,
} from 'lucide-react';
import { SiKubernetes, SiDocker, SiTerraform } from 'react-icons/si';
import { FaLinux, FaAws } from 'react-icons/fa6';
import './HeroCockpit.css';

const COMMAND_SCRIPTS = {
  docker: {
    label: 'docker run',
    icon: <SiDocker size={12} className="text-cyan-400" />,
    cmd: 'docker run -d -p 8080:80 --name web-ingress nginx:alpine',
    lines: [
      { text: "Unable to find image 'nginx:alpine' locally", type: 'dim', delay: 200 },
      { text: 'alpine: Pulling from library/nginx', type: 'dim', delay: 400 },
      { text: 'Digest: sha256:7c9e5b2149... [Verified Sigstore]', type: 'cyan', delay: 650 },
      { text: 'Status: Downloaded newer image for nginx:alpine', type: 'dim', delay: 850 },
      { text: '✓ Container c84f2910ba online on port 0.0.0.0:8080', type: 'emerald', delay: 1100 },
      { text: '✓ Socratic Check: Port 80 exposed and routing successfully', type: 'lime', delay: 1350 },
    ],
    hint: 'Container online. To inspect header routing, run curl -I localhost:8080.',
  },
  k8s: {
    label: 'kubectl get pods',
    icon: <SiKubernetes size={12} className="text-blue-400" />,
    cmd: 'kubectl get pods -n production -o wide',
    lines: [
      { text: 'NAME                          READY   STATUS    RESTARTS   AGE   IP', type: 'dim', delay: 200 },
      { text: 'api-gateway-7b98c-x9w2        1/1     Running   0          42m   10.244.1.14', type: 'emerald', delay: 400 },
      { text: 'auth-service-55c87-m8k1       1/1     Running   0          18m   10.244.2.29', type: 'emerald', delay: 650 },
      { text: 'order-processor-684b-p3q4     1/1     Running   0          12m   10.244.1.18', type: 'emerald', delay: 900 },
      { text: '✓ 3/3 microservice replicas passing active liveness probes', type: 'lime', delay: 1150 },
    ],
    hint: 'All pods healthy. To simulate node drain, execute kubectl drain worker-01.',
  },
  trivy: {
    label: 'trivy scan',
    icon: <ShieldCheck size={12} className="text-emerald-400" />,
    cmd: 'trivy image --severity HIGH,CRITICAL web-app:v2.4',
    lines: [
      { text: '2026-11-01 INFO Initializing vulnerability database v2...', type: 'dim', delay: 200 },
      { text: 'Scanning container layers [====================================>] 100%', type: 'cyan', delay: 450 },
      { text: 'Target: web-app:v2.4 (alpine 3.19.1) — Total: 0 (HIGH: 0, CRITICAL: 0)', type: 'emerald', delay: 750 },
      { text: '✓ Gate Passed: Zero CVE leaks detected. Compliant with CIS Benchmark', type: 'lime', delay: 1050 },
    ],
    hint: 'Zero vulnerabilities found. Container approved for automated staging rollout.',
  },
  terraform: {
    label: 'terraform plan',
    icon: <SiTerraform size={12} className="text-purple-400" />,
    cmd: 'terraform plan -out=prod.tfplan',
    lines: [
      { text: 'Terraform used selected providers to generate execution plan.', type: 'dim', delay: 200 },
      { text: '+ aws_vpc.production_vpc (10.0.0.0/16)', type: 'cyan', delay: 400 },
      { text: '+ aws_eks_cluster.primary_cluster (kubernetes v1.29)', type: 'cyan', delay: 650 },
      { text: 'Plan: 2 to add, 0 to change, 0 to destroy.', type: 'emerald', delay: 900 },
      { text: '✓ State locked with DynamoDB; zero cloud drift detected', type: 'lime', delay: 1150 },
    ],
    hint: 'Infrastructure dry-run validated. Run terraform apply prod.tfplan to deploy.',
  },
};

const PIPELINE_STAGES = [
  { id: 'commit', name: 'Git Commit', meta: 'main #8fa2b1', icon: <GitBranch size={13} /> },
  { id: 'lint', name: 'Lint & Test', meta: '48 tests passed', icon: <CheckCircle2 size={13} /> },
  { id: 'cve', name: 'Trivy CVE Audit', meta: '0 vulnerabilities', icon: <ShieldCheck size={13} /> },
  { id: 'build', name: 'Docker Build', meta: 'linux/amd64', icon: <SiDocker size={13} /> },
  { id: 'deploy', name: 'Helm Canary', meta: '100% healthy', icon: <SiKubernetes size={13} /> },
];

export default function HeroCockpit() {
  const [activeTab, setActiveTab] = useState('terminal');
  const [selectedScript, setSelectedScript] = useState('docker');
  const [typedText, setTypedText] = useState('');
  const [renderedLines, setRenderedLines] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);

  // K8s topology states
  const [podCount, setPodCount] = useState(3);
  const [latency, setLatency] = useState(12);

  // CI/CD Pipeline states
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStep, setPipelineStep] = useState(4);

  // Socratic Guard states
  const [socraticTier, setSocraticTier] = useState(1);

  // 3D Parallax Tilt state
  const frameRef = useRef(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 50, my: 50 });

  const handleMouseMove = (e) => {
    if (!frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = (x / rect.width) * 100;
    const py = (y / rect.height) * 100;
    const rx = ((y - rect.height / 2) / (rect.height / 2)) * -4.5;
    const ry = ((x - rect.width / 2) / (rect.width / 2)) * 4.5;
    setTilt({ rx, ry, mx: px, my: py });
  };

  const handleMouseLeave = () => {
    setTilt({ rx: 0, ry: 0, mx: 50, my: 50 });
  };

  // Live Typewriter Effect for Terminal Commands
  useEffect(() => {
    const targetCmd = COMMAND_SCRIPTS[selectedScript].cmd;
    const targetLines = COMMAND_SCRIPTS[selectedScript].lines;

    setTypedText('');
    setRenderedLines([]);
    setIsTyping(true);

    let charIdx = 0;
    const typeTimer = setInterval(() => {
      charIdx++;
      if (charIdx <= targetCmd.length) {
        setTypedText(targetCmd.slice(0, charIdx));
      } else {
        clearInterval(typeTimer);
        setIsTyping(false);

        // Stream output lines sequentially
        targetLines.forEach((line) => {
          setTimeout(() => {
            setRenderedLines((prev) => [...prev, line]);
          }, line.delay);
        });
      }
    }, 28);

    return () => clearInterval(typeTimer);
  }, [selectedScript]);

  // Ambient Telemetry Latency Jitter
  useEffect(() => {
    const jitter = setInterval(() => {
      setLatency(10 + Math.floor(Math.random() * 5));
    }, 2800);
    return () => clearInterval(jitter);
  }, []);

  // Auto-play demo cycle across tabs or scripts when idle
  useEffect(() => {
    if (!autoPlay) return;
    const scriptKeys = ['docker', 'k8s', 'trivy', 'terraform'];

    const interval = setInterval(() => {
      setSelectedScript((curr) => {
        const nextIdx = (scriptKeys.indexOf(curr) + 1) % scriptKeys.length;
        return scriptKeys[nextIdx];
      });
    }, 3200);

    return () => clearInterval(interval);
  }, [autoPlay]);

  // Interactive Pipeline Runner
  const runPipeline = () => {
    setPipelineRunning(true);
    setPipelineStep(0);
  };

  useEffect(() => {
    if (!pipelineRunning) return;
    if (pipelineStep < 4) {
      const timer = setTimeout(() => {
        setPipelineStep((prev) => prev + 1);
      }, 750);
      return () => clearTimeout(timer);
    } else {
      setPipelineRunning(false);
    }
  }, [pipelineRunning, pipelineStep]);

  return (
    <div
      className="hero-devops-studio-wrapper"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label="Interactive DevOps Platform Studio"
    >
      {/* ── Floating Satellite 1: Top Right ── */}
      <div className="satellite-badge satellite-top-right" aria-hidden="true">
        <div className="satellite-pulse-ring" />
        <span className="satellite-ping-dot" />
        <div className="satellite-text">
          <span className="satellite-title">Live Linux Sandbox</span>
          <span className="satellite-sub">{latency}ms • AWS eu-west-1</span>
        </div>
      </div>

      {/* ── Floating Satellite 2: Bottom Left ── */}
      <div className="satellite-badge satellite-bottom-left" aria-hidden="true">
        <ShieldCheck size={14} className="text-emerald-400" />
        <div className="satellite-text">
          <span className="satellite-title">Zero Solution Leaks</span>
          <span className="satellite-sub">100% Socratic Hints</span>
        </div>
        <span className="satellite-verified-pill">VERIFIED</span>
      </div>

      {/* Outer ambient glow backlight */}
      <div
        className="studio-backlight"
        style={{
          transform: `translate(${tilt.ry * 2}px, ${tilt.rx * -2}px)`,
        }}
        aria-hidden="true"
      />

      {/* Main Glassmorphic Studio Cockpit */}
      <div
        ref={frameRef}
        className="studio-frame"
        style={{
          transform: `perspective(1000px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          '--spotlight-x': `${tilt.mx}%`,
          '--spotlight-y': `${tilt.my}%`,
        }}
      >
        {/* Animated Traveling Glowing Border Beam */}
        <div className="studio-border-beam" aria-hidden="true" />

        {/* Dynamic Specular Spotlight */}
        <div className="studio-specular-spotlight" aria-hidden="true" />

        {/* ── Studio Header Bar ── */}
        <div className="studio-header">
          {/* Mac Traffic Lights */}
          <div className="studio-traffic-lights" aria-hidden="true">
            <span className="dot dot-close" />
            <span className="dot dot-min" />
            <span className="dot dot-max" />
          </div>

          {/* Interactive Mode Tabs */}
          <nav className="studio-nav-tabs" aria-label="DevOps Studio Modes">
            <button
              type="button"
              className={`studio-tab ${activeTab === 'terminal' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('terminal');
                setAutoPlay(false);
              }}
              aria-selected={activeTab === 'terminal'}
            >
              <TerminalIcon size={13} className="tab-icon" />
              <span>Linux Sandbox</span>
            </button>

            <button
              type="button"
              className={`studio-tab ${activeTab === 'topology' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('topology');
                setAutoPlay(false);
              }}
              aria-selected={activeTab === 'topology'}
            >
              <SiKubernetes size={13} className="tab-icon text-blue-400" />
              <span>K8s Topology</span>
              <span className="tab-pill-indicator">{podCount} Pods</span>
            </button>

            <button
              type="button"
              className={`studio-tab ${activeTab === 'pipeline' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('pipeline');
                setAutoPlay(false);
              }}
              aria-selected={activeTab === 'pipeline'}
            >
              <GitBranch size={13} className="tab-icon text-cyan-400" />
              <span>CI/CD Pipeline</span>
            </button>

            <button
              type="button"
              className={`studio-tab ${activeTab === 'socratic' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('socratic');
                setAutoPlay(false);
              }}
              aria-selected={activeTab === 'socratic'}
            >
              <ShieldCheck size={13} className="tab-icon text-emerald-400" />
              <span>Socratic Guard</span>
              <span className="tab-live-badge">Guarded</span>
            </button>
          </nav>

          {/* Auto-Play Toggle & Status */}
          <div className="studio-header-right">
            <button
              type="button"
              className={`studio-autoplay-btn ${autoPlay ? 'active' : ''}`}
              onClick={() => setAutoPlay(!autoPlay)}
              title={autoPlay ? 'Pause Live Demo' : 'Start Live Demo'}
            >
              {autoPlay ? <Pause size={10} /> : <Play size={10} />}
              <span>{autoPlay ? 'Live Demo' : 'Interactive'}</span>
            </button>
          </div>
        </div>

        {/* ── Dynamic Studio Content View ── */}
        <div className="studio-viewport">
          {/* ════ VIEW 1: Interactive Linux Terminal ════ */}
          {activeTab === 'terminal' && (
            <div className="view-terminal animate-fade-in">
              {/* Quick Preset Command Chips */}
              <div className="terminal-quick-chips">
                <span className="chip-label">Interactive Run:</span>
                {Object.keys(COMMAND_SCRIPTS).map((key) => {
                  const item = COMMAND_SCRIPTS[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`quick-chip terminal-tab-btn ${selectedScript === key ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedScript(key);
                        setAutoPlay(false);
                      }}
                    >
                      {item.icon} {item.label}
                    </button>
                  );
                })}
              </div>

              {/* Monospace Terminal Body */}
              <div className="terminal-code-canvas">
                <div className="cli-line">
                  <span className="cli-user">ops@academy</span>
                  <span className="cli-colon">:</span>
                  <span className="cli-path">~/production</span>
                  <span className="cli-dollar">$</span>{' '}
                  <span className="cli-cmd">{typedText}</span>
                  {isTyping && <span className="cli-cursor active">█</span>}
                </div>

                <div className="cli-output-block">
                  {renderedLines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`cli-output-line type-${line.type} animate-line-slide`}
                      style={{ animationDelay: `${idx * 40}ms` }}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>

                {!isTyping && (
                  <div className="cli-prompt-line">
                    <span className="cli-user">ops@academy</span>
                    <span className="cli-colon">:</span>
                    <span className="cli-path">~/production</span>
                    <span className="cli-dollar">$</span>{' '}
                    <span className="cli-cursor" aria-hidden="true">█</span>
                  </div>
                )}
              </div>

              {/* Bottom Socratic Mentor Peek */}
              <div className="terminal-mentor-bar">
                <div className="mentor-bar-left">
                  <div className="mentor-avatar-badge">
                    <Zap size={14} className="text-lime-300" />
                  </div>
                  <div className="mentor-nudge-text">
                    <span className="nudge-title">Socratic Guidance:</span>
                    <span className="nudge-desc">{COMMAND_SCRIPTS[selectedScript].hint}</span>
                  </div>
                </div>
                <span className="leak-badge">
                  <Lock size={11} /> Leak Guard Active
                </span>
              </div>
            </div>
          )}

          {/* ════ VIEW 2: Interactive K8s Topology Map ════ */}
          {activeTab === 'topology' && (
            <div className="view-topology animate-fade-in">
              <div className="topology-toolbar">
                <div className="topology-title-wrap">
                  <span className="topology-title">Production Ingress &amp; Pod Mesh</span>
                  <span className="topology-sub">EKS Cluster v1.29 • AWS eu-west-1</span>
                </div>
                <div className="topology-controls">
                  <button
                    type="button"
                    className="topo-action-btn"
                    onClick={() => setPodCount((c) => (c >= 5 ? 3 : c + 1))}
                    title="Scale pods to observe horizontal pod autoscaler"
                  >
                    <Layers size={13} /> Scale Pods ({podCount} Replicas)
                  </button>
                </div>
              </div>

              {/* Visual Node Graph with Animated Packet Beams */}
              <div className="topology-graph">
                {/* Step 1: Ingress Gate */}
                <div className="topo-node ingress-node">
                  <div className="node-icon-box ingress-box">
                    <Server size={16} />
                  </div>
                  <div className="node-info">
                    <span className="node-name">ALB Ingress</span>
                    <span className="node-status text-emerald-400">● 100% Healthy</span>
                  </div>
                  <span className="node-metric">{latency}ms latency</span>
                </div>

                {/* SVG Animated Connector Flow */}
                <div className="topo-connector" aria-hidden="true">
                  <svg viewBox="0 0 50 20" className="connector-svg">
                    <line x1="0" y1="10" x2="50" y2="10" stroke="#4ade80" strokeWidth="2" strokeDasharray="4 4" className="flow-dash" />
                    <circle cx="25" cy="10" r="3" fill="#bef264" className="flow-packet" />
                  </svg>
                </div>

                {/* Step 2: Microservice Cluster Pods */}
                <div className="topo-cluster-area">
                  <div className="cluster-header">
                    <span>Namespace: <code>production-api</code></span>
                    <span className="cluster-ready">READY {podCount}/{podCount}</span>
                  </div>
                  <div className="pod-grid">
                    {Array.from({ length: podCount }).map((_, i) => (
                      <div key={i} className="pod-item animate-pod-in">
                        <div className="pod-pulse-dot" />
                        <span className="pod-name">api-pod-0{i + 1}</span>
                        <span className="pod-cpu">CPU {12 + i * 2}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SVG Animated Connector Flow */}
                <div className="topo-connector" aria-hidden="true">
                  <svg viewBox="0 0 50 20" className="connector-svg">
                    <line x1="0" y1="10" x2="50" y2="10" stroke="#38bdf8" strokeWidth="2" strokeDasharray="4 4" className="flow-dash" />
                    <circle cx="25" cy="10" r="3" fill="#38bdf8" className="flow-packet" />
                  </svg>
                </div>

                {/* Step 3: State & Cache */}
                <div className="topo-node db-node">
                  <div className="node-icon-box db-box">
                    <Cpu size={16} />
                  </div>
                  <div className="node-info">
                    <span className="node-name">Redis + RDS</span>
                    <span className="node-status text-cyan-400">● Sub-ms Cache</span>
                  </div>
                  <span className="node-metric">Zero Failover</span>
                </div>
              </div>

              {/* Topology Telemetry Strip */}
              <div className="topology-stats-strip">
                <div className="topo-stat-cell">
                  <span className="stat-label">CLUSTER UPTIME</span>
                  <span className="stat-val text-emerald-400">99.995%</span>
                </div>
                <div className="topo-stat-cell">
                  <span className="stat-label">AUTO-HEAL ENGINE</span>
                  <span className="stat-val text-lime-400">ACTIVE</span>
                </div>
                <div className="topo-stat-cell">
                  <span className="stat-label">INGRESS TLS</span>
                  <span className="stat-val text-cyan-400">Cert-Manager v1.13</span>
                </div>
              </div>
            </div>
          )}

          {/* ════ VIEW 3: Animated CI/CD Pipeline ════ */}
          {activeTab === 'pipeline' && (
            <div className="view-pipeline animate-fade-in">
              <div className="pipeline-topbar">
                <div className="pipeline-meta">
                  <span className="pipe-branch"><GitBranch size={13} /> pipeline / main</span>
                  <span className="pipe-hash">Commit #8fa2b1 — "Secure Helm Canary Ingress"</span>
                </div>
                <button
                  type="button"
                  className="pipe-run-btn"
                  onClick={runPipeline}
                  disabled={pipelineRunning}
                >
                  <Play size={12} fill="currentColor" /> {pipelineRunning ? 'Deploying...' : 'Trigger Pipeline'}
                </button>
              </div>

              {/* Horizontal Pipeline Steps */}
              <div className="pipeline-stepper">
                {PIPELINE_STAGES.map((st, i) => {
                  const isPassed = i <= pipelineStep;
                  const isCurrent = i === pipelineStep && pipelineRunning;
                  return (
                    <div key={st.id} className="pipeline-step-wrap">
                      <div className={`pipeline-step-card ${isPassed ? 'passed' : ''} ${isCurrent ? 'running' : ''}`}>
                        <div className="step-icon-wrap">
                          {isCurrent ? <RotateCcw size={14} className="animate-spin text-lime-400" /> : st.icon}
                        </div>
                        <div className="step-body">
                          <span className="step-name">{st.name}</span>
                          <span className="step-meta">{isCurrent ? 'Executing stage...' : st.meta}</span>
                        </div>
                        <span className="step-status-badge">
                          {isPassed && !isCurrent && <CheckCircle2 size={13} className="text-emerald-400" />}
                          {isCurrent && <span className="stage-pulse" />}
                        </span>
                      </div>
                      {i < PIPELINE_STAGES.length - 1 && (
                        <div className={`step-connector-line ${i < pipelineStep ? 'passed' : ''}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Execution Console Output */}
              <div className="pipeline-log-console">
                <div className="console-line text-slate-400">
                  [14:28:01] ⚡ Webhook triggered by GitHub push event to refs/heads/main
                </div>
                <div className="console-line text-cyan-400">
                  [14:28:02] 🛡️ Trivy container vulnerability scanner: 0 High/Critical findings
                </div>
                <div className="console-line text-emerald-400">
                  [14:28:04] ⎈ Helm rolling upgrade: 100% traffic shifted to canary pods with 0 5xx responses
                </div>
                <div className="console-line text-lime-300">
                  [14:28:05] ✓ Deployment verified healthy across 3 availability zones in AWS
                </div>
              </div>
            </div>
          )}

          {/* ════ VIEW 4: Socratic Leak Guard Inspector ════ */}
          {activeTab === 'socratic' && (
            <div className="view-socratic animate-fade-in">
              <div className="socratic-header">
                <div className="socratic-title-group">
                  <span className="socratic-title">Multi-Tier Socratic AI Mentor</span>
                  <span className="socratic-sub">Real-Time Solution Leak Guard &amp; Diagnostic Engine</span>
                </div>
                <div className="tier-pills">
                  <button
                    type="button"
                    className={`tier-btn ${socraticTier === 1 ? 'active' : ''}`}
                    onClick={() => setSocraticTier(1)}
                  >
                    Tier 1: Nudge
                  </button>
                  <button
                    type="button"
                    className={`tier-btn ${socraticTier === 2 ? 'active' : ''}`}
                    onClick={() => setSocraticTier(2)}
                  >
                    Tier 2: Diagnostic
                  </button>
                  <button
                    type="button"
                    className={`tier-btn ${socraticTier === 3 ? 'active' : ''}`}
                    onClick={() => setSocraticTier(3)}
                  >
                    Tier 3: Syntax
                  </button>
                </div>
              </div>

              {/* Dual Column: Student Question vs Filtered Socratic Guidance */}
              <div className="socratic-comparison-grid">
                <div className="socratic-card student-query-card">
                  <div className="card-tag tag-student">STUDENT PROMPT (LAB #04)</div>
                  <p className="query-text">
                    "My nginx container keeps failing with <code>CrashLoopBackOff</code>. Tell me the exact bash command and configuration file to fix it."
                  </p>
                  <div className="leak-intercept-banner">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span>Direct Solution Request Detected &amp; Intercepted</span>
                  </div>
                </div>

                <div className="socratic-card ai-response-card animate-card-shift">
                  <div className="card-tag tag-mentor">
                    SOCRATIC GUIDANCE ({socraticTier === 1 ? 'TIER 1 CONCEPTUAL' : socraticTier === 2 ? 'TIER 2 DIAGNOSTIC' : 'TIER 3 SYNTAX STRUCTURE'})
                  </div>
                  {socraticTier === 1 && (
                    <p className="guidance-text">
                      "When a container exits immediately with <code>CrashLoopBackOff</code>, the foreground PID 1 process likely terminated. What does <code>kubectl logs &lt;pod-name&gt;</code> reveal about nginx's daemon mode?"
                    </p>
                  )}
                  {socraticTier === 2 && (
                    <p className="guidance-text">
                      "Inspect the pod's exit code with <code>kubectl describe pod</code>. If exit code is 0, nginx was told to daemonize (run in background). Containers require the main process to remain in foreground."
                    </p>
                  )}
                  {socraticTier === 3 && (
                    <p className="guidance-text">
                      "Check your Dockerfile <code>CMD</code> or config. Add directive <code>daemon off;</code> to your nginx command so the process occupies PID 1 without forking."
                    </p>
                  )}
                  <div className="guidance-footer">
                    <span className="guarantee-badge">✓ 0% Code Leaked • 100% Problem-Solving Retained</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Studio Bottom Telemetry Bar ── */}
        <div className="studio-footer">
          <div className="footer-metric">
            <span className="metric-dot" />
            <span className="metric-label">19 Interactive Labs</span>
          </div>
          <div className="footer-metric">
            <FaLinux size={13} className="text-amber-400" />
            <span className="metric-label">Root Linux Sandboxes</span>
          </div>
          <div className="footer-metric">
            <FaAws size={15} className="text-amber-400" />
            <span className="metric-label">AWS Cloud Environments</span>
          </div>
          <div className="footer-metric">
            <ShieldCheck size={13} className="text-emerald-400" />
            <span className="metric-label">Zero Leak Guarantee</span>
          </div>
        </div>
      </div>
    </div>
  );
}
