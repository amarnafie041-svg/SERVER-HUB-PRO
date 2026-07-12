import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/language";
import {
  Shield, Zap, Globe, Server, Activity, Users, Monitor,
  Headphones, ChevronLeft, ArrowLeft,
} from "lucide-react";

const LOGO_URL = "https://i.ibb.co/s9P5XZrz/IMG-20260525-202044-835.jpg";

/* ────────────── Particle Canvas ────────────── */
function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; o: number }[] = [];
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 2 + 0.5,
        o: Math.random() * 0.4 + 0.1,
      });
    }
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = c.width;
        if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height;
        if (p.y > c.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139,92,246,${p.o})`;
        ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(139,92,246,${0.06 * (1 - dist / 150)})`;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

/* ────────────── SVG Decorations ────────────── */
function ServerIllustration() {
  return (
    <div className="relative w-[280px] h-[280px] md:w-[360px] md:h-[360px] mx-auto">
      {/* Glow ring */}
      <div className="absolute inset-0 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.4) 0%, transparent 70%)", animation: "glowPulse 4s ease-in-out infinite" }} />

      {/* Server SVG */}
      <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_40px_rgba(139,92,246,0.3)]" style={{ animation: "float 6s ease-in-out infinite" }}>
        {/* Cloud */}
        <ellipse cx="100" cy="45" rx="45" ry="18" fill="rgba(139,92,246,0.1)" stroke="rgba(139,92,246,0.2)" strokeWidth="1" />
        <ellipse cx="85" cy="40" rx="25" ry="14" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.15)" strokeWidth="0.8" />
        <ellipse cx="118" cy="42" rx="20" ry="11" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.15)" strokeWidth="0.8" />

        {/* Server rack body */}
        <rect x="60" y="70" width="80" height="100" rx="8" fill="#0f0a1e" stroke="rgba(139,92,246,0.35)" strokeWidth="1.5" />
        <rect x="60" y="70" width="80" height="100" rx="8" fill="url(#srvGrad)" />

        {/* Server slots */}
        <rect x="68" y="78" width="64" height="22" rx="4" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth="0.8" />
        <rect x="68" y="106" width="64" height="22" rx="4" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.2)" strokeWidth="0.8" />
        <rect x="68" y="134" width="64" height="22" rx="4" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth="0.8" />

        {/* LED indicators */}
        <circle cx="80" cy="89" r="3" fill="#22c55e" opacity="0.9"><animate attributeName="opacity" values="0.9;0.4;0.9" dur="2s" repeatCount="indefinite" /></circle>
        <circle cx="90" cy="89" r="3" fill="#3b82f6" opacity="0.8"><animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.5s" repeatCount="indefinite" /></circle>
        <circle cx="100" cy="89" r="3" fill="#8b5cf6" opacity="0.7"><animate attributeName="opacity" values="0.7;0.3;0.7" dur="2.5s" repeatCount="indefinite" /></circle>
        <circle cx="112" cy="89" r="2.5" fill="#22c55e" opacity="0.6" />

        <circle cx="80" cy="117" r="3" fill="#3b82f6" opacity="0.9"><animate attributeName="opacity" values="0.9;0.5;0.9" dur="1.8s" repeatCount="indefinite" /></circle>
        <circle cx="90" cy="117" r="3" fill="#8b5cf6" opacity="0.7"><animate attributeName="opacity" values="0.7;0.35;0.7" dur="2.2s" repeatCount="indefinite" /></circle>
        <circle cx="100" cy="117" r="3" fill="#22c55e" opacity="0.8" />

        <circle cx="80" cy="145" r="3" fill="#8b5cf6" opacity="0.8"><animate attributeName="opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" /></circle>
        <circle cx="90" cy="145" r="3" fill="#22c55e" opacity="0.9"><animate attributeName="opacity" values="0.9;0.45;0.9" dur="1.6s" repeatCount="indefinite" /></circle>
        <circle cx="100" cy="145" r="3" fill="#3b82f6" opacity="0.7" />

        {/* Vent lines */}
        {[0, 1, 2, 3, 4].map(i => (
          <line key={`v1-${i}`} x1={120 + i * 4} y1="82" x2={120 + i * 4} y2="94" stroke="rgba(139,92,246,0.15)" strokeWidth="0.8" />
        ))}
        {[0, 1, 2, 3, 4].map(i => (
          <line key={`v2-${i}`} x1={120 + i * 4} y1="110" x2={120 + i * 4} y2="122" stroke="rgba(59,130,246,0.15)" strokeWidth="0.8" />
        ))}

        {/* Digital circuit lines from server */}
        <path d="M100 170 L100 190" stroke="rgba(139,92,246,0.3)" strokeWidth="1" strokeDasharray="4 3">
          <animate attributeName="stroke-dashoffset" values="0;-14" dur="1.5s" repeatCount="indefinite" />
        </path>
        <path d="M70 170 L60 185" stroke="rgba(59,130,246,0.2)" strokeWidth="0.8" strokeDasharray="3 3">
          <animate attributeName="stroke-dashoffset" values="0;-12" dur="2s" repeatCount="indefinite" />
        </path>
        <path d="M130 170 L140 185" stroke="rgba(139,92,246,0.2)" strokeWidth="0.8" strokeDasharray="3 3">
          <animate attributeName="stroke-dashoffset" values="0;-12" dur="2.5s" repeatCount="indefinite" />
        </path>

        <defs>
          <linearGradient id="srvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(139,92,246,0.08)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0.04)" />
          </linearGradient>
        </defs>
      </svg>

      {/* Orbiting dots */}
      <div className="absolute inset-0" style={{ animation: "spin 20s linear infinite" }}>
        <div className="absolute top-0 left-1/2 w-2 h-2 -translate-x-1/2 rounded-full bg-purple-500 opacity-60" />
      </div>
      <div className="absolute inset-0" style={{ animation: "spin 15s linear infinite reverse" }}>
        <div className="absolute bottom-4 right-4 w-1.5 h-1.5 rounded-full bg-blue-400 opacity-50" />
      </div>
    </div>
  );
}

