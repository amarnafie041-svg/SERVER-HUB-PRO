export const BASE = import.meta.env.VITE_API_URL || "";

function getToken(): string | null {
  return localStorage.getItem("sh_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  createTerminalSession: (data: { name?: string; cwd?: string }) =>
    request<{ id: string; name: string; created_at: string; status: string }>("/api/terminal/sessions", { method: "POST", body: JSON.stringify(data) }),
  killTerminalSession: (id: string) =>
    request<{ success: boolean }>(`/api/terminal/sessions/${id}`, { method: "DELETE" }),
  getTerminalSessions: () =>
    request<Array<{ id: string; name: string; created_at: string; status: string }>>("/api/terminal/sessions"),
  checkSessionAlive: (id: string) =>
    request<{ alive: boolean }>(`/api/terminal/sessions/${id}/alive`),

  login: (username: string, password: string) =>
    request<{ token: string; user: any }>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  getMe: () => request<any>("/api/auth/me"),
  updateProfile: (data: any) => request<any>("/api/auth/profile", { method: "PUT", body: JSON.stringify(data) }),

  getUsers: () => request<any[]>("/api/users"),
  createUser: (data: any) => request<any>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: any) => request<any>(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id: string) => request<any>(`/api/users/${id}`, { method: "DELETE" }),

  getSettings: () => request<any>("/api/settings"),
  updateSettings: (data: any) => request<any>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  testTelegram: () => request<{ success: boolean }>("/api/settings/telegram/test", { method: "POST" }),

  getSystemStats: () => request<any>("/api/system/stats"),
  getSystemPorts: () => request<any[]>("/api/system/ports"),
  getSystemProcesses: () => request<any[]>("/api/system/processes"),
  killProcess: (pid: number) => request<any>(`/api/system/processes/${pid}`, { method: "DELETE" }),

  listFiles: (path: string) => request<any[]>(`/api/files/list?path=${encodeURIComponent(path)}`),
  readFile: (path: string) => request<{ content: string }>(`/api/files/read?path=${encodeURIComponent(path)}`),
  writeFile: (path: string, content: string) => request<any>("/api/files/write", { method: "POST", body: JSON.stringify({ path, content }) }),
  deleteFile: (path: string) => request<any>(`/api/files/delete?path=${encodeURIComponent(path)}`, { method: "DELETE" }),
  renameFile: (oldPath: string, newPath: string) => request<any>("/api/files/rename", { method: "POST", body: JSON.stringify({ oldPath, newPath }) }),
  createDir: (path: string) => request<any>("/api/files/mkdir", { method: "POST", body: JSON.stringify({ path }) }),
  searchFiles: (query: string) => request<any[]>(`/api/files/search?q=${encodeURIComponent(query)}`),
  extractFile: (path: string, dest?: string) =>
    request<{ success: boolean; files: string[] }>("/api/files/extract", { method: "POST", body: JSON.stringify({ path, dest }) }),

  sendChatMessage: (model: string, message: string, onChunk?: (chunk: string) => void) => {
    const token = getToken();
    return fetch(`${BASE}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ model, message, stream: !!onChunk }),
    });
  },

  getLogs: () => request<any[]>("/api/logs"),

  getContainerStats: () => request<any>("/api/system/container-stats"),
  getContainerProcesses: () => request<any[]>("/api/system/container-processes"),

  getDockerStatus: () =>
    request<{ available: boolean; containers: any[] }>("/api/docker/status"),
  getDockerInfo: () =>
    request<{ available: boolean; containers: any[]; total: number }>("/api/docker/info"),
  getMyDockerContainer: () =>
    request<{ exists: boolean; username?: string; status?: string; stats?: any }>("/api/docker/my-container"),
  dockerStartMyContainer: () =>
    request<{ success: boolean }>(`/api/docker/my-container/start`, { method: "POST" }),
  dockerStopMyContainer: () =>
    request<{ success: boolean }>(`/api/docker/my-container/stop`, { method: "POST" }),
  dockerRestartMyContainer: () =>
    request<{ success: boolean }>(`/api/docker/my-container/restart`, { method: "POST" }),
  getDockerContainerStats: (username: string) =>
    request<any>(`/api/docker/container/${encodeURIComponent(username)}/stats`),
  getDockerContainerLogs: (username: string, tail?: number) =>
    request<any[]>(`/api/docker/container/${encodeURIComponent(username)}/logs${tail ? `?tail=${tail}` : ""}`),
  getDockerContainerProcesses: (username: string) =>
    request<any[]>(`/api/docker/container/${encodeURIComponent(username)}/processes`),
  dockerStartContainer: (username: string) =>
    request<{ success: boolean }>(`/api/docker/container/${encodeURIComponent(username)}/start`, { method: "POST" }),
  dockerStopContainer: (username: string) =>
    request<{ success: boolean }>(`/api/docker/container/${encodeURIComponent(username)}/stop`, { method: "POST" }),
  dockerRestartContainer: (username: string) =>
    request<{ success: boolean }>(`/api/docker/container/${encodeURIComponent(username)}/restart`, { method: "POST" }),
  dockerPauseContainer: (username: string) =>
    request<{ success: boolean }>(`/api/docker/container/${encodeURIComponent(username)}/pause`, { method: "POST" }),
  dockerUnpauseContainer: (username: string) =>
    request<{ success: boolean }>(`/api/docker/container/${encodeURIComponent(username)}/unpause`, { method: "POST" }),
  dockerRemoveContainer: (username: string) =>
    request<{ success: boolean }>(`/api/docker/container/${encodeURIComponent(username)}`, { method: "DELETE" }),

  getActivity: (params?: { q?: string; action?: string; status?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.q) searchParams.set("q", params.q);
    if (params?.action) searchParams.set("action", params.action);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    return request<{ items: any[]; total: number }>(`/api/activity?${searchParams.toString()}`);
  },
  getActivityStats: () => request<any>("/api/activity/stats"),
  clearActivity: () => request<{ success: boolean }>("/api/activity", { method: "DELETE" }),
};

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  return fetch(`${BASE}${url}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}
