import { useState, useEffect } from 'react';
import {
  Zap,
  Rocket,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  Cpu,
  Layers,
  GitBranch,
  Award,
  ArrowRight,
  Play,
  Pause,
  AlertCircle,
  HelpCircle,
  Lock,
} from 'lucide-react';
import { FaLinux, FaAws, FaDocker } from 'react-icons/fa6';
import { SiKubernetes, SiTerraform } from 'react-icons/si';
import './CampusPlacementPathwayDiagram.css';

const PATHWAYS = {
  sprint: {
    id: 'sprint',
    badge: '3RD & 4TH YEAR FAST-TRACK',
    title: '60-Day Placement Sprint',
    target: 'Cracking 8–14 LPA Campus Offers',
    subtitle: 'Starting from scratch? Zero panic. Master high-yield interview topics in 60 days.',
    accent: '#bef264',
    nodes: [
      {
        id: 'n1',
        stage: 'WEEK 1–2',
        title: 'Linux CLI & Socket Diagnostics',
        icon: <FaLinux size={18} className="text-amber-400" />,
        highlight: 'Interview Core',
        skills: ['Permissions 755', 'systemd daemons', 'netstat/ss ports', 'cron automation'],
        interviewQ: 'Why does curl localhost fail if the service is listening on 127.0.0.1 instead of 0.0.0.0?',
        automatedCheck: 'Kernel Check #1: Process PID bound to public socket with valid exit status',
      },
      {
        id: 'n2',
        stage: 'WEEK 3–4',
        title: 'Docker Micro-Containers & AWS VPC',
        icon: <FaDocker size={18} className="text-cyan-400" />,
        highlight: 'Containers & Cloud',
        skills: ['Alpine multi-stage', 'Bridge networks', 'AWS EC2 & Security Groups', 'Nginx reverse proxy'],
        interviewQ: 'What happens to files written inside a container when it crashes without a volume mount?',
        automatedCheck: 'Kernel Check #2: Multi-stage container under 25MB exposing port 8080',
      },
      {
        id: 'n3',
        stage: 'WEEK 5–7',
        title: 'Kubernetes Pods & Self-Healing',
        icon: <SiKubernetes size={18} className="text-blue-400" />,
        highlight: 'High Package Key',
        skills: ['Deployments & Services', 'CrashLoopBackOff triage', 'Ingress routing', 'Liveness probes'],
        interviewQ: 'How do you triage a pod that is stuck in CrashLoopBackOff with exit code 137 vs code 1?',
        automatedCheck: 'Kernel Check #3: Pod recovers automatically from simulated node drain',
      },
      {
        id: 'n4',
        stage: 'WEEK 8',
        title: 'Screen-Share Interview Outage Labs',
        icon: <ShieldCheck size={18} className="text-emerald-400" />,
        highlight: 'Placement Clearance',
        skills: ['Live terminal debugging', 'Zero ChatGPT crutch', 'Latency triage', 'Root-cause writeup'],
        interviewQ: 'Simulate a live production outage: Recover an e-commerce API failing health checks in 5 minutes.',
        automatedCheck: 'Placement Gate: 100% Automated check clearance with verified credential',
      },
    ],
  },
  advanced: {
    id: 'advanced',
    badge: 'AMBITIOUS 1ST/2ND YEARS & PRODIGIES',
    title: 'Advanced Cloud Architect Track',
    target: 'Targeting 16–24+ LPA Product Roles',
    subtitle: 'Already know Linux & basic Docker? Skip the basics. Build enterprise infrastructure.',
    accent: '#38bdf8',
    nodes: [
      {
        id: 'n1-adv',
        stage: 'PHASE 1',
        title: 'Production Kubernetes (EKS Mesh)',
        icon: <SiKubernetes size={18} className="text-blue-400" />,
        highlight: 'Multi-Tenant K8s',
        skills: ['Ingress TLS Cert-Manager', 'HPA horizontal autoscale', 'RBAC security', 'NetworkPolicies'],
        interviewQ: 'How do you prevent a compromised frontend pod from communicating with the database pod in K8s?',
        automatedCheck: 'Kernel Check: NetworkPolicy restricts inter-pod ingress with zero packet leaks',
      },
      {
        id: 'n2-adv',
        stage: 'PHASE 2',
        title: 'Infrastructure as Code (Terraform)',
        icon: <SiTerraform size={18} className="text-purple-400" />,
        highlight: 'Automated Cloud',
        skills: ['Modular HCL', 'DynamoDB state locking', 'Remote S3 backends', 'Cloud drift detection'],
        interviewQ: 'What happens when two engineers run terraform apply simultaneously on production state?',
        automatedCheck: 'Kernel Check: State lock mutex enforced with zero uncommitted drift',
      },
      {
        id: 'n3-adv',
        stage: 'PHASE 3',
        title: 'Zero-Trust CI/CD & DevSecOps',
        icon: <GitBranch size={18} className="text-cyan-400" />,
        highlight: 'Security Automation',
        skills: ['Trivy container scan', 'Gitleaks secret detection', 'ArgoCD canary rollout', 'Cosign signatures'],
        interviewQ: 'How do you block deployment of an image containing CVEs without halting the pipeline engine?',
        automatedCheck: 'Kernel Check: Automated gate rejects vulnerable image with exit code 2',
      },
      {
        id: 'n4-adv',
        stage: 'PHASE 4',
        title: 'Production Incident & Chaos SRE',
        icon: <Award size={18} className="text-emerald-400" />,
        highlight: 'Tier-1 Engineering',
        skills: ['Prometheus PromQL', 'Grafana alerting', 'P99 latency debugging', 'SLO breach recovery'],
        interviewQ: 'Debug a distributed memory leak causing P99 latency spikes in an asynchronous queue.',
        automatedCheck: 'Placement Gate: Cleared Senior SRE screening criteria with verified badge',
      },
    ],
  },
  foundations: {
    id: 'foundations',
    badge: 'ZERO-DOUBT EXPLORATION',
    title: 'Zero-to-One Foundations',
    target: 'Complete Command-Line Fluency',
    subtitle: 'Never touched a Linux terminal? Afraid of the black screen? Step-by-step fluency.',
    accent: '#fbbf24',
    nodes: [
      {
        id: 'n1-fnd',
        stage: 'STEP 1',
        title: 'Command Line Muscle Memory',
        icon: <Terminal size={18} className="text-amber-400" />,
        highlight: 'Zero Fear',
        skills: ['File systems navigation', 'Pipes & redirection', 'Nano & Vim basics', 'User & groups'],
        interviewQ: 'Explain what happens under the hood when you execute a piped command like cat log | grep error.',
        automatedCheck: 'Kernel Check: Shell pipeline parsed and executed with zero syntax errors',
      },
      {
        id: 'n2-fnd',
        stage: 'STEP 2',
        title: 'Networking & Web Protocols',
        icon: <Cpu size={18} className="text-emerald-400" />,
        highlight: 'Internet Plumbing',
        skills: ['TCP 3-way handshake', 'DNS record propagation', 'HTTP/HTTPS status codes', 'SSH tunnels'],
        interviewQ: 'What are the exact network hops when a client browser types https://amazon.com?',
        automatedCheck: 'Kernel Check: SSH keypair generated and public key installed with 600 permissions',
      },
      {
        id: 'n3-fnd',
        stage: 'STEP 3',
        title: 'Git Version Control Mastery',
        icon: <GitBranch size={18} className="text-orange-400" />,
        highlight: 'Team Collaboration',
        skills: ['Branching strategies', 'Interactive rebase', 'Merge conflicts resolution', 'PR workflows'],
        interviewQ: 'How does git rebase differ from git merge, and when should you avoid rebasing?',
        automatedCheck: 'Kernel Check: 3-way merge conflict resolved with clean Git commit graph',
      },
      {
        id: 'n4-fnd',
        stage: 'STEP 4',
        title: 'First Cloud Container Deployment',
        icon: <FaDocker size={18} className="text-cyan-400" />,
        highlight: 'First Real Project',
        skills: ['Dockerfile creation', 'Docker compose stacks', 'Environment variables', 'Port binding'],
        interviewQ: 'Build and deploy a full-stack app with frontend, backend, and PostgreSQL database.',
        automatedCheck: 'Kernel Check: Multi-container compose stack online and responding on port 80',
      },
    ],
  },
};