function DashboardIllustration() {
  return (
    <div className="relative w-[280px] h-[280px] md:w-[360px] md:h-[360px] mx-auto">
      <div className="absolute inset-0 rounded-full opacity-15"
        style={{ background: "radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)", animation: "glowPulse 5s ease-in-out infinite 1s" }} />

      <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_30px_rgba(59,130,246,0.2)]" style={{ animation: "float 7s ease-in-out infinite 1s" }}>
        {/* Dashboard frame */}
        <rect x="30" y="40" width="140" height="120" rx="10" fill="#0d0a1a" stroke="rgba(139,92,246,0.3)" strokeWidth="1.2" />

        {/* Title bar */}
        <rect x="30" y="40" width="140" height="18" rx="10" fill="rgba(139,92,246,0.1)" />
        <circle cx="42" cy="49" r="3" fill="#ef4444" opacity="0.6" />
        <circle cx="52" cy="49" r="3" fill="#eab308" opacity="0.6" />
        <circle cx="62" cy="49" r="3" fill="#22c55e" opacity="0.6" />

        {/* Chart area */}
        <rect x="38" y="64" width="55" height="40" rx="4" fill="rgba(139,92,246,0.06)" stroke="rgba(139,92,246,0.15)" strokeWidth="0.6" />

        {/* Bar chart */}
        <rect x="44" y="86" width="6" height="12" rx="1" fill="#8b5cf6" opacity="0.7"><animate attributeName="height" values="12;18;12" dur="2s" repeatCount="indefinite" /><animate attributeName="y" values="86;80;86" dur="2s" repeatCount="indefinite" /></rect>
        <rect x="54" y="82" width="6" height="16" rx="1" fill="#a855f7" opacity="0.6"><animate attributeName="height" values="16;10;16" dur="2.5s" repeatCount="indefinite" /><animate attributeName="y" values="82;88;82" dur="2.5s" repeatCount="indefinite" /></rect>
        <rect x="64" y="78" width="6" height="20" rx="1" fill="#7c3aed" opacity="0.8"><animate attributeName="height" values="20;14;20" dur="1.8s" repeatCount="indefinite" /><animate attributeName="y" values="78;84;78" dur="1.8s" repeatCount="indefinite" /></rect>
        <rect x="74" y="84" width="6" height="14" rx="1" fill="#8b5cf6" opacity="0.5"><animate attributeName="height" values="14;20;14" dur="3s" repeatCount="indefinite" /><animate attributeName="y" values="84;78;84" dur="3s" repeatCount="indefinite" /></rect>
        <rect x="84" y="80" width="6" height="18" rx="1" fill="#3b82f6" opacity="0.6"><animate attributeName="height" values="18;12;18" dur="2.2s" repeatCount="indefinite" /><animate attributeName="y" values="80;86;80" dur="2.2s" repeatCount="indefinite" /></rect>

        {/* Status cards */}
        <rect x="100" y="64" width="60" height="18" rx="4" fill="rgba(139,92,246,0.08)" stroke="rgba(139,92,246,0.2)" strokeWidth="0.6" />
        <rect x="108" y="70" width="20" height="3" rx="1" fill="rgba(139,92,246,0.4)" />
        <rect x="108" y="75" width="14" height="2" rx="1" fill="rgba(139,92,246,0.2)" />
        <circle cx="148" cy="73" r="5" fill="none" stroke="#22c55e" strokeWidth="1.5" opacity="0.6">
          <animate attributeName="stroke-dasharray" values="0,32;22,10;0,32" dur="3s" repeatCount="indefinite" />
        </circle>

        <rect x="100" y="88" width="60" height="18" rx="4" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.2)" strokeWidth="0.6" />
        <rect x="108" y="94" width="16" height="3" rx="1" fill="rgba(59,130,246,0.4)" />
        <rect x="108" y="99" width="22" height="2" rx="1" fill="rgba(59,130,246,0.2)" />
        <rect x="140" y="93" width="14" height="8" rx="2" fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="0.8" opacity="0.5" />

        {/* Pie chart */}
        <circle cx="65" cy="132" r="16" fill="none" stroke="rgba(139,92,246,0.1)" strokeWidth="6" />
        <circle cx="65" cy="132" r="16" fill="none" stroke="#8b5cf6" strokeWidth="6" strokeDasharray="30 70" strokeLinecap="round" opacity="0.7" style={{ animation: "spin 8s linear infinite", transformOrigin: "65px 132px" }} />
        <circle cx="65" cy="132" r="16" fill="none" stroke="#3b82f6" strokeWidth="6" strokeDasharray="25 75" strokeDashoffset="-30" strokeLinecap="round" opacity="0.5" style={{ animation: "spin 8s linear infinite", transformOrigin: "65px 132px" }} />

        {/* Bottom stats row */}
        <rect x="100" y="114" width="60" height="28" rx="4" fill="rgba(139,92,246,0.06)" stroke="rgba(139,92,246,0.15)" strokeWidth="0.6" />
        <rect x="106" y="120" width="24" height="3" rx="1" fill="#8b5cf6" opacity="0.5" />
        <rect x="106" y="126" width="40" height="2" rx="1" fill="rgba(139,92,246,0.2)" />
        <rect x="106" y="131" width="32" height="2" rx="1" fill="rgba(139,92,246,0.12)" />

        {/* Progress line */}
        <line x1="38" y1="155" x2="162" y2="155" stroke="rgba(139,92,246,0.1)" strokeWidth="2" />
        <line x1="38" y1="155" x2="120" y2="155" stroke="url(#progressGrad)" strokeWidth="2" strokeLinecap="round">
          <animate attributeName="x2" values="80;140;80" dur="4s" repeatCount="indefinite" />
        </line>

        <defs>
          <linearGradient id="progressGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ────────────── Feature Data ────────────── */
