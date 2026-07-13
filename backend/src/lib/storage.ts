import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";

function getDataDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || "/tmp";
  const dataDir = join(home, ".serverhub");
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  } catch {}
  return dataDir;
}

const DATA_FILE = join(getDataDir(), "v5-data.json");

export interface User {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "user";
  display_name: string;
  avatar: string | null;
  created_at: string;
  expires_at: string | null;
  disabled: boolean;
  last_login: string | null;
  custom_subdomain: string | null;
  custom_port: number | null;
  cpu_limit: number | null;
  ram_limit: number | null;
  disk_limit: number | null;
  build_cmd: string;
  run_cmd: string;
}

export interface Settings {
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_enabled: boolean;
  language: "en" | "ar";
  theme: "kali" | "ubuntu" | "hacker" | "dark";
  notifications: {
    login: boolean;
    register: boolean;
    file_upload: boolean;
    server_error: boolean;
    tunnel_created: boolean;
    session_start: boolean;
  };
}

interface StorageData {
  users: User[];
  settings: Settings;
}

const DEFAULT_SETTINGS: Settings = {
  telegram_bot_token: "",
  telegram_chat_id: "",
  telegram_enabled: false,
  language: "en",
  theme: "kali",
  notifications: {
    login: true,
    register: true,
    file_upload: true,
    server_error: true,
    tunnel_created: true,
    session_start: true,
  },
};

function loadData(): StorageData {
  if (!existsSync(DATA_FILE)) {
    const adminHash = bcrypt.hashSync("mero1212#", 10);
    const initial: StorageData = {
      users:       [{
        id: "admin-001",
        username: "elmodmen",
        password_hash: adminHash,
        role: "admin",
        display_name: "Admin",
        avatar: null,
        created_at: new Date().toISOString(),
        expires_at: null,
        disabled: false,
        last_login: null,
        custom_subdomain: "elmodmen",
        custom_port: null,
        cpu_limit: null,
        ram_limit: null,
        disk_limit: null,
        build_cmd: "",
        run_cmd: "",
      }],
      settings: DEFAULT_SETTINGS,
    };
    writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const data = JSON.parse(raw) as StorageData;
    if (!data.settings) data.settings = DEFAULT_SETTINGS;
    if (!data.users) data.users = [];
    data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    data.users = data.users.map((u) => ({
      custom_subdomain: null as string | null,
      custom_port: null as number | null,
      cpu_limit: null as number | null,
        ram_limit: null as number | null,
        disk_limit: null as number | null,
        build_cmd: "",
        run_cmd: "",
        ...u,
    }));
    return data;
  } catch {
    return { users: [], settings: DEFAULT_SETTINGS };
  }
}

function saveData(data: StorageData): void {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export const storage = {
  getUsers(): User[] { return loadData().users; },
  getUserByUsername(username: string): User | null {
    return loadData().users.find((u) => u.username === username) ?? null;
  },
  getUserById(id: string): User | null {
    return loadData().users.find((u) => u.id === id) ?? null;
  },
  createUser(user: Omit<User, "id" | "created_at" | "last_login">): User {
    const data = loadData();
    const newUser: User = { ...user, id: `user-${Date.now()}`, created_at: new Date().toISOString(), last_login: null };
    data.users.push(newUser);
    saveData(data);
    return newUser;
  },
  updateUser(id: string, updates: Partial<User>): User | null {
    const data = loadData();
    const idx = data.users.findIndex((u) => u.id === id);
    if (idx === -1) return null;
    data.users[idx] = { ...data.users[idx], ...updates };
    saveData(data);
    return data.users[idx];
  },
  deleteUser(id: string): boolean {
    const data = loadData();
    const before = data.users.length;
    data.users = data.users.filter((u) => u.id !== id);
    saveData(data);
    return data.users.length < before;
  },
  getSettings(): Settings { return loadData().settings; },
  updateSettings(updates: Partial<Settings>): Settings {
    const data = loadData();
    data.settings = { ...data.settings, ...updates };
    saveData(data);
    return data.settings;
  },
};
