import { useState } from "react";
import { useAuth } from "@/contexts/auth";
import { useLang } from "@/contexts/language";
import { Loader2, Eye, EyeOff, User, Lock, Globe, Activity } from "lucide-react";

const LOGO_URL = "https://i.ibb.co/s9P5XZrz/IMG-20260525-202044-835.jpg";

export default function LoginPage() {
  const { login } = useAuth();
  const { lang, setLang, t } = useLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError(lang === "ar" ? "يرجى ملء جميع الحقول" : "Please fill in all fields");
      return;
    }
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || t("invalid_credentials"));
    } finally {
      setLoading(false);
    }
  };

  const bgStyle: React.CSSProperties = {
    background: "linear-gradient(180deg, #0a0015 0%, #0f0220 30%, #0d0d2b 60%, #0a0015 100%)",
  };

  const lightStyle: React.CSSProperties = {
    background: "radial-gradient(ellipse 50% 55% at 50% 0%, rgba(120,40,200,0.55) 0%, rgba(90,20,160,0.35) 20%, rgba(60,10,120,0.15) 45%, transparent 70%)",
  };

  const softGlowStyle: React.CSSProperties = {
    background: "radial-gradient(ellipse at center, rgba(139,92,246,0.3) 0%, transparent 65%)",
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(12,4,28,0.92)",
    border: "1px solid rgba(139,92,246,0.25)",
    boxShadow: "0 0 80px rgba(139,92,246,0.08), 0 0 40px rgba(139,92,246,0.05), inset 0 1px 0 rgba(255,255,255,0.04)",
    backdropFilter: "blur(20px)",
  };

  const inputStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(139,92,246,0.25)",
  };

  const submitStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #6d28d9 0%, #7c3aed 40%, #a855f7 100%)",
    boxShadow: "0 4px 20px rgba(139,92,246,0.35)",
  };

  const langBtnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(10px)",
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "rgba(139,92,246,0.55)";
    e.target.style.boxShadow = "0 0 20px rgba(139,92,246,0.12)";
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = "rgba(139,92,246,0.25)";
    e.target.style.boxShadow = "none";
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={bgStyle}>
      {/* Animated background particles */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[700px] pointer-events-none animate-pulse-glow" style={lightStyle} />
      <div className="absolute top-[200px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none opacity-30 animate-float" style={softGlowStyle} />
      <div className="absolute bottom-20 left-10 w-32 h-32 rounded-full pointer-events-none opacity-5"
        style={{ background: "radial-gradient(circle, #a855f7, transparent)", animation: "float 5s ease-in-out infinite" }} />
      <div className="absolute top-40 right-10 w-24 h-24 rounded-full pointer-events-none opacity-5"
        style={{ background: "radial-gradient(circle, #8b5cf6, transparent)", animation: "float 4s ease-in-out infinite 1s" }} />

      <button
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        className="absolute top-4 md:top-5 right-4 md:right-5 flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-medium text-white/70 hover:text-white transition-all z-20 cursor-pointer"
        style={langBtnStyle}
      >
        <Globe className="w-4 h-4" />
        {lang === "en" ? "العربية" : "English"}
      </button>

      <div className="w-full max-w-[400px] relative z-10" dir={lang === "ar" ? "rtl" : "ltr"}>
        <div className="rounded-3xl p-6 md:p-8 animate-scaleIn" style={cardStyle}>
          <div className="flex flex-col items-center mb-6">
            <div className="w-[100px] h-[100px] md:w-[120px] md:h-[120px] rounded-[20px] flex items-center justify-center mb-4 overflow-hidden animate-float"
              style={{ border: "2.5px solid rgba(139,92,246,0.55)", boxShadow: "0 0 40px rgba(139,92,246,0.35)" }}>
              <img src={LOGO_URL} alt="MODMEN" className="w-full h-full object-cover rounded-[18px]" draggable={false} />
            </div>
            <h1 className="text-[18px] md:text-[20px] font-bold tracking-[0.35em] text-white mb-0.5" style={{ fontFamily: "'JetBrains Mono', monospace", textShadow: "0 0 25px rgba(139,92,246,0.3)" }}>
              𝐒𝐄𝐑𝐕𝐄𝐑 𝐇𝐔𝐁
            </h1>
            <p className="text-[10px] md:text-[11px] text-zinc-500 tracking-wider">Professional Server Management</p>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-[22px] md:text-[24px] font-bold text-white mb-1">Welcome back</h2>
            <p className="text-zinc-400 text-[12px] md:text-[13px]">{t("login_subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("username")}</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                  <User className="w-[18px] h-[18px]" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={lang === "ar" ? "أدخل اسم المستخدم" : "Enter your username"}
                  autoFocus
                  className="w-full h-[48px] pl-10 pr-4 rounded-xl text-white text-[14px] placeholder:text-zinc-600 focus:outline-none transition-all"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-zinc-300 mb-1.5">{t("password")}</label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                  <Lock className="w-[18px] h-[18px]" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={lang === "ar" ? "أدخل كلمة المرور" : "Enter your password"}
                  className="w-full h-[48px] pl-10 pr-11 rounded-xl text-white text-[14px] placeholder:text-zinc-600 focus:outline-none transition-all"
                  style={inputStyle}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer p-1"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-[13px] px-4 py-2.5 rounded-xl animate-fadeIn" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[48px] rounded-xl text-white font-semibold text-[15px] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:opacity-90 active:scale-[0.98]"
              style={submitStyle}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t("signing_in")}
                </span>
              ) : t("sign_in")}
            </button>
          </form>

          <p className="text-center text-zinc-600 text-[11px] mt-6 tracking-[0.15em]">
            𝐒𝐄𝐑𝐕𝐄𝐑 𝐇𝐔𝐁 &copy; 2026
          </p>
        </div>
      </div>
    </div>
  );
}