const FEATURES = [
  { icon: Shield, title: "أمان متقدم", desc: "حماية بياناتك بأحدث معايير الأمان والتشفير المتقدم", color: "#8b5cf6" },
  { icon: Zap, title: "أداء فائق", desc: "خوادم SSD NVMe بسرعة واستقرار عاليين لمشاريعك", color: "#3b82f6" },
  { icon: Globe, title: "نطاقات مجانية", desc: "إنشاء وربط Subdomain بسهولة مع كل مشروع", color: "#22c55e" },
  { icon: Server, title: "دعم لغات متعددة", desc: "تشغيل Python وNode.js وPHP من مكان واحد", color: "#f59e0b" },
];

const LANGS = [
  { name: "Python", icon: "🐍", color: "#3776ab", glow: "rgba(55,118,171,0.4)" },
  { name: "Node.js", icon: "🟢", color: "#339933", glow: "rgba(51,153,51,0.4)" },
  { name: "PHP", icon: "🐘", color: "#777bb4", glow: "rgba(119,123,180,0.4)" },
];

const STATS = [
  { icon: Users, value: "+12,540", label: "مستخدم نشط" },
  { icon: Monitor, value: "+28,760", label: "مشروع مستضاف" },
  { icon: Activity, value: "99.9%", label: "استقرار الخدمة" },
  { icon: Headphones, value: "24/7", label: "دعم فني" },
];