export default function CampusPlacementPathwayDiagram() {
  const [activePathway, setActivePathway] = useState('sprint');
  const [selectedNodeIndex, setSelectedNodeIndex] = useState(0);
  const [autoTour, setAutoTour] = useState(false);

  const currentPath = PATHWAYS[activePathway];
  const currentNode = currentPath.nodes[selectedNodeIndex] || currentPath.nodes[0];

  // Auto-tour through the pathway stages
  useEffect(() => {
    if (!autoTour) return;
    const interval = setInterval(() => {
      setSelectedNodeIndex((prev) => (prev + 1) % currentPath.nodes.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [autoTour, currentPath.nodes.length]);

  const handlePathwayChange = (key) => {
    setActivePathway(key);
    setSelectedNodeIndex(0);
    setAutoTour(false);
  };

  return (
    <div className="placement-pathways-container" aria-label="Adaptive Placement Pathways Diagram">
      {/* ── Section Header Strip ── */}
      <div className="pathway-header-strip">
        <div className="pathway-kicker">
          <span className="kicker-glow-dot" />
          <span>ADAPTIVE CAMPUS PLACEMENT BLUEPRINT</span>
        </div>
        <h2 className="pathway-main-title">
          Start From Where You Are. <span className="title-highlight">Finish at 8–24 LPA.</span>
        </h2>
        <p className="pathway-main-subtitle">
          Whether you're a 4th year starting Cloud today for upcoming placement drives, or a 1st year prodigy ready to deploy Kubernetes clusters — select your track and see the exact journey.
        </p>

        {/* ── Interactive Pathway Toggles ── */}
        <div className="pathway-selector-pills">
          <button
            type="button"
            className={`path-pill-btn ${activePathway === 'sprint' ? 'active-sprint' : ''}`}
            onClick={() => handlePathwayChange('sprint')}
          >
            <Zap size={14} className="pill-icon" />
            <span className="pill-text-wrap">
              <span className="pill-name">60-Day Placement Sprint</span>
              <span className="pill-meta">For 3rd/4th Years • Zero to Hired</span>
            </span>
          </button>

          <button
            type="button"
            className={`path-pill-btn ${activePathway === 'advanced' ? 'active-advanced' : ''}`}
            onClick={() => handlePathwayChange('advanced')}
          >
            <Rocket size={14} className="pill-icon" />
            <span className="pill-text-wrap">
              <span className="pill-name">Advanced Architect Track</span>
              <span className="pill-meta">For 1st/2nd Years • 16–24 LPA</span>
            </span>
          </button>

          <button
            type="button"
            className={`path-pill-btn ${activePathway === 'foundations' ? 'active-foundations' : ''}`}
            onClick={() => handlePathwayChange('foundations')}
          >
            <Terminal size={14} className="pill-icon" />
            <span className="pill-text-wrap">
              <span className="pill-name">Zero-to-One Foundations</span>
              <span className="pill-meta">Complete Command-Line Fluency</span>
            </span>
          </button>
        </div>
      </div>

      {/* ── Main Interactive Pathway Roadmap Board ── */}
      <div className="pathway-board-frame">
        {/* Top Control Ribbon */}
        <div className="board-top-ribbon">
          <div className="board-track-badge" style={{ borderColor: currentPath.accent }}>
            <span className="badge-pulse-dot" style={{ backgroundColor: currentPath.accent }} />
            <span className="badge-label">{currentPath.badge}</span>
            <span className="badge-target">• {currentPath.target}</span>
          </div>

          <div className="board-auto-tour-wrap">
            <button
              type="button"
              className={`auto-tour-btn ${autoTour ? 'active' : ''}`}
              onClick={() => setAutoTour(!autoTour)}
            >
              {autoTour ? <Pause size={11} /> : <Play size={11} />}
              <span>{autoTour ? 'Auto Tour Playing' : 'Auto Tour'}</span>
            </button>
          </div>
        </div>

        {/* ── Visual Node Pipeline with Animated Flow Lasers ── */}
        <div className="pathway-visual-pipeline">
          {/* Animated SVG Connector Line spanning all stages */}
          <div className="pipeline-svg-carrier" aria-hidden="true">
            <svg className="carrier-svg" viewBox="0 0 1000 40" preserveAspectRatio="none">
              <line
                x1="40"
                y1="20"
                x2="960"
                y2="20"
                stroke="rgba(74, 222, 128, 0.2)"
                strokeWidth="2"
              />
              <line
                x1="40"
                y1="20"
                x2="960"
                y2="20"
                stroke={currentPath.accent}
                strokeWidth="2.5"
                strokeDasharray="8 12"
                className="animated-laser-beam"
              />
            </svg>
          </div>

          {/* 4 Interactive Milestones */}
          <div className="pipeline-nodes-row">
            {currentPath.nodes.map((node, index) => {
              const isSelected = index === selectedNodeIndex;
              return (
                <div
                  key={node.id}
                  className={`pipeline-node-card ${isSelected ? 'node-selected' : ''}`}
                  onClick={() => {
                    setSelectedNodeIndex(index);
                    setAutoTour(false);
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    '--node-accent': currentPath.accent,
                  }}
                >
                  <div className="node-top-tag">
                    <span className="node-stage-num">{node.stage}</span>
                    <span className="node-highlight-chip">{node.highlight}</span>
                  </div>

                  <div className="node-icon-header">
                    <div className="node-icon-bubble">
                      {node.icon}
                    </div>
                    <span className="node-step-circle">{index + 1}</span>
                  </div>

                  <h3 className="node-title">{node.title}</h3>

                  <div className="node-skill-pills">
                    {node.skills.slice(0, 3).map((sk, sIdx) => (
                      <span key={sIdx} className="skill-mini-pill">
                        <CheckCircle2 size={10} className="check-bullet" />
                        {sk}
                      </span>
                    ))}
                  </div>

                  {isSelected && <div className="node-active-glow-beam" />}
                </div>
              );
            })}

            {/* Final Target Destination: 8–24 LPA Placement Gate */}
            <div className="pipeline-finish-card">
              <div className="finish-trophy-bubble">
                <Award size={22} className="text-amber-300" />
              </div>
              <div className="finish-tag">PLACEMENT READY</div>
              <div className="finish-package">8–24 LPA</div>
              <span className="finish-sub">Razorpay • Cisco • AWS • Top Startups</span>
              <div className="finish-badges">
                <span className="f-badge">✓ Live Screen-Share Proof</span>
                <span className="f-badge">✓ Zero ChatGPT Crutch</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Active Stage Deep-Dive Inspector (Shows Live Interview Questions) ── */}
        <div className="pathway-stage-inspector">
          <div className="inspector-left">
            <div className="inspector-kicker">
              <span className="inspector-num">STAGE {selectedNodeIndex + 1} DEEP DIVE:</span>
              <span className="inspector-name">{currentNode.title}</span>
            </div>
            <div className="inspector-skills-list">
              {currentNode.skills.map((s, idx) => (
                <span key={idx} className="inspector-skill-tag">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="inspector-right">
            {/* Campus Technical Interview Question Asked at this Stage */}
            <div className="interview-q-card">
              <div className="q-label">
                <HelpCircle size={13} className="text-amber-400" />
                <span>WHAT CAMPUS RECRUITERS ASK IN LIVE INTERVIEWS:</span>
              </div>
              <p className="q-text">"{currentNode.interviewQ}"</p>
            </div>

            {/* Real Automated Lab Verification Check */}
            <div className="automated-check-card">
              <div className="check-label">
                <ShieldCheck size={13} className="text-emerald-400" />
                <span>OPSACADEMY LIVE KERNEL TEST:</span>
              </div>
              <p className="check-text">{currentNode.automatedCheck}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
