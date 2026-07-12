import { useState, useRef, useCallback, useEffect } from "react";
import Editor from "@monaco-editor/react";
import {
  ChevronRight, ChevronDown, ChevronLeft, Folder, FolderOpen,
  FileText, FileCode, FileJson, Image, Save, Plus, FolderPlus,
  X, Trash2, Edit2, PanelLeftClose, PanelLeft, CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

const HIDDEN_SYSTEM_ITEMS = new Set([
  ".cache", ".config", ".local", "bin", "projects", "tmp",
  ".bashrc", ".sandbox-shell.sh", ".sandboxrc", ".zshrc",
]);

interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  ext: string;
  language?: string;
}

interface OpenTab {
  path: string;
  name: string;
  content: string;
  language: string;
  modified: boolean;
}

function getFileIcon(name: string, ext: string): { Icon: any; color: string } {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return { Icon: FileJson, color: "#f59e0b" };
  if ([".ts", ".tsx"].some((e) => lower.endsWith(e))) return { Icon: FileCode, color: "#3b82f6" };
  if ([".js", ".jsx"].some((e) => lower.endsWith(e))) return { Icon: FileCode, color: "#eab308" };
  if ([".py"].some((e) => lower.endsWith(e))) return { Icon: FileCode, color: "#22c55e" };
  if ([".css", ".scss"].some((e) => lower.endsWith(e))) return { Icon: FileCode, color: "#06b6d4" };
  if ([".html"].some((e) => lower.endsWith(e))) return { Icon: FileCode, color: "#f97316" };
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"].some((e) => lower.endsWith(e))) return { Icon: Image, color: "#ec4899" };
  if ([".md", ".mdx"].some((e) => lower.endsWith(e))) return { Icon: FileText, color: "#a855f7" };
  return { Icon: FileText, color: "#71717a" };
}

