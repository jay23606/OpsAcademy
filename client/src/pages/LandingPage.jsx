import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield,
  Brain,
  Cpu,
  ChevronDown,
  ChevronUp,
  Zap,
  ArrowRight,
  Lock,
  CheckCircle2,
  Sparkles,
  Globe,
  Code2,
  Search,
  Terminal,
  Play,
  RotateCcw,
  Check,
  Star,
  Users,
  Award,
  Layers,
  Server,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
  GraduationCap,
} from 'lucide-react';
import {
  FaAws,
  FaJenkins,
  FaDocker,
  FaLinux,
  FaGitAlt,
  FaPython,
} from 'react-icons/fa6';
import {
  SiKubernetes,
  SiGrafana,
  SiTerraform,
  SiArgo,
} from 'react-icons/si';
import HeroCockpit from '../components/HeroCockpit/HeroCockpit';
import CampusPlacementPathwayDiagram from '../components/CampusPlacementPathway/CampusPlacementPathwayDiagram';
import './LandingPage.css';

const HERO_COMMANDS = [
  {
    cmd: 'docker run -d -p 80:80 --name web nginx:alpine',
    label: 'Docker Run',
    output: [
      { text: "Unable to find image 'nginx:alpine' locally", type: 'dim' },
      { text: 'alpine: Pulling from library/nginx', type: 'dim' },
      { text: 'Digest: sha256:48b77a32b2170c2a84b5... [Verified]', type: 'cyan' },
      { text: 'Status: Downloaded newer image for nginx:alpine', type: 'dim' },
      { text: 'e8b91a72f04dc238a91c01e523f... (Container online)', type: 'emerald' },
      { text: '✓ Port 80 exposed on 0.0.0.0:80 -> HTTP/1.1 200 OK', type: 'lime' },
    ],
  },
  {
    cmd: 'kubectl get pods -n production -o wide',
    label: 'K8s Cluster',
    output: [
      { text: 'NAME                          READY   STATUS    RESTARTS   AGE   IP', type: 'dim' },
      { text: 'nginx-ingress-79d8c97-q8w2    1/1     Running   0          42m   10.244.1.14', type: 'emerald' },
      { text: 'api-gateway-55c87b99c-x7k9    1/1     Running   0          18m   10.244.2.29', type: 'emerald' },
      { text: 'auth-service-674b8849-p2m1    1/1     Running   0          18m   10.244.1.18', type: 'emerald' },
      { text: '✓ All 3 services healthy and passing liveness probes', type: 'lime' },
    ],
  },
  {
    cmd: 'trivy image --severity HIGH,CRITICAL web-app:v1',
    label: 'CVE Scan',
    output: [
      { text: '2026-10-30 INFO Vulnerability scanning started...', type: 'dim' },
      { text: 'Analyzing layers [=====================>] 100%', type: 'cyan' },
      { text: 'web-app:v1 (alpine 3.19.1) — Total: 0 (HIGH: 0, CRITICAL: 0)', type: 'emerald' },
      { text: '✓ Container image passed all compliance security gates', type: 'lime' },
    ],
  },
  {
    cmd: 'terraform plan -out=tfplan.binary',
    label: 'IaC Drift',
    output: [
      { text: 'Terraform used the selected providers to generate the plan.', type: 'dim' },
      { text: '+ aws_vpc.production_network (10.0.0.0/16)', type: 'cyan' },
      { text: '+ aws_security_group.ingress_tls_rules', type: 'cyan' },
      { text: 'Plan: 2 to add, 0 to change, 0 to destroy.', type: 'emerald' },
      { text: '✓ State locked with DynamoDB, ready for zero-drift apply', type: 'lime' },
    ],
  },
];

const CURRICULUM_COURSES = [
  { id: 'linux-basics', title: 'Linux Fundamentals', category: 'Linux', icon: <FaLinux size={22} className="text-amber-400" />, sections: '8 Deep-Dive Modules', group: 'foundations', desc: 'CLI mastery, file permissions, process management, and systemd automation.' },
  { id: 'git-basics', title: 'Git & GitHub Workflow', category: 'Version Control', icon: <FaGitAlt size={22} className="text-orange-500" />, sections: '7 Deep-Dive Modules', group: 'foundations', desc: 'Branching strategies, interactive rebasing, merge conflicts, and PR reviews.' },
  { id: 'docker-basics', title: 'Docker Containers', category: 'Containers', icon: <FaDocker size={22} className="text-cyan-400" />, sections: '8 Deep-Dive Modules', group: 'cloud', desc: 'Multi-stage Dockerfiles, compose stacks, and isolated container networks.' },
  { id: 'kubernetes-basics', title: 'Kubernetes Orchestration', category: 'Kubernetes', icon: <SiKubernetes size={22} className="text-blue-500" />, sections: '8 Deep-Dive Modules', group: 'cloud', desc: 'Pods, Deployments, ClusterIP, Ingress TLS, ConfigMaps, and Helm Charts.' },
  { id: 'networking-fundamentals', title: 'Networking Fundamentals', category: 'Networking', icon: <Globe size={22} className="text-green-400" />, sections: '6 Deep-Dive Modules', group: 'foundations', desc: 'TCP/IP 3-way handshake, DNS records, HTTP/S, SSH tunnels, and firewalls.' },
  { id: 'cicd-jenkins', title: 'CI/CD & Jenkins Pipelines', category: 'CI/CD', icon: <FaJenkins size={22} className="text-red-400" />, sections: '6 Deep-Dive Modules', group: 'cloud', desc: 'Automated build matrices, secret leak scanning, and staging deployment.' },
  { id: 'aws-cloud-essentials', title: 'AWS Cloud Essentials', category: 'Cloud Architecture', icon: <FaAws size={22} className="text-amber-500" />, sections: '6 Deep-Dive Modules', group: 'cloud', desc: 'VPC subnets, EC2 auto-scaling, S3 IAM policies, RDS, and ALB load balancers.' },
  { id: 'endpoint-security', title: 'Enterprise Endpoint Security', category: 'EPP • EDR • XDR', icon: <Shield size={22} className="text-cyan-400" />, sections: '5 Enterprise Modules', group: 'security', isNew: true, desc: 'EPP/EDR/XDR architecture, Defender GPO, and CrowdStrike API host isolation.' },
  { id: 'digital-forensics', title: 'Digital Forensics (DFIR)', category: 'Forensics & IR', icon: <Search size={22} className="text-purple-400" />, sections: '5 Forensic Modules', group: 'security', isNew: true, desc: '5-stage DFIR methodology, Volatility 3 RAM dumps, and NTFS $MFT analysis.' },
  { id: 'monitoring-observability', title: 'Monitoring & Grafana', category: 'Observability', icon: <SiGrafana size={22} className="text-orange-400" />, sections: '5 Deep-Dive Modules', group: 'cloud', desc: 'Prometheus metrics, PromQL queries, and real-time Grafana dashboards.' },
  { id: 'terraform-iac', title: 'Terraform & IaC', category: 'Infrastructure', icon: <SiTerraform size={22} className="text-purple-400" />, sections: '4 Deep-Dive Modules', group: 'cloud', desc: 'Declarative HCL, modular state management, and cloud drift detection.' },
  { id: 'system-design', title: 'System Design & Scalability', category: 'System Design', icon: <Cpu size={22} className="text-cyan-400" />, sections: '4 Deep-Dive Modules', group: 'foundations', desc: 'High availability, load balancing, caching, database sharding, and CAP theorem.' },
  { id: 'devsecops-security', title: 'DevSecOps & Cloud Security', category: 'Security', icon: <Lock size={22} className="text-emerald-400" />, sections: '4 Deep-Dive Modules', group: 'security', desc: 'Secret scanning, Trivy container audits, OWASP Top 10, and GuardDuty triage.' },
  { id: 'bash-automation', title: 'Advanced Bash Automation', category: 'Automation', icon: <Code2 size={22} className="text-cyan-400" />, sections: '2 Deep-Dive Modules', group: 'automation', desc: 'Production shell scripts, cron scheduling, awk/sed text processing, and logging.' },
  { id: 'python-devops-automation', title: 'Python Cloud Automation', category: 'Automation', icon: <FaPython size={22} className="text-blue-400" />, sections: '2 Deep-Dive Modules', group: 'automation', desc: 'Python 3.11 log parsers, boto3 AWS automation, and CLI tooling.' },
  { id: 'gitops-argocd', title: 'GitOps & ArgoCD', category: 'GitOps', icon: <SiArgo size={22} className="text-orange-400" />, sections: '2 Deep-Dive Modules', group: 'automation', desc: 'Pull-based continuous deployment, Git single source of truth, and rollbacks.' },
];