/* ────────────── Intersection Observer Hook ────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("revealed"); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

/* ────────────── Main Landing Page ────────────── */
export default function LandingPage() {
  const { lang, setLang } = useLang();

  const goRegister = useCallback(() => {
    window.location.hash = "#/register";
  }, []);

  const goLogin = useCallback(() => {
    window.location.hash = "#/login";
  }, []);

  const heroRef = useReveal();
  const featuresRef = useReveal();
  const langsRef = useReveal();
  const statsRef = useReveal();

  return (
    <div className="min-h-screen overflow-x-hidden" dir="rtl" style={{ background: "#09090B" }}>
      <Particles />

      {/* ── HEADER ── */}
      <header className="fixed top-0 inset-x-0 z-50" style={{ background: "rgba(9,9,11,0.7)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(139,92,246,0.1)" }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden"
              style={{ border: "1.5px solid rgba(139,92,246,0.5)", boxShadow: "0 0 20px rgba(139,92,246,0.2)" }}>
              <img src={LOGO_URL} alt="Server Hub" className="w-full h-full object-cover" />
            </div>
            <span className="text-white font-bold text-[15px] tracking-[0.2em]" style={{ fontFamily: "'JetBrains Mono', monospace", textShadow: "0 0 20px rgba(139,92,246,0.3)" }}>
              𝐒𝐄𝐑𝐕𝐄𝐑 𝐇𝐔𝐁
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="text-zinc-500 hover:text-white transition-colors text-xs px-2 py-1 rounded-lg cursor-pointer"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {lang === "ar" ? "EN" : "عربي"}
            </button>
            <button
              onClick={goRegister}
              className="h-9 px-5 rounded-xl text-white text-sm font-semibold cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95"
              style={{ background: "linear-gradient(135deg, #6d28d9, #8b5cf6)", boxShadow: "0 0 24px rgba(139,92,246,0.35)" }}
            >
              ابدأ الآن
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section ref={heroRef} className="reveal-section pt-28 pb-16 md:pt-36 md:pb-24 relative z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="grid md:grid-cols-3 gap-8 items-center">
            {/* Right side — text */}
            <div className="md:col-span-1 text-center md:text-right order-2 md:order-1">
              <p className="text-zinc-500 text-sm mb-3 tracking-wider">نرحب بكم في</p>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-4">
                <span className="block" style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 50%, #8B5CF6 100%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", animation: "gradientShift 4s ease-in-out infinite" }}>
                  عالم استضافة
                </span>
                <span className="block text-white">المدمن</span>
              </h1>
              <p className="text-zinc-400 text-sm md:text-base leading-relaxed mb-8 max-w-md mx-auto md:mx-0 md:mr-0">
                منصة استضافة متكاملة لتشغيل مشاريع Python وNode.js وPHP من مكان واحد، بسرعة عالية، وأمان متقدم، ولوحة تحكم احترافية وسهلة الاستخدام.
              </p>
              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                <button
                  onClick={goRegister}
                  className="h-12 px-8 rounded-2xl text-white font-bold text-[15px] cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95"
                  style={{ background: "linear-gradient(135deg, #6d28d9, #7c3aed, #8b5cf6)", boxShadow: "0 4px 30px rgba(139,92,246,0.4)" }}
                >
                  ابدأ الآن
                </button>
                <button
                  onClick={goLogin}
                  className="h-12 px-8 rounded-2xl text-white font-semibold text-[15px] cursor-pointer transition-all duration-300 hover:scale-105 active:scale-95"
                  style={{ background: "transparent", border: "1.5px solid rgba(139,92,246,0.4)", boxShadow: "0 0 20px rgba(139,92,246,0.1)" }}
                >
                  لوحة التحكم
                </button>
              </div>
            </div>

            {/* Left side — server illustration */}
            <div className="md:col-span-1 order-1 md:order-2 flex justify-center">
              <ServerIllustration />
            </div>

            {/* Center — dashboard illustration */}
            <div className="md:col-span-1 order-3 flex justify-center">
              <DashboardIllustration />
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section ref={featuresRef} className="reveal-section py-16 md:py-24 relative z-10">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="group rounded-2xl p-5 md:p-6 text-center transition-all duration-500 hover:scale-[1.03] cursor-default"
                style={{
                  background: "rgba(15,10,30,0.7)",
                  border: "1px solid rgba(139,92,246,0.12)",
                  backdropFilter: "blur(10px)",
                  animationDelay: `${i * 100}ms`,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = f.color + "44";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 30px ${f.color}15`;
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(139,92,246,0.12)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }}
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{ background: `${f.color}15`, boxShadow: `0 0 20px ${f.color}20` }}>
                  <f.icon className="w-6 h-6" style={{ color: f.color }} />
                </div>
                <h3 className="text-white font-bold text-sm md:text-base mb-1.5">{f.title}</h3>
                <p className="text-zinc-500 text-xs md:text-[13px] leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LANGUAGES ── */}
      <section ref={langsRef} className="reveal-section py-12 md:py-20 relative z-10">
        <div className="max-w-4xl mx-auto px-4 md:px-8 text-center">
          <h2 className="text-white text-xl md:text-2xl font-bold mb-2">يدعم أشهر لغات الاستضافة</h2>
          <p className="text-zinc-500 text-sm mb-10">شغّل مشاريعك بلغتك المفضلة</p>
          <div className="flex justify-center gap-6 md:gap-10">
            {LANGS.map((l, i) => (
              <div
                key={i}
                className="group flex flex-col items-center gap-3 cursor-default"
              >
                <div
                  className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex items-center justify-center text-4xl md:text-5xl transition-all duration-500 hover:scale-110"
                  style={{
                    background: `linear-gradient(135deg, ${l.color}12, ${l.color}08)`,
                    border: `1.5px solid ${l.color}30`,
                    boxShadow: `0 0 0px ${l.color}00`,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 40px ${l.glow}`;
                    (e.currentTarget as HTMLDivElement).style.borderColor = l.color + "66";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0px ${l.color}00`;
                    (e.currentTarget as HTMLDivElement).style.borderColor = l.color + "30";
                  }}
                >
                  {l.icon}
                </div>
                <span className="text-zinc-400 text-sm font-medium group-hover:text-white transition-colors">{l.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section ref={statsRef} className="reveal-section py-12 md:py-20 relative z-10">
        <div className="max-w-5xl mx-auto px-4 md:px-8">
          <div className="rounded-2xl p-6 md:p-8 grid grid-cols-2 md:grid-cols-4 gap-6"
            style={{ background: "rgba(15,10,30,0.6)", border: "1px solid rgba(139,92,246,0.1)", backdropFilter: "blur(10px)" }}>
            {STATS.map((s, i) => (
              <div key={i} className="text-center">
                <s.icon className="w-6 h-6 mx-auto mb-2 text-purple-400 opacity-60" />
                <div className="text-white text-xl md:text-2xl font-extrabold mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</div>
                <div className="text-zinc-500 text-xs md:text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 py-8 text-center" style={{ borderTop: "1px solid rgba(139,92,246,0.08)" }}>
        <p className="text-zinc-600 text-xs tracking-[0.15em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          𝐒𝐄𝐑𝐕𝐄𝐑 𝐇𝐔𝗕 &copy; 2026
        </p>
      </footer>

      {/* ── Global CSS for animations ── */}
      <style>{`
        @keyframes gradientShift { 0%,100% { background-position: 0% center; } 50% { background-position: 200% center; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .reveal-section {
          opacity: 0;
          transform: translateY(30px);
          transition: opacity 0.7s ease-out, transform 0.7s ease-out;
        }
        .reveal-section.revealed {
          opacity: 1;
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
}
