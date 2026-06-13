import { useState, useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { ToastProvider } from "@/contexts/toast";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { LanguageProvider } from "@/contexts/language";
import { Layout } from "@/components/layout";
import { BASE } from "@/lib/api";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const TerminalPage = lazy(() => import("@/pages/terminal"));
const EditorPage = lazy(() => import("@/pages/editor"));
const FilesPage = lazy(() => import("@/pages/files"));
const AIPage = lazy(() => import("@/pages/ai"));
const AdminPage = lazy(() => import("@/pages/admin"));
const ProfilePage = lazy(() => import("@/pages/profile"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const CommandsPage = lazy(() => import("@/pages/commands"));
const ActivityPage = lazy(() => import("@/pages/activity"));
const DockerPage = lazy(() => import("@/pages/docker"));
const LoginPage = lazy(() => import("@/pages/login"));
const NotFound = lazy(() => import("@/pages/not-found"));

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen" style={{ background: "#0b0616" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
          style={{ boxShadow: "0 0 40px rgba(139,92,246,0.5)" }}>
          <img src="/logo.jpg" alt="MODMEN" className="w-full h-full object-cover" />
        </div>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#8b5cf6", borderTopColor: "transparent" }} />
      </div>
    </div>
  );
}

function useHashRouter() {
  const [path, setPath] = useState(() => {
    const hash = window.location.hash.replace(/^#/, "") || "/";
    return hash;
  });

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace(/^#/, "") || "/";
      setPath(hash);
    };
    window.addEventListener("hashchange", handler);
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("hashchange", handler);
      window.removeEventListener("popstate", handler);
    };
  }, []);

  const navigate = (to: string) => {
    window.location.hash = to;
  };

  return { path, navigate };
}

function AppRoutes() {
  const { user, isLoading } = useAuth();
  const { path, navigate } = useHashRouter();

  if (isLoading) return <LoadingScreen />;

  if (!user) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <LoginPage />
      </Suspense>
    );
  }

  const renderPage = () => {
    const p = path.split("?")[0];
    switch (p) {
      case "/": return <Dashboard />;
      case "/terminal": return <TerminalPage />;
      case "/editor": return <EditorPage />;
      case "/files": return <FilesPage />;
      case "/ai": return <AIPage />;
      case "/admin": return user.role === "admin" ? <AdminPage /> : <Dashboard />;
      case "/settings": return user.role === "admin" ? <SettingsPage /> : <Dashboard />;
      case "/commands": return <CommandsPage />;
      case "/docker": return <DockerPage />;
      case "/activity": return user.role === "admin" ? <ActivityPage /> : <Dashboard />;
      case "/profile": return <ProfilePage />;
      default: return <NotFound />;
    }
  };

  return (
    <Layout path={path} navigate={navigate}>
      <Suspense fallback={<LoadingScreen />}>
        {renderPage()}
      </Suspense>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Keep server alive (Render sleep prevention)
  useEffect(() => {
    const ping = () => {
      const token = localStorage.getItem("sh_token");
      if (token) fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 600000);
    return () => clearInterval(id);
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <Toaster />
        </ToastProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

export default App;