const FAQS = [
  {
    q: 'Can my laptop run these labs if it only has 4GB RAM or no GPU?',
    a: 'Yes, 100%! All container compute, Kubernetes clusters, and Linux environments run on our dedicated remote cloud kernels. We also avoided heavy WebGL/Three.js scripts on this site — everything is pure GPU-accelerated CSS running at a locked 60 FPS with 0% CPU overhead. If your laptop can open Google Chrome, you can run an enterprise multi-node cluster with zero fan noise or lag.',
  },
  {
    q: 'Do I need an international credit card for AWS/GCP to practice cloud labs?',
    a: 'No! Unlike AWS, GCP, or Azure which demand an international credit card and risk surprise $50+ dollar bills, OpsAcademy provides pre-funded disposable in-browser cloud sandboxes. Zero personal card required. Zero financial risk.',
  },
  {
    q: 'How does OpsAcademy prepare me for live technical screen-share interviews?',
    a: 'Over 80% of DevOps placement rejections happen because candidates know textbook theory but freeze when asked to troubleshoot an actual broken server live on screen. Our labs simulate real production outages (CrashLoopBackOff, socket collisions, permission errors) under timed conditions so you build unshakeable command-line reflexes.',
  },
  {
    q: 'How does the AI Mentor guide me without giving away answers?',
    a: 'Our mentor uses a strict 3-tier leak guard. Instead of generating code you can blindly copy-paste (which causes you to freeze in live interviews), it inspects your container exit codes and asks diagnostic questions like a real Senior SRE interviewer, teaching you how to debug independently.',
  },
  {
    q: 'How can campus recruiters and hiring managers verify my certificates?',
    a: 'Every certificate is awarded only when 100% of a unit\'s kernel checks pass. Each certificate includes a tamper-proof verification URL and cryptographic signature displaying the exact lab milestones, timestamp, and command logs passed, making it uncheatable on your resume.',
  },
  {
    q: 'Is my access sponsored if my college has partnered with your training company?',
    a: 'Yes! If your engineering institution is a partnered college, your Pro Placement Pass is fully sponsored by your college Training & Placement Cell (TPO). Simply sign in with your college student email to unlock all 19 production labs.',
  },
];