function FileTreeNode({ node, depth, activeTabPath, onOpen, onContextMenu, onRefresh }: {
  node: FileNode; depth: number; activeTabPath: string | null;
  onOpen: (node: FileNode) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!node.is_dir || !expanded) return;
    setLoading(true);
    api.listFiles(node.path).then((data: any) => setChildren(data?.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, [node.path, node.is_dir, expanded, onRefresh]);

  const isActive = !node.is_dir && node.path === activeTabPath;
  const { Icon, color } = getFileIcon(node.name, node.ext);

  return (
    <div>
      <div className={`flex items-center gap-1.5 py-1 cursor-pointer rounded-sm group text-sm transition-all ${isActive ? "bg-accent/15 text-white" : "hover:bg-white/5 text-zinc-400 hover:text-zinc-200"}`}
        style={{ paddingLeft: `${6 + depth * 14}px`, paddingRight: "8px" }}
        onClick={() => { if (node.is_dir) setExpanded(!expanded); else onOpen(node); }}
        onContextMenu={(e) => onContextMenu(e, node)}>
        {node.is_dir ? (
          <>{expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-zinc-600" />}
            {expanded ? <FolderOpen className="w-4 h-4 shrink-0 text-yellow-400" /> : <Folder className="w-4 h-4 shrink-0 text-yellow-400" />}</>
        ) : (
          <><span className="w-3.5 shrink-0" /><Icon className="w-4 h-4 shrink-0" style={{ color }} /></>
        )}
        <span className="font-mono text-xs truncate flex-1">{node.name}</span>
        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
      </div>
      {node.is_dir && expanded && (
        <div>
          {loading ? (
            <div style={{ paddingLeft: `${20 + depth * 14}px` }} className="py-1">
              <div className="h-4 w-20 rounded animate-pulse" style={{ background: "#1d1033" }} />
            </div>
          ) : (
            children.map((child) => <FileTreeNode key={child.path} node={child} depth={depth + 1} activeTabPath={activeTabPath} onOpen={onOpen} onContextMenu={onContextMenu} onRefresh={onRefresh} />)
          )}
        </div>
      )}
    </div>
  );
}

function NewItemModal({ title, onConfirm, onClose }: { title: string; onConfirm: (name: string) => void; onClose: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-xl border p-5 w-80 space-y-4" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <Input value={value} onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) { onConfirm(value.trim()); onClose(); } if (e.key === "Escape") onClose(); }}
          className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white font-mono text-sm" autoFocus placeholder="filename.txt" />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-zinc-400">Cancel</Button>
          <Button size="sm" onClick={() => { if (value.trim()) { onConfirm(value.trim()); onClose(); } }} className="bg-primary hover:bg-primary/90">Create</Button>
        </div>
      </div>
    </div>
  );
}

export default function EditorPage() {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [rootPath] = useState("/home/runner");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: FileNode } | null>(null);
  const [renamingNode, setRenamingNode] = useState<{ node: FileNode; value: string } | null>(null);
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
  const [rootLoading, setRootLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setRootLoading(true);
    api.listFiles(rootPath).then((data: any) => setRootFiles(data?.items || [])).catch((e: any) => { console.error("Failed to list root files:", e); }).finally(() => setRootLoading(false));
  }, [rootPath, refreshKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const tabsRef = useRef<OpenTab[]>([]);
  tabsRef.current = tabs;

  const openFile = useCallback(async (node: FileNode) => {
    if (node.is_dir) return;
    const existing = tabsRef.current.find((t) => t.path === node.path);
    if (existing) { setActiveTabPath(node.path); return; }
    try {
      const data = await api.readFile(node.path);
      const ext = node.name.split(".").pop() || "";
      const langMap: Record<string, string> = { ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", py: "python", json: "json", html: "html", css: "css", md: "markdown", yaml: "yaml", sh: "shell", php: "php", txt: "plaintext" };
      const language = langMap[ext] || "plaintext";
      setTabs((prev) => [...prev, { path: node.path, name: node.name, content: data.content ?? "", language, modified: false }]);
      setActiveTabPath(node.path);
    } catch (e: any) {
      console.error("Failed to open file:", node.path, e);
      toast({ title: "Failed to open file", description: e?.message || node.name, variant: "destructive" });
    }
  }, [toast]);

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value == null || !activeTabPath) return;
    const currentPath = activeTabPath;
    setTabs((prev) => prev.map((t) => t.path === currentPath ? { ...t, content: value, modified: true } : t));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await api.writeFile(currentPath, value);
        setTabs((prev) => prev.map((t) => t.path === currentPath ? { ...t, modified: false } : t));
      } catch {}
    }, 1500);
  }, [activeTabPath]);

  const saveCurrentFile = useCallback(async () => {
    const tab = tabs.find((t) => t.path === activeTabPath);
    if (!tab) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    try {
      await api.writeFile(tab.path, tab.content);
      setTabs((prev) => prev.map((t) => t.path === tab.path ? { ...t, modified: false } : t));
      toast({ title: "Saved", description: tab.name });
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
  }, [tabs, activeTabPath, toast]);

  const closeTab = (path: string) => {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.path !== path);
      if (activeTabPath === path) setActiveTabPath(remaining.length > 0 ? remaining[remaining.length - 1].path : null);
      return remaining;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, node: FileNode) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, node }); };

  const handleDelete = async () => {
    if (!contextMenu) return;
    try {
      await api.deleteFile(contextMenu.node.path);
      refresh();
      toast({ title: "Deleted", description: contextMenu.node.name });
      if (activeTabPath === contextMenu.node.path) closeTab(contextMenu.node.path);
      setContextMenu(null);
    } catch { toast({ title: "Delete failed", variant: "destructive" }); }
  };

  const handleRename = () => { if (contextMenu) { setRenamingNode({ node: contextMenu.node, value: contextMenu.node.name }); setContextMenu(null); } };

  const commitRename = async () => {
    if (!renamingNode) return;
    const dir = renamingNode.node.path.split("/").slice(0, -1).join("/");
    const newPath = `${dir}/${renamingNode.value}`;
    try {
      await api.renameFile(renamingNode.node.path, newPath);
      refresh();
      setRenamingNode(null);
      toast({ title: "Renamed" });
    } catch { toast({ title: "Rename failed", variant: "destructive" }); }
  };

  const createNewFile = async (name: string) => {
    try {
      await api.writeFile(`${rootPath}/${name}`, "");
      refresh();
      toast({ title: "Created", description: name });
    } catch { toast({ title: "Create failed", variant: "destructive" }); }
  };

  const createNewFolder = async (name: string) => {
    try {
      await api.createDir(`${rootPath}/${name}`);
      refresh();
      toast({ title: "Folder created", description: name });
    } catch { toast({ title: "Create failed", variant: "destructive" }); }
  };

  const activeTab = tabs.find((t) => t.path === activeTabPath);

  return (
    <div className="flex h-full overflow-hidden" onClick={() => contextMenu && setContextMenu(null)}>
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-5 h-10 rounded-r-lg border-r border-t border-b transition-all hover:bg-accent/20"
        style={{ background: "#1d1033", borderColor: "rgba(139,92,246,0.3)", left: sidebarOpen ? "224px" : "0px", transition: "left 0.2s" }}
        title={sidebarOpen ? "Close sidebar" : "Open sidebar"}>
        {sidebarOpen ? <ChevronLeft className="w-3 h-3 text-zinc-400" /> : <ChevronRight className="w-3 h-3 text-zinc-400" />}
      </button>

      <div className="flex flex-col border-r overflow-hidden transition-all duration-200 shrink-0"
        style={{ width: sidebarOpen ? "224px" : "0px", background: "#0b0616", borderColor: "rgba(139,92,246,0.2)" }}>
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0" style={{ borderColor: "rgba(139,92,246,0.15)" }}>
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Explorer</span>
          <div className="flex gap-0.5">
            <button onClick={() => setNewFileModal(true)} className="p-1.5 text-zinc-600 hover:text-white rounded-md hover:bg-white/5 transition-colors" title="New File"><Plus className="w-3.5 h-3.5" /></button>
            <button onClick={() => setNewFolderModal(true)} className="p-1.5 text-zinc-600 hover:text-white rounded-md hover:bg-white/5 transition-colors" title="New Folder"><FolderPlus className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1 min-h-0">
          {rootLoading ? (
            <div className="p-3 space-y-1.5">{[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-5 rounded animate-pulse" style={{ background: "#1d1033", width: `${60 + i * 10}%` }} />)}</div>
          ) : (
            rootFiles.map((node) => <FileTreeNode key={node.path} node={node} depth={0} activeTabPath={activeTabPath} onOpen={openFile} onContextMenu={handleContextMenu} onRefresh={refresh} />)
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "#0b0616" }}>
        <div className="flex items-center border-b shrink-0 overflow-x-auto scrollbar-none"
          style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)", minHeight: "40px" }}>
          <div className="flex items-center flex-1 min-w-0">
            {tabs.map((tab) => {
              const { Icon, color } = getFileIcon(tab.name, "");
              return (
                <div key={tab.path} onClick={() => setActiveTabPath(tab.path)}
                  className={`flex items-center gap-1.5 px-3 py-2 cursor-pointer border-r text-xs font-mono whitespace-nowrap group shrink-0 transition-all ${tab.path === activeTabPath ? "bg-[#0b0616] text-white border-b-2 border-b-accent" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}
                  style={{ borderRightColor: "rgba(139,92,246,0.1)" }}>
                  <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: tab.path === activeTabPath ? color : undefined }} />
                  <span>{tab.name}</span>
                  {tab.modified && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved" />}
                  <button onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }} className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"><X className="w-3 h-3" /></button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1 px-2 shrink-0 border-l" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
            {activeTab && (
              <Button variant="ghost" size="sm" onClick={saveCurrentFile}
                className={`h-7 gap-1.5 text-xs px-2 ${activeTab.modified ? "text-amber-400 hover:text-amber-300" : "text-zinc-500 hover:text-white"}`}>
                {activeTab.modified ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {activeTab.modified ? "Unsaved" : "Saved"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="h-7 w-7 p-0 text-zinc-600 hover:text-white">
              {sidebarOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab ? (
            <Editor key={activeTab.path} height="100%" language={activeTab.language || "plaintext"} value={activeTab.content} onChange={handleEditorChange}
              theme="vs-dark"
              options={{ fontSize: 14, fontFamily: '"JetBrains Mono", "Fira Code", monospace', minimap: { enabled: true, scale: 1 }, lineNumbers: "on", wordWrap: "on", automaticLayout: true, scrollBeyondLastLine: false, bracketPairColorization: { enabled: true }, suggestOnTriggerCharacters: true, quickSuggestions: true, cursorBlinking: "smooth", renderLineHighlight: "gutter", tabSize: 2, padding: { top: 16, bottom: 16 }, smoothScrolling: true, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 } }}
              onMount={(editor) => { editor.addCommand(2097, () => saveCurrentFile()); }} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-700">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.08)" }}>
                <FileCode className="w-10 h-10 opacity-40" />
              </div>
              <div className="text-center"><p className="text-sm font-medium text-zinc-500">Select a file to open</p><p className="text-xs text-zinc-700 mt-1">Use the file tree on the left</p></div>
              <Button variant="outline" size="sm" onClick={() => setSidebarOpen(true)} className="border-[rgba(139,92,246,0.3)] text-zinc-400 hover:text-white gap-2">
                <PanelLeft className="w-4 h-4" /> Open Explorer
              </Button>
            </div>
          )}
        </div>

        {activeTab && (
          <div className="flex items-center justify-between px-4 py-1 border-t text-xs font-mono shrink-0" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.15)" }}>
            <span className="text-zinc-600 truncate">{activeTab.path}</span>
            <div className="flex items-center gap-3 shrink-0 text-zinc-600">
              <span>{activeTab.language || "plaintext"}</span>
              {activeTab.modified && <span className="text-amber-400">● modified</span>}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <div className="fixed z-50 min-w-[180px] rounded-xl border py-1.5 shadow-2xl"
          style={{ top: contextMenu.y, left: contextMenu.x, background: "#140a24", borderColor: "rgba(139,92,246,0.3)" }}
          onMouseLeave={() => setContextMenu(null)}>
          {!contextMenu.node.is_dir && (
            <button onClick={() => { openFile(contextMenu.node); setContextMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-white/8 hover:text-white flex items-center gap-2.5 transition-colors">
              <FileText className="w-3.5 h-3.5 text-accent" /> Open
            </button>
          )}
          <button onClick={handleRename} className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-white/8 hover:text-white flex items-center gap-2.5 transition-colors">
            <Edit2 className="w-3.5 h-3.5 text-zinc-500" /> Rename
          </button>
          <div className="my-1 border-t" style={{ borderColor: "rgba(139,92,246,0.15)" }} />
          <button onClick={handleDelete} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      {renamingNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRenamingNode(null)}>
          <div className="rounded-xl border p-5 w-80 space-y-4" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Edit2 className="w-4 h-4 text-accent" /> Rename</h3>
            <Input value={renamingNode.value} onChange={(e) => setRenamingNode((prev) => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingNode(null); }}
              className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white font-mono text-sm" autoFocus />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setRenamingNode(null)} className="text-zinc-400">Cancel</Button>
              <Button size="sm" onClick={commitRename} className="bg-primary hover:bg-primary/90">Rename</Button>
            </div>
          </div>
        </div>
      )}

      {newFileModal && <NewItemModal title="New File" onConfirm={createNewFile} onClose={() => setNewFileModal(false)} />}
      {newFolderModal && <NewItemModal title="New Folder" onConfirm={createNewFolder} onClose={() => setNewFolderModal(false)} />}
    </div>
  );
}
