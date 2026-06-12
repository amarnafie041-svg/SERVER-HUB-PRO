import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "@/lib/api";

export interface AuthUser {
  id: string;
  username: string;
  role: "admin" | "user";
  display_name: string;
  avatar: string | null;
  expires_at: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
  updateProfileLocally: (fields: Partial<AuthUser>) => void;
  profileVersion: number;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("sh_token"));
  const [isLoading, setIsLoading] = useState(true);
  const [profileVersion, setProfileVersion] = useState(0);

  const refreshMe = useCallback(async () => {
    const t = localStorage.getItem("sh_token");
    if (!t) { setUser(null); setIsLoading(false); return; }
    try {
      const data = await api.getMe();
      setUser(data);
    } catch {
      localStorage.removeItem("sh_token");
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateProfileLocally = useCallback((fields: Partial<AuthUser>) => {
    setUser(prev => prev ? { ...prev, ...fields } : null);
    setProfileVersion(v => v + 1);
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.login(username, password);
    localStorage.setItem("sh_token", data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("sh_token");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshMe, updateProfileLocally, profileVersion, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