export default function LandingPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [curriculumGroup, setCurriculumGroup] = useState('all');
  const [showAllCourses, setShowAllCourses] = useState(false);
  const [activeHeroCmd, setActiveHeroCmd] = useState(0);
  const [activeLabTab, setActiveLabTab] = useState('terminal');
  const [activeLabStep, setActiveLabStep] = useState(1);
  const [openLabHint, setOpenLabHint] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [openFaq, setOpenFaq] = useState(0);

  const activeSearch = courseSearch || searchQuery;

  const filteredCourses = CURRICULUM_COURSES.filter((course) => {
    const matchesGroup = curriculumGroup === 'all' || course.group === curriculumGroup;
    const matchesSearch =
      !activeSearch.trim() ||
      course.title.toLowerCase().includes(activeSearch.toLowerCase()) ||
      course.category.toLowerCase().includes(activeSearch.toLowerCase()) ||
      course.desc.toLowerCase().includes(activeSearch.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  const displayedCourses =
    showAllCourses || curriculumGroup !== 'all' || activeSearch.trim() !== ''
      ? filteredCourses
      : filteredCourses.slice(0, 8);

  const currentHeroCmd = HERO_COMMANDS[activeHeroCmd];

  return (
    <div className="landing">
      {/* ── 1. Hero Section: Rich High-Tech Cockpit ── */}
      <section className="hero-viewport-stage">
        {/* Ambient Top Glow Orbs */}
        <div className="hero-ambient-glow hero-glow-top" />
        <div className="hero-ambient-glow hero-glow-right" />

        <div className="hero-frame-canvas">
          {/* Header Navigation Bar */}
          <header className="hero-frame-navbar">
            <Link to="/" className="hero-frame-brand">
              <div className="hero-brand-badge">
                <span className="hero-brand-prompt">{'>_'}</span>
              </div>
              <span className="hero-brand-text">OPSACADEMY</span>
            </Link>

            <nav className="hero-frame-navlinks">
              <a href="#curriculum">Curriculum</a>
              <a href="#practice-lab">Interactive Sandbox</a>
              <a href="#career-tracks">Career Tracks</a>
              <a href="#ai-mentor">AI Mentor</a>
              <a href="#pricing">Pricing</a>
            </nav>

            <div className="hero-frame-nav-actions">
              <Link to="/login" className="hero-nav-btn-signin">
                Sign In <ArrowRight size={14} className="hero-nav-arrow" />
              </Link>
              <Link to="/dashboard" className="hero-nav-btn-getstarted">
                Get Started <ArrowRight size={15} />
              </Link>
            </div>
          </header>

          {/* Hero Main Content Split Grid */}
          <div className="hero-frame-grid">
            {/* Left Content Column */}
            <div className="hero-frame-left">
              {/* Live Status Pill */}
              <div className="hero-live-status-pill">
                <span className="live-status-dot" />
                <span className="live-status-text">CAMPUS-TO-CLOUD PLACEMENT ENGINE • 1ST TO 4TH YEAR</span>
              </div>

              {/* Main Punchy Editorial Headline */}
              <h1 className="hero-editorial-headline">
                <span className="headline-line">STOP MEMORIZING.</span>
                <span className="headline-line">START CRACKING</span>
                <span className="headline-line headline-line-highlight">
                  {/* Decorative yellow chalk rays */}
                  <svg className="chalk-burst-svg" viewBox="0 0 32 32" fill="none">
                    <line x1="6" y1="20" x2="18" y2="15" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
                    <line x1="4" y1="11" x2="16" y2="11" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
                    <line x1="8" y1="3" x2="18" y2="7" stroke="#facc15" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  <span className="headline-text-commands">8–24 LPA OFFERS.</span>
                  {/* Hand-drawn brush underline */}
                  <svg className="chalk-underline-svg" viewBox="0 0 320 22" fill="none" preserveAspectRatio="none">
                    <path
                      d="M4 14 C 60 6, 170 17, 314 8 C 240 18, 130 16, 12 20"
                      stroke="#facc15"
                      strokeWidth="5.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </h1>

              {/* Description */}
              <p className="hero-editorial-desc">
                Every engineering student has a generic To-Do app on their resume. Stand out in campus placements by deploying real Docker containers, Kubernetes clusters, and AWS infrastructure inside browser sandboxes — Zero Credit Card Required. Runs on Any 4GB College PC.
              </p>

              {/* Action Buttons */}
              <div className="hero-editorial-ctas">
                <Link to="/dashboard" className="hero-btn-pill-primary">
                  <span>Start Practice Lab</span>
                  <ArrowRight size={17} />
                </Link>
                <a href="#pathways" className="hero-btn-pill-secondary">
                  <span>Explore Pathways</span>
                  <ArrowRight size={17} />
                </a>
              </div>

              {/* Trust Badges Checkmarks */}
              <div className="hero-trust-checks">
                <span className="trust-check-item">
                  <Check size={14} className="text-emerald-400" /> No AWS Credit Card Needed
                </span>
                <span className="trust-check-item">
                  <Check size={14} className="text-emerald-400" /> Runs on Any 4GB College PC
                </span>
                <span className="trust-check-item">
                  <Check size={14} className="text-emerald-400" /> Socratic AI Placement Mentor
                </span>
              </div>

              {/* Social Proof Learner Rating */}
              <div className="hero-social-proof">
                <div className="proof-avatar-stack">
                  <span className="avatar-circle av-1">👩‍💻</span>
                  <span className="avatar-circle av-2">👨‍💻</span>
                  <span className="avatar-circle av-3">🧑‍💼</span>
                  <span className="avatar-circle av-4">👨‍🔧</span>
                </div>
                <div className="proof-text-wrap">
                  <div className="proof-stars">
                    {'★★★★★'.split('').map((s, i) => (
                      <span key={i} className="star-gold">{s}</span>
                    ))}
                    <span className="proof-rating-num">4.9/5</span>
                  </div>
                  <span className="proof-caption">from 3,200+ DevOps engineers &amp; learners</span>
                </div>
              </div>

              {/* Industry Certification Strip */}
              <div className="hero-cert-strip">
                <span className="cert-strip-label">ALIGNED WITH INDUSTRY CERTIFICATIONS:</span>
                <div className="cert-strip-badges">
                  <div className="cert-badge"><SiKubernetes size={15} className="text-blue-400" /> CKA</div>
                  <div className="cert-badge"><SiKubernetes size={15} className="text-cyan-400" /> CKAD</div>
                  <div className="cert-badge"><FaAws size={15} className="text-amber-400" /> AWS SAA</div>
                  <div className="cert-badge"><FaLinux size={15} className="text-yellow-400" /> Linux Foundation</div>
                  <div className="cert-badge"><SiTerraform size={15} className="text-purple-400" /> Terraform Associate</div>
                </div>
              </div>
            </div>

            {/* Right Visual Cockpit Column: Interactive CSS Cockpit Mockup */}
            <div className="hero-frame-right">
              <HeroCockpit />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. Platform Stats & Proof Ribbon ── */}
      <div className="stats-proof-strip">
        <div className="container">
          <div className="stats-proof-grid">
            <div className="stat-proof-item">
              <span className="stat-proof-num">19</span>
              <span className="stat-proof-label">Production Labs</span>
            </div>
            <div className="stat-proof-divider" />
            <div className="stat-proof-item">
              <span className="stat-proof-num">89+</span>
              <span className="stat-proof-label">Automated Checks</span>
            </div>
            <div className="stat-proof-divider" />
            <div className="stat-proof-item">
              <span className="stat-proof-num">16</span>
              <span className="stat-proof-label">Hands-On Courses</span>
            </div>
            <div className="stat-proof-divider" />
            <div className="stat-proof-item">
              <span className="stat-proof-num">100%</span>
              <span className="stat-proof-label">Real Linux Sandboxes</span>
            </div>
            <div className="stat-proof-divider" />
            <div className="stat-proof-item">
              <span className="stat-proof-num">4</span>
              <span className="stat-proof-label">Career Tracks</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2b. The 3 College Blockers Solved ── */}
      <section className="college-blockers-section">
        <div className="container">
          <div className="blockers-header">
            <span className="blockers-kicker">THE 3 CAMPUS REALITIES WE SOLVED</span>
            <h2 className="blockers-title">Why 90% of College Students Give Up on Cloud &amp; DevOps</h2>
            <p className="blockers-desc">
              Traditional college training gives students boring PPTs and expects them to practice on their own. Here is how OpsAcademy removes every excuse.
            </p>
          </div>

          <div className="blockers-grid">
            <div className="blocker-card">
              <div className="blocker-icon-wrap icon-red">
                <AlertCircle size={22} />
              </div>
              <div className="blocker-problem-tag">THE COLLEGE FRUSTRATION</div>
              <h3 className="blocker-heading">"I don't have a Credit Card for AWS."</h3>
              <p className="blocker-text">
                AWS, GCP, and Azure demand international credit cards and trap students with accidental $50+ dollar bills when an EC2 instance or NAT gateway is left running.
              </p>
              <div className="blocker-solution-box">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span><strong>OpsAcademy Fix:</strong> 100% pre-funded disposable browser sandboxes. Zero credit card needed. Zero billing surprise risk.</span>
              </div>
            </div>

            <div className="blocker-card">
              <div className="blocker-icon-wrap icon-amber">
                <Cpu size={22} />
              </div>
              <div className="blocker-problem-tag">THE HARDWARE BOTTLENECK</div>
              <h3 className="blocker-heading">"My laptop freezes whenever I run Docker."</h3>
              <p className="blocker-text">
                Most students and college lab PCs have 4GB or 8GB RAM. Running Docker Desktop, Minikube, and an IDE simultaneously brings their machine to a complete crawl. Heavy WebGL/3D sites also spin laptop fans out of control.
              </p>
              <div className="blocker-solution-box">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span><strong>OpsAcademy Fix:</strong> 100% remote Linux cloud sandboxes. Zero local Docker lag. Zero WebGL battery drain. If your browser can open Chrome, you run full Kubernetes at 60 FPS.</span>
              </div>
            </div>

            <div className="blocker-card">
              <div className="blocker-icon-wrap icon-purple">
                <ShieldCheck size={22} />
              </div>
              <div className="blocker-problem-tag">THE INTERVIEW TRAP</div>
              <h3 className="blocker-heading">"ChatGPT gives me code, but I freeze in live interviews."</h3>
              <p className="blocker-text">
                Copy-pasting answers gives a false sense of learning. In live placement screening rounds, recruiters ask candidates to share their screen and troubleshoot without AI.
              </p>
              <div className="blocker-solution-box">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span><strong>OpsAcademy Fix:</strong> Anti-leak Socratic mentor that guides with diagnostic questions, training your live troubleshooting instincts.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2c. Animated Interactive Placement Pathway Diagram ── */}
      <section id="pathways" className="sheet-section placement-pathways-section">
        <div className="container">
          <CampusPlacementPathwayDiagram />
        </div>
      </section>

      {/* ── 3. Interactive Sandbox / Practice Section ── */}
      <section id="practice-lab" className="sheet-section lab-practice-section">
        <div className="container">
          <div className="lab-header-strip">
            <div className="sheet-kicker">
              <span className="kicker-dash">—</span>
              <span>CAMPUS TECHNICAL SCREENING LAB</span>
            </div>
            <div className="lab-title-row">
              <h2 className="lab-main-title">Placement Challenge #01: Triage a Broken Web Ingress</h2>
              <span className="practice-mode-tag">
                <CheckCircle2 size={14} /> Screen-Share Interview Mode
              </span>
            </div>
            <p className="lab-main-subtitle">
              In this timed placement challenge, an external client cannot connect because port 80 has a host socket conflict. Diagnose the port binding, map it correctly to port 8080, and pass automated kernel health checks in under 60 seconds.
            </p>
          </div>

          <div className="lab-interactive-workspace">
            {/* Left Steps Sidebar */}
            <div className="lab-steps-sidebar">
              <div className="lab-steps-list">
                <div
                  className={`lab-step-item ${activeLabStep === 1 ? 'step-active' : ''}`}
                  onClick={() => setActiveLabStep(1)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="step-num">1</span>
                  <span className="step-text">Identify port socket conflict</span>
                  {activeLabStep === 1 && <CheckCircle2 size={15} className="step-check" />}
                </div>
                <div
                  className={`lab-step-item ${activeLabStep === 2 ? 'step-active' : ''}`}
                  onClick={() => setActiveLabStep(2)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="step-num">2</span>
                  <span className="step-text">Deploy isolated Alpine container</span>
                </div>
                <div
                  className={`lab-step-item ${activeLabStep === 3 ? 'step-active' : ''}`}
                  onClick={() => setActiveLabStep(3)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="step-num">3</span>
                  <span className="step-text">Map host port 8080 -&gt; 80</span>
                </div>
                <div
                  className={`lab-step-item ${activeLabStep === 4 ? 'step-active' : ''}`}
                  onClick={() => setActiveLabStep(4)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="step-num">4</span>
                  <span className="step-text">Verify HTTP 200 via curl</span>
                </div>
                <div
                  className={`lab-step-item ${activeLabStep === 5 ? 'step-active' : ''}`}
                  onClick={() => setActiveLabStep(5)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="step-num">5</span>
                  <span className="step-text">Pass placement kernel check</span>
                </div>
              </div>

              {/* Hints Accordion */}
              <div className="lab-hints-container">
                <div className="hints-header">
                  <Sparkles size={14} className="text-amber-400" />
                  <span>Socratic Placement Hints</span>
                </div>
                <div className="hint-accordion-list">
                  <div className="hint-item">
                    <button
                      type="button"
                      className="hint-trigger"
                      onClick={() => setOpenLabHint(openLabHint === 1 ? null : 1)}
                    >
                      <span>Hint 1: Check the host port conflict</span>
                      <ChevronDown size={14} className={openLabHint === 1 ? 'rotate-180' : ''} />
                    </button>
                    {openLabHint === 1 && (
                      <p className="hint-content">Host port 80 is occupied by a rogue system daemon. What flag maps external port 8080 to container port 80?</p>
                    )}
                  </div>
                  <div className="hint-item">
                    <button
                      type="button"
                      className="hint-trigger"
                      onClick={() => setOpenLabHint(openLabHint === 2 ? null : 2)}
                    >
                      <span>Hint 2: Check the container status</span>
                      <ChevronDown size={14} className={openLabHint === 2 ? 'rotate-180' : ''} />
                    </button>
                    {openLabHint === 2 && (
                      <p className="hint-content">Run <code>docker ps</code> to confirm the container shows status <code>Up</code> and ports <code>0.0.0.0:8080-&gt;80/tcp</code>.</p>
                    )}
                  </div>
                  <div className="hint-item">
                    <button
                      type="button"
                      className="hint-trigger"
                      onClick={() => setOpenLabHint(openLabHint === 3 ? null : 3)}
                    >
                      <span>Hint 3: Verify HTTP headers</span>
                      <ChevronDown size={14} className={openLabHint === 3 ? 'rotate-180' : ''} />
                    </button>
                    {openLabHint === 3 && (
                      <p className="hint-content">Execute <code>curl -I localhost:8080</code> to verify the server returns <code>HTTP/1.1 200 OK</code> headers.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Sandbox Terminal Window */}
            <div className="lab-terminal-window">
              <div className="lab-terminal-tabs">
                <div className="tabs-left">
                  <button
                    type="button"
                    className={`term-tab ${activeLabTab === 'terminal' ? 'active' : ''}`}
                    onClick={() => setActiveLabTab('terminal')}
                  >
                    Terminal
                  </button>
                  <button
                    type="button"
                    className={`term-tab ${activeLabTab === 'compose' ? 'active' : ''}`}
                    onClick={() => setActiveLabTab('compose')}
                  >
                    docker-compose.yml
                  </button>
                  <button
                    type="button"
                    className={`term-tab ${activeLabTab === 'k8s' ? 'active' : ''}`}
                    onClick={() => setActiveLabTab('k8s')}
                  >
                    Kubernetes
                  </button>
                  <span className="term-tab-add">+</span>
                </div>
                <div className="tabs-right">
                  <span className="term-fullscreen-btn">[⛶]</span>
                </div>
              </div>

              <div className="lab-terminal-screen">
                {activeLabTab === 'terminal' && (
                  <div className="terminal-code-stream">
                    <div className="code-line"><span className="term-prompt">ops@lab:~$ </span><span className="term-cmd">docker run -d -p 8080:80 --name web-ingress nginx:alpine</span></div>
                    <div className="code-output text-slate-400">Unable to find image 'nginx:alpine' locally</div>
                    <div className="code-output text-slate-400">latest: Pulling from library/nginx</div>
                    <div className="code-output text-slate-400">Digest: sha256:7c9e5b2149... [Verified Sigstore]</div>
                    <div className="code-output text-slate-400">Status: Downloaded newer image for nginx:alpine</div>
                    <div className="code-output text-emerald-400 font-bold">c84f2910ba2b8c947... (Container online)</div>
                    <br />
                    <div className="code-line"><span className="term-prompt">ops@lab:~$ </span><span className="term-cmd">docker ps</span></div>
                    <div className="code-output text-slate-300">CONTAINER ID   IMAGE          COMMAND                  PORTS                    STATUS</div>
                    <div className="code-output text-cyan-300">c84f2910ba2b   nginx:alpine   "/docker-entrypoint..."  0.0.0.0:8080-&gt;80/tcp     Up 5 seconds</div>
                    <br />
                    <div className="code-line"><span className="term-prompt">ops@lab:~$ </span><span className="term-cmd">curl -I localhost:8080</span></div>
                    <div className="code-output text-slate-400">HTTP/1.1 200 OK</div>
                    <div className="code-output text-slate-400">Server: nginx/1.25.4</div>
                    <div className="code-output text-emerald-300 font-semibold">Content-Type: text/html</div>
                    <br />
                    <div className="code-line"><span className="term-prompt">ops@lab:~$ </span><span className="term-cursor">█</span></div>
                  </div>
                )}
                {activeLabTab === 'compose' && (
                  <div className="terminal-code-stream text-slate-300 font-mono">
                    <div><span className="text-purple-400">version:</span> '3.8'</div>
                    <div><span className="text-purple-400">services:</span></div>
                    <div className="pl-4"><span className="text-blue-400">web:</span></div>
                    <div className="pl-8"><span className="text-amber-400">image:</span> nginx:alpine</div>
                    <div className="pl-8"><span className="text-amber-400">ports:</span></div>
                    <div className="pl-12">- <span className="text-emerald-400">"8080:80"</span></div>
                  </div>
                )}
                {activeLabTab === 'k8s' && (
                  <div className="terminal-code-stream text-slate-300 font-mono">
                    <div><span className="text-purple-400">apiVersion:</span> apps/v1</div>
                    <div><span className="text-purple-400">kind:</span> Deployment</div>
                    <div><span className="text-purple-400">metadata:</span></div>
                    <div className="pl-4"><span className="text-blue-400">name:</span> nginx-deployment</div>
                    <div><span className="text-purple-400">spec:</span></div>
                    <div className="pl-4"><span className="text-amber-400">replicas:</span> <span className="text-emerald-400">3</span></div>
                  </div>
                )}
              </div>

              {/* Step Verified Banner */}
              <div className="lab-verified-banner">
                <div className="banner-left">
                  <div className="banner-check-circle">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="banner-text">
                    <strong>Step 1 Verified (100% Passed)</strong>
                    <span>Service restored and verified on port 8080 with zero code leaks.</span>
                  </div>
                </div>
                <Link to="/dashboard" className="lab-next-btn">
                  Next Step <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Course Curriculum Catalog Section ── */}
      <section id="curriculum" className="sheet-section curriculum-catalog-section">
        <div className="container">
          <div className="sheet-section-header">
            <div className="sheet-kicker">
              <span className="kicker-dash">—</span>
              <span>COURSE CATALOG</span>
            </div>
            <div className="curriculum-header-row">
              <div className="curriculum-header-left">
                <h2 className="sheet-headline">Learn Real-World DevOps, Cloud and Security Skills</h2>
                <p className="sheet-subheadline">
                  16 comprehensive courses, 19 production labs and 89+ verified steps to take you from zero to job-ready.
                </p>
              </div>
              <div className="curriculum-search-box">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter courses..."
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="curriculum-search-input"
                />
              </div>
            </div>

            {/* Filter Pills */}
            <div className="catalog-filter-pills">
              <button
                type="button"
                className={`filter-pill ${curriculumGroup === 'all' ? 'active' : ''}`}
                onClick={() => setCurriculumGroup('all')}
              >
                All (16)
              </button>
              <button
                type="button"
                className={`filter-pill ${curriculumGroup === 'foundations' ? 'active' : ''}`}
                onClick={() => setCurriculumGroup('foundations')}
              >
                Core Foundations
              </button>
              <button
                type="button"
                className={`filter-pill ${curriculumGroup === 'cloud' ? 'active' : ''}`}
                onClick={() => setCurriculumGroup('cloud')}
              >
                Cloud &amp; Containers
              </button>
              <button
                type="button"
                className={`filter-pill ${curriculumGroup === 'security' ? 'active' : ''}`}
                onClick={() => setCurriculumGroup('security')}
              >
                Security &amp; DFIR
              </button>
              <button
                type="button"
                className={`filter-pill ${curriculumGroup === 'automation' ? 'active' : ''}`}
                onClick={() => setCurriculumGroup('automation')}
              >
                Automation &amp; GitOps
              </button>
            </div>
          </div>

          {/* Course Cards Grid */}
          <div className="catalog-cards-grid">
            {displayedCourses.map((course) => (
              <div key={course.id} className="catalog-card">
                <div className="catalog-card-header">
                  <div className="catalog-card-icon">{course.icon}</div>
                  <div className="catalog-card-title-wrap">
                    <h3 className="catalog-card-title">{course.title}</h3>
                    {course.isNew && <span className="card-new-badge">NEW</span>}
                  </div>
                </div>
                <div className="catalog-card-badges">
                  <span className="pill-badge pill-modules">{course.sections.split(' ')[0]} Modules</span>
                  <span className={`pill-badge pill-level-${course.group}`}>
                    {course.group === 'foundations' ? 'Beginner' : course.group === 'security' ? 'Advanced' : 'Intermediate'}
                  </span>
                </div>
                <p className="catalog-card-desc">{course.desc}</p>
                <Link to={`/unit/${course.id}/learn`} className="catalog-card-link">
                  Explore Course <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>

          {curriculumGroup === 'all' && !courseSearch && (
            <div className="curriculum-expand-row">
              <button
                type="button"
                className="curriculum-expand-btn"
                onClick={() => setShowAllCourses(!showAllCourses)}
              >
                <span>{showAllCourses ? 'Collapse Courses' : `Show All 16 Courses (${filteredCourses.length - 8} More)`}</span>
                {showAllCourses ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── 5. AI Mentor (Socratic Comparison) Section ── */}
      <section id="ai-mentor" className="sheet-section ai-mentor-comparison-section">
        <div className="container">
          <div className="sheet-section-header text-center">
            <div className="sheet-kicker justify-center">
              <span className="kicker-dash">—</span>
              <span>THE SOCRATIC AI PLACEMENT INTERVIEWER</span>
            </div>
            <h2 className="sheet-headline">Trains You for Live Screen-Share Rounds</h2>
            <p className="sheet-subheadline mx-auto">
              ChatGPT gives you copy-paste answers that cause you to freeze in live placement interviews. OpsAcademy asks the exact diagnostic questions senior tech interviewers test for.
            </p>
            <div className="mentor-trust-pills">
              <span className="mentor-trust-pill"><CheckCircle2 size={13} /> Zero copy-paste crutch</span>
              <span className="mentor-trust-pill"><Sparkles size={13} /> Socratic diagnostic method</span>
              <span className="mentor-trust-pill"><Brain size={13} /> 3-tier hint engine</span>
              <span className="mentor-trust-pill"><Zap size={13} /> Anti-leak interview guard</span>
            </div>
          </div>

          {/* Side-by-Side Comparison */}
          <div className="mentor-comparison-grid">
            {/* Standard ChatGPT (Red Card) */}
            <div className="mentor-card chatgpt-card">
              <div className="mentor-card-header">
                <div className="mentor-avatar chatgpt-avatar">🤖</div>
                <span className="mentor-card-title">Standard ChatGPT (The Interview Trap)</span>
              </div>
              <div className="mentor-dialog-body">
                <div className="chat-bubble user-bubble">
                  My Kubernetes pod keeps crashing with exit code 137. Give me the YAML fix.
                </div>
                <div className="chat-bubble bot-bubble-chatgpt">
                  <p>Here's the replacement YAML:</p>
                  <pre className="code-snippet"><code>resources:
  limits:
    memory: "512Mi"</code></pre>
                  <span className="copy-badge">📋 Copy-Paste</span>
                </div>
              </div>
              <div className="mentor-card-footer red-footer">
                <span>✕ Blind copy-pasting. In live interviews when asked "Why did it exit with 137 instead of 1?", candidates freeze.</span>
              </div>
            </div>

            {/* OpsAcademy AI Mentor (Green Card) */}
            <div className="mentor-card ops-mentor-card">
              <div className="mentor-card-header">
                <div className="mentor-avatar ops-avatar">🧠</div>
                <span className="mentor-card-title">OpsAcademy Socratic Mentor (Senior SRE)</span>
              </div>
              <div className="mentor-dialog-body">
                <div className="chat-bubble user-bubble">
                  My Kubernetes pod keeps crashing with exit code 137. Give me the YAML fix.
                </div>
                <div className="chat-bubble bot-bubble-ops">
                  <p className="font-semibold text-emerald-300">Exit code 137 means the Linux kernel Out-Of-Memory (OOM) Killer terminated your container.</p>
                  <p className="mt-1">Before touching YAML, let's isolate the root cause:</p>
                  <p className="text-slate-300">1. Run <code>kubectl describe pod</code> to inspect the <strong>Last State</strong> termination reason.</p>
                  <p className="mt-1 text-lime-300 font-semibold">2. What memory limit was configured, and how does that compare to your container worker socket buffer?</p>
                </div>
              </div>
              <div className="mentor-card-footer green-footer">
                <span>✔ Teaches you the systematic diagnostic thought process that clears high-paying placement rounds.</span>
              </div>
            </div>
          </div>

          {/* Bottom 3-Tier Hint Engine Banner */}
          <div className="mentor-tiers-banner">
            <div className="tiers-banner-left">
              <img
                src="/ai-mentor-character.png"
                alt="Student with ideas"
                className="ai-character-img"
              />
              <div className="tiers-banner-quote">
                <h3>Build problem-solving skills that actually matter in technical interviews.</h3>
              </div>
            </div>
            <div className="tiers-banner-right">
              <div className="hint-engine-label">3-Tier Hint Engine:</div>
              <div className="hint-tier-item">
                <span className="tier-badge badge-1">1</span>
                <div>
                  <strong>Level 1: Conceptual hints</strong>
                  <p>Broad architectural nudges to point you toward the right tool or subsystem.</p>
                </div>
              </div>
              <div className="hint-tier-item">
                <span className="tier-badge badge-2">2</span>
                <div>
                  <strong>Level 2: Diagnostic hints</strong>
                  <p>Targeted checks analyzing container logs, process states, and shell exit codes.</p>
                </div>
              </div>
              <div className="hint-tier-item">
                <span className="tier-badge badge-3">3</span>
                <div>
                  <strong>Level 3: Step-by-step guidance</strong>
                  <p>Structured syntax patterns without ever giving away the direct solution string.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Career Tracks Section ── */}
      <section id="career-tracks" className="sheet-section career-tracks-section">
        <div className="container">
          <div className="sheet-section-header text-center">
            <div className="sheet-kicker justify-center">
              <span className="kicker-dash">—</span>
              <span>CAREER TRACKS</span>
            </div>
            <h2 className="sheet-headline">Build Skills for High-Demand Roles</h2>
            <p className="sheet-subheadline mx-auto">
              Master the exact stacks and workflows top technology teams test for.
            </p>
          </div>
          <div className="career-track-stars">
            <span className="career-star">✦</span>
            <span className="career-star career-star-lg">★</span>
            <span className="career-star">✦</span>
          </div>

          <div className="career-roles-grid">
            {/* SRE */}
            <div className="career-role-card">
              <div className="role-top-visual visual-sre">
                <div className="role-illustration-icon">📈</div>
              </div>
              <h3 className="role-card-title">Site Reliability Engineer (SRE)</h3>
              <p className="role-card-desc">
                SLOs, PromQL, Grafana alerts, Linux kernel debugging, and incident response.
              </p>
              <div className="role-tech-icons">
                <FaLinux size={18} className="text-yellow-400" />
                <SiGrafana size={18} className="text-orange-400" />
                <Globe size={18} className="text-green-400" />
              </div>
              <div className="role-meta-badge role-meta-intermediate">
                <span>Intermediate • Est. 12 Weeks</span>
              </div>
              <Link to="/roadmap" className="role-card-btn">
                View Track <ArrowRight size={14} />
              </Link>
            </div>

            {/* Cloud Infrastructure */}
            <div className="career-role-card">
              <div className="role-top-visual visual-cloud">
                <div className="role-illustration-icon">☁️</div>
              </div>
              <h3 className="role-card-title">Cloud Infrastructure Engineer</h3>
              <p className="role-card-desc">
                AWS VPCs, EC2, IAM policies, Terraform IaC, and multi-tier architectures.
              </p>
              <div className="role-tech-icons">
                <FaAws size={18} className="text-amber-400" />
                <SiTerraform size={18} className="text-purple-400" />
                <FaDocker size={18} className="text-cyan-400" />
              </div>
              <div className="role-meta-badge role-meta-beginner">
                <span>Beginner • Est. 12 Weeks</span>
              </div>
              <Link to="/roadmap" className="role-card-btn">
                View Track <ArrowRight size={14} />
              </Link>
            </div>

            {/* Platform & DevOps */}
            <div className="career-role-card">
              <div className="role-top-visual visual-devops">
                <div className="role-illustration-icon">☸️</div>
              </div>
              <h3 className="role-card-title">Platform &amp; DevOps Engineer</h3>
              <p className="role-card-desc">
                Kubernetes clusters, Docker, CI/CD pipelines, GitOps, and observability.
              </p>
              <div className="role-tech-icons">
                <SiKubernetes size={18} className="text-blue-400" />
                <FaDocker size={18} className="text-cyan-400" />
                <SiArgo size={18} className="text-orange-400" />
              </div>
              <div className="role-meta-badge role-meta-intermediate">
                <span>Intermediate • Est. 12 Weeks</span>
              </div>
              <Link to="/roadmap" className="role-card-btn">
                View Track <ArrowRight size={14} />
              </Link>
            </div>

            {/* DevSecOps */}
            <div className="career-role-card">
              <div className="role-top-visual visual-security">
                <div className="role-illustration-icon">🛡️</div>
              </div>
              <h3 className="role-card-title">DevSecOps Specialist</h3>
              <p className="role-card-desc">
                Container security, Trivy, Gitleaks, CVE vulnerability scanning, and forensics.
              </p>
              <div className="role-tech-icons">
                <Shield size={18} className="text-emerald-400" />
                <Lock size={18} className="text-cyan-400" />
                <FaDocker size={18} className="text-blue-400" />
              </div>
              <div className="role-meta-badge role-meta-advanced">
                <span>Advanced • Est. 12 Weeks</span>
              </div>
              <Link to="/roadmap" className="role-card-btn">
                View Track <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Trophy Banner */}
          <div className="trophy-verified-banner">
            <div className="trophy-banner-left">
              <div className="trophy-icon-circle">🏆</div>
              <div className="trophy-banner-text">
                <h3>Get Hired with Cryptographically Verified Projects</h3>
                <p>Complete hands-on labs, earn authentic signed certificates, and demonstrate verifiable skills to employers.</p>
              </div>
            </div>
            <Link to="/roadmap" className="trophy-explore-btn">
              Explore Career Tracks <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 7. Pricing & Final CTA Section ── */}
      <section id="pricing" className="sheet-section pricing-section">
        <div className="container">
          <div className="sheet-section-header text-center">
            <div className="sheet-kicker justify-center">
              <span className="kicker-dash">—</span>
              <span>PRICING &amp; CAMPUS ACCESS</span>
            </div>
            <h2 className="sheet-headline">Transparent Placement Investment</h2>
            <p className="sheet-subheadline mx-auto">
              Choose self-paced practice or unlock the full production sandbox suite engineered to clear 8–24 LPA placement interviews.
            </p>

            {/* Monthly / Yearly Switch */}
            <div className="pricing-billing-toggle">
              <button
                type="button"
                className={`billing-toggle-btn ${billingCycle === 'monthly' ? 'active' : ''}`}
                onClick={() => setBillingCycle('monthly')}
              >
                Monthly Pass
              </button>
              <button
                type="button"
                className={`billing-toggle-btn ${billingCycle === 'yearly' ? 'active' : ''}`}
                onClick={() => setBillingCycle('yearly')}
              >
                Placement Season Pass <span className="save-badge">Save 20%</span>
              </button>
            </div>
          </div>

          {/* Institutional Partner Banner */}
          <div className="campus-sponsor-banner">
            <div className="campus-sponsor-badge">
              <GraduationCap size={15} /> ATTENDING A PARTNER COLLEGE?
            </div>
            <p className="campus-sponsor-text">
              Your full <strong>Placement Crack Pass</strong> is 100% sponsored by your college Training &amp; Placement Cell (TPO). Sign in with your official college email (<code>.edu</code> / <code>.ac.in</code>) to instantly unlock all 19 production incident labs and verified credentials.
            </p>
            <Link to="/login" className="campus-sponsor-btn">
              Activate College Pass <ArrowRight size={14} />
            </Link>
          </div>

          {/* 3 Pricing Cards */}
          <div className="pricing-cards-grid">
            {/* Free */}
            <div className="pricing-card">
              <div className="pricing-card-header">
                <Shield size={22} className="text-slate-400 mb-2" />
                <h3 className="pricing-tier-name">Self-Starter Tier</h3>
                <div className="pricing-price-row">
                  <span className="pricing-amount">₹0</span>
                  <span className="pricing-period">/ month</span>
                </div>
                <p className="pricing-tier-desc">For 1st &amp; 2nd year students getting started</p>
              </div>
              <ul className="pricing-features-list">
                <li><CheckCircle2 size={16} className="text-emerald-400" /> 4 core Linux &amp; Git sandboxes</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Socratic Mentor (Tier 1 Conceptual)</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Basic kernel-level verification</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Campus batch leaderboard access</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Community troubleshooting forum</li>
              </ul>
              <Link to="/dashboard" className="pricing-card-btn btn-ghost-border">
                Start Practicing Free <ArrowRight size={14} />
              </Link>
            </div>

            {/* Pro */}
            <div className="pricing-card pricing-card-pro">
              <div className="most-popular-badge">MOST POPULAR • PLACEMENT PREP</div>
              <div className="pricing-card-header">
                <Zap size={22} className="text-amber-400 mb-2" />
                <h3 className="pricing-tier-name">Placement Crack Pass</h3>
                <div className="pricing-price-row">
                  <span className="pricing-amount">{billingCycle === 'monthly' ? '₹499' : '₹399'}</span>
                  <span className="pricing-period">/ month</span>
                </div>
                <p className="pricing-tier-desc">Engineered for 3rd &amp; 4th years targeting 8–24 LPA</p>
              </div>
              <ul className="pricing-features-list">
                <li><CheckCircle2 size={16} className="text-emerald-400" /> <strong>All 19 production incident labs</strong> (K8s, Docker, AWS)</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> <strong>Full 3-tier Socratic Mentor</strong> (Zero answer leaks)</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Live screen-share interview simulation labs</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Cryptographically verified LinkedIn certificates</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Zero AWS credit card needed (pre-funded cloud)</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Priority placement interview question bank</li>
              </ul>
              <Link to="/dashboard" className="pricing-card-btn btn-pro-solid">
                Crack Campus Placements <ArrowRight size={14} />
              </Link>
            </div>

            {/* Team / College */}
            <div className="pricing-card">
              <div className="pricing-card-header">
                <Brain size={22} className="text-cyan-400 mb-2" />
                <h3 className="pricing-tier-name">Campus Batch License</h3>
                <div className="pricing-price-row">
                  <span className="pricing-amount font-sans" style={{ fontSize: '1.75rem' }}>Custom</span>
                </div>
                <p className="pricing-tier-desc">For Engineering Colleges, TPO Cells &amp; Trainers</p>
              </div>
              <ul className="pricing-features-list">
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Full Pro Pass for 100–1,000+ students</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> College TPO admin portal &amp; batch rankings</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Automated proctored lab exams with cheat guard</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Custom curriculum mapped to campus placement drives</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> College SSO &amp; LMS gradebook integration</li>
                <li><CheckCircle2 size={16} className="text-emerald-400" /> Dedicated SRE placement training mentor</li>
              </ul>
              <Link to="/dashboard" className="pricing-card-btn btn-ghost-border">
                Schedule College Demo <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {/* Bottom Final CTA Banner */}
          <div className="ready-infrastructure-banner">
            <div className="ready-banner-left">
              <div className="ready-prompt-icon">{'>_'}</div>
              <div className="ready-banner-text">
                <h3>Ready to Build Real Infrastructure?</h3>
                <p>Stop watching tutorials. Start typing real commands in live sandboxes.</p>
              </div>
            </div>
            <Link to="/dashboard" className="ready-banner-btn">
              Open Learning Dashboard <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 8. FAQ Accordion Section ── */}
      <section id="faqs" className="sheet-section faqs-section">
        <div className="container">
          <div className="sheet-section-header text-center">
            <div className="sheet-kicker justify-center">
              <span className="kicker-dash">—</span>
              <span>FAQ</span>
            </div>
            <h2 className="sheet-headline">Frequently Asked Questions</h2>
            <p className="sheet-subheadline mx-auto">
              Everything you need to know about our isolated sandboxes, anti-leak AI mentor, and certificates.
            </p>
          </div>

          <div className="faqs-accordion-wrapper">
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              return (
                <div key={i} className={`faq-sheet-item ${isOpen ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="faq-sheet-trigger"
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown size={18} className={`faq-chevron ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="faq-sheet-answer animate-fade-in">
                      <p>{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 9. Global Footer ── */}
      <footer className="sheet-footer">
        <div className="container">
          <div className="footer-top-row">
            <div className="footer-brand-col">
              <div className="footer-logo">
                <div className="footer-logo-badge">&gt;_</div>
                <span className="footer-brand-name">OpsAcademy</span>
              </div>
              <p className="footer-tagline">
                The hands-on DevOps &amp; Cloud Engineering platform with real sandboxes, automated checks, and anti-leak AI mentoring.
              </p>
              <span className="status-indicator">
                <span className="status-dot" /> All Systems Operational
              </span>
            </div>
            <div className="footer-links-cols">
              <div className="footer-link-col">
                <h4 className="footer-col-heading">Platform</h4>
                <a href="#curriculum" className="footer-link">Curriculum</a>
                <a href="#practice-lab" className="footer-link">Interactive Sandbox</a>
                <a href="#ai-mentor" className="footer-link">AI Mentor</a>
                <a href="#career-tracks" className="footer-link">Career Tracks</a>
              </div>
              <div className="footer-link-col">
                <h4 className="footer-col-heading">Resources</h4>
                <a href="#faqs" className="footer-link">FAQ</a>
                <a href="#pricing" className="footer-link">Pricing</a>
                <Link to="/dashboard" className="footer-link">Start Free</Link>
                <Link to="/login" className="footer-link">Sign In</Link>
              </div>
              <div className="footer-link-col">
                <h4 className="footer-col-heading">Certifications</h4>
                <span className="footer-link-plain">CKA (Kubernetes Admin)</span>
                <span className="footer-link-plain">CKAD (Kubernetes Dev)</span>
                <span className="footer-link-plain">AWS SAA (Solutions Arch)</span>
                <span className="footer-link-plain">Linux Foundation (LFCS)</span>
              </div>
            </div>
          </div>
          <div className="footer-bottom-row">
            <span className="footer-copy">© {new Date().getFullYear()} OpsAcademy. Built for modern DevOps &amp; Cloud Engineers.</span>
            <div className="footer-bottom-links">
              <a href="#" className="footer-bottom-link">Privacy Policy</a>
              <a href="#" className="footer-bottom-link">Terms of Service</a>
              <a href="#" className="footer-bottom-link">Contact Support</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
