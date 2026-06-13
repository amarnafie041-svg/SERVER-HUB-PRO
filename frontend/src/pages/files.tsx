import { useState, useCallback, useRef, useEffect } from "react";
import {
  Folder, FileText, Image, Code,
  ChevronRight, Grid, List, Search, Plus, FolderPlus, MoreVertical,
  Trash2, Edit2, Upload, Home, ArrowLeft, X, Check, Eye,
  File, FileUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/contexts/language";
import { api, BASE } from "@/lib/api";

const HOME = "/home/runner";

type ViewMode = "grid" | "list";
type SortKey = "name" | "size" | "date";

const ICON_MAP: Record<string, React.ElementType> = { image: Image, folder: Folder, code: Code };
const COLOR_MAP: Record<string, string> = {
  image: "text-pink-400", javascript: "text-yellow-400", typescript: "text-blue-400",
  python: "text-yellow-300", html: "text-orange-500", css: "text-blue-500",
  json: "text-amber-300", markdown: "text-purple-400",
};

function FileIcon({ icon, isDir, size = "w-8 h-8" }: { icon: string; isDir: boolean; size?: string }) {
  if (isDir) return <Folder className={`${size} text-yellow-400`} />;
  const IconComp = ICON_MAP[icon] || FileText;
  const color = COLOR_MAP[icon] || "text-zinc-400";
  return <IconComp className={`${size} ${color}`} />;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="rounded-2xl border w-full max-w-sm p-5 space-y-4" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.3)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white text-sm">{title}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState(HOME);
  const [pathHistory, setPathHistory] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: any } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [previewFile, setPreviewFile] = useState<{ path: string; content?: string; isImage?: boolean; name: string; imageUrl?: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [extractModal, setExtractModal] = useState(false);
  const [extractPath, setExtractPath] = useState("");
  const [extractDest, setExtractDest] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useLang();

  const isSearching = searchQuery.trim().length > 0;

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    setLoading(true);
    if (isSearching) {
      api.searchFiles(searchQuery).then((data: any) => setItems(data || [])).catch(() => {}).finally(() => setLoading(false));
    } else {
      api.listFiles(currentPath).then((data: any) => setItems(data?.items || [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [currentPath, isSearching, searchQuery, refreshKey]);

  const navigate = (path: string) => {
    setPathHistory((prev) => [...prev, currentPath]);
    setCurrentPath(path);
    setSearchQuery("");
  };

  const goBack = () => {
    const prev = pathHistory[pathHistory.length - 1];
    if (prev) { setCurrentPath(prev); setPathHistory((h) => h.slice(0, -1)); }
  };

  const handleItemClick = async (item: any) => {
    if (item.is_dir) { navigate(item.path); return; }
    try {
      const data = await api.readFile(item.path);
      if (data.content !== undefined) {
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"];
        if (imageExts.some((e) => item.name.toLowerCase().endsWith(e))) {
          const token = localStorage.getItem("sh_token");
          const resp = await fetch(`${BASE}/api/files/read?path=${encodeURIComponent(item.path)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          setPreviewFile({ path: item.path, isImage: true, name: item.name, imageUrl: url });
        } else {
          setPreviewFile({ path: item.path, content: data.content, name: item.name });
        }
      }
    } catch {}
  };

  const handleDelete = async (item: any) => {
    try {
      await api.deleteFile(item.path);
      refresh();
      toast({ title: "Deleted", description: item.name });
      setContextMenu(null);
    } catch { toast({ title: "Error", description: "Failed to delete", variant: "destructive" }); }
  };

  const commitRename = async (item: any) => {
    if (!renameValue.trim()) { setRenamingPath(null); return; }
    const dir = item.path.split("/").slice(0, -1).join("/");
    const newPath = `${dir}/${renameValue}`;
    try {
      await api.renameFile(item.path, newPath);
      refresh();
      setRenamingPath(null);
      toast({ title: "Renamed" });
    } catch { toast({ title: "Rename failed", variant: "destructive" }); }
  };

  const handleNewFile = async () => {
    if (!newFileName.trim()) return;
    try {
      await api.writeFile(`${currentPath}/${newFileName.trim()}`, "");
      refresh();
      toast({ title: "File created", description: newFileName });
      setNewFileModal(false);
      setNewFileName("");
    } catch { toast({ title: "Create failed", variant: "destructive" }); }
  };

  const handleNewFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await api.createDir(`${currentPath}/${newFolderName.trim()}`);
      refresh();
      toast({ title: "Folder created", description: newFolderName });
      setNewFolderModal(false);
      setNewFolderName("");
    } catch { toast({ title: "Create failed", variant: "destructive" }); }
  };

  const handleExtract = async () => {
    if (!extractPath.trim()) return;
    setExtracting(true);
    try {
      const result = await api.extractFile(extractPath.trim(), extractDest.trim() || undefined);
      refresh();
      toast({ title: "Extracted", description: `${result.files?.length || 0} file(s) extracted` });
      setExtractModal(false);
      setExtractPath("");
      setExtractDest("");
    } catch (e: any) {
      toast({ title: "Extraction failed", description: e.message || "Unknown error", variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const closePreview = useCallback(() => {
    setPreviewFile((prev) => {
      if (prev?.imageUrl) URL.revokeObjectURL(prev.imageUrl);
      return null;
    });
  }, []);

  const handleUpload = async (files: FileList) => {
    const uploadFile = (file: File) => new Promise<void>((resolve) => {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("sh_token");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}/api/files/upload`);
      xhr.setRequestHeader("x-upload-path", currentPath);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          toast({ title: `Uploading ${file.name}...`, description: `${Math.round((e.loaded / e.total) * 100)}%` });
        }
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.success) {
            refresh();
            toast({ title: "Uploaded", description: file.name });
          } else {
            toast({ title: "Upload failed", description: data.message || file.name, variant: "destructive" });
          }
        } catch {
          toast({ title: "Upload failed", description: file.name, variant: "destructive" });
        }
        resolve();
      };
      xhr.onerror = () => {
        toast({ title: "Upload failed", description: file.name, variant: "destructive" });
        resolve();
      };
      xhr.send(form);
    });
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }
  };

  const sorted = [...items].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    if (sortKey === "name") return a.name.localeCompare(b.name);
    if (sortKey === "size") return (a.size_bytes || 0) - (b.size_bytes || 0);
    return a.modified?.localeCompare(b.modified) || 0;
  });

  const breadcrumbs = currentPath.split("/").filter(Boolean);

  return (
    <div className="flex flex-col h-full overflow-hidden" onClick={() => contextMenu && setContextMenu(null)}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0 flex-wrap gap-y-2" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" onClick={goBack} disabled={pathHistory.length === 0} className="h-7 w-7 text-zinc-500 hover:text-white disabled:opacity-30"><ArrowLeft className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="icon" onClick={() => { setCurrentPath(HOME); setPathHistory([]); }} className="h-7 w-7 text-zinc-500 hover:text-white"><Home className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="flex items-center gap-0.5 text-xs font-mono flex-1 min-w-0 overflow-x-auto scrollbar-none">
          <button onClick={() => { setCurrentPath("/"); setPathHistory([]); }} className="text-zinc-600 hover:text-white px-1 transition-colors shrink-0">/</button>
          {breadcrumbs.map((seg, i) => {
            const path = "/" + breadcrumbs.slice(0, i + 1).join("/");
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={path} className="flex items-center gap-0.5 shrink-0">
                <ChevronRight className="w-3 h-3 text-zinc-700" />
                <button onClick={() => { setCurrentPath(path); setPathHistory((p) => [...p, currentPath]); }}
                  className={`px-1 py-0.5 rounded transition-colors ${isLast ? "text-white" : "text-zinc-500 hover:text-white"}`}>{seg}</button>
              </span>
            );
          })}
        </div>
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("search")}
            className="pl-8 h-8 w-40 text-xs bg-[#1d1033] border-[rgba(139,92,246,0.25)] text-white placeholder:text-zinc-700" />
          {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white"><X className="w-3 h-3" /></button>}
        </div>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-8 text-xs bg-[#1d1033] border border-[rgba(139,92,246,0.25)] text-zinc-400 rounded-md px-2 outline-none hover:border-accent/40 transition-colors">
          <option value="name">{t("name")}</option>
          <option value="size">{t("size")}</option>
          <option value="date">{t("date")}</option>
        </select>
        <div className="flex border rounded-lg overflow-hidden shrink-0" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
          <button onClick={() => setViewMode("grid")} className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary/80 text-white" : "text-zinc-600 hover:text-white bg-transparent"}`}><Grid className="w-3.5 h-3.5" /></button>
          <button onClick={() => setViewMode("list")} className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary/80 text-white" : "text-zinc-600 hover:text-white bg-transparent"}`}><List className="w-3.5 h-3.5" /></button>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => setNewFileModal(true)} className="h-8 px-2.5 text-xs text-zinc-400 hover:text-white gap-1.5">
            <Plus className="w-3.5 h-3.5" /> {t("new_file")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNewFolderModal(true)} className="h-8 px-2 text-zinc-500 hover:text-white" title={t("new_folder")}><FolderPlus className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setExtractModal(true)} className="h-8 px-2 text-zinc-500 hover:text-white" title="Extract"><FileUp className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="h-8 px-2 text-zinc-500 hover:text-white" title={t("upload")}><Upload className="w-3.5 h-3.5" /></Button>
          <input ref={fileInputRef} type="file" multiple className="hidden" accept="*/*" onChange={(e) => { if (e.target.files) { handleUpload(e.target.files); e.target.value = ""; } }} />
        </div>
      </div>

      <div className={`flex-1 overflow-auto p-4 relative ${isDragging ? "ring-2 ring-inset ring-accent/50 bg-accent/5" : ""}`}>
        {loading ? (
          <div className={viewMode === "grid" ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3" : "space-y-1.5"}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className={viewMode === "grid" ? "h-24 rounded-xl animate-pulse" : "h-11 rounded-lg animate-pulse"} style={{ background: "#140a24" }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-700">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.08)" }}>
              <Folder className="w-8 h-8 opacity-30" />
            </div>
            <p className="text-sm">{isSearching ? t("no_results") : t("empty_folder")}</p>
            {!isSearching && (
              <Button variant="outline" size="sm" onClick={() => setNewFileModal(true)} className="border-[rgba(139,92,246,0.3)] text-zinc-500 hover:text-white gap-1.5 mt-1">
                <Plus className="w-3.5 h-3.5" /> {t("new_file")}
              </Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5">
            {sorted.map((item) => (
              <div key={item.path} className="group flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all border hover:border-[rgba(139,92,246,0.4)] hover:bg-[#140a24]"
                style={{ borderColor: "rgba(139,92,246,0.08)", background: "rgba(20,10,36,0.4)" }}
                onClick={() => handleItemClick(item)} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item }); }}>
                <FileIcon icon={item.icon} isDir={item.is_dir} size="w-9 h-9" />
                {renamingPath === item.path ? (
                  <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                    <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(item); if (e.key === "Escape") setRenamingPath(null); }}
                      className="h-6 text-[10px] px-1 bg-[#1d1033] border-accent/50" autoFocus />
                    <button onClick={() => commitRename(item)}><Check className="w-3 h-3 text-green-400" /></button>
                  </div>
                ) : (
                  <span className="text-[10px] text-zinc-400 text-center truncate w-full font-mono group-hover:text-white transition-colors">{item.name}</span>
                )}
                <span className="text-[9px] text-zinc-700 font-mono">{item.size}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {sorted.map((item) => (
              <div key={item.path} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-[#140a24] border border-transparent hover:border-[rgba(139,92,246,0.15)] transition-all group"
                onClick={() => handleItemClick(item)} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, item }); }}>
                <FileIcon icon={item.icon} isDir={item.is_dir} size="w-4 h-4" />
                {renamingPath === item.path ? (
                  <div className="flex items-center gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                    <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") commitRename(item); if (e.key === "Escape") setRenamingPath(null); }}
                      className="h-7 text-xs px-2 bg-[#1d1033] border-accent/50 flex-1" autoFocus />
                    <button onClick={() => commitRename(item)}><Check className="w-4 h-4 text-green-400" /></button>
                  </div>
                ) : (
                  <span className="flex-1 text-sm text-zinc-300 font-mono truncate group-hover:text-white transition-colors">{item.name}</span>
                )}
                <span className="text-xs text-zinc-700 shrink-0 font-mono hidden sm:block">{item.size}</span>
                <span className="text-xs text-zinc-700 shrink-0 hidden md:block">{item.modified ? new Date(item.modified).toLocaleDateString() : ""}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); handleItemClick(item); }} className="p-1 text-zinc-600 hover:text-white rounded transition-colors" title={t("open")}><Eye className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); setRenamingPath(item.path); setRenameValue(item.name); }} className="p-1 text-zinc-600 hover:text-white rounded transition-colors" title={t("rename")}><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="p-1 text-red-600 hover:text-red-400 rounded transition-colors" title={t("delete")}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isDragging && (
          <div className="absolute inset-4 flex flex-col items-center justify-center bg-accent/10 backdrop-blur-sm rounded-2xl border-2 border-dashed border-accent/50 pointer-events-none">
            <Upload className="w-12 h-12 text-accent mb-3" />
            <p className="text-accent font-semibold">{t("drop_to_upload")}</p>
          </div>
        )}
      </div>

      {contextMenu && (
        <div className="fixed z-50 min-w-[170px] rounded-xl border py-1.5 shadow-2xl"
          style={{ top: contextMenu.y, left: contextMenu.x, background: "#140a24", borderColor: "rgba(139,92,246,0.3)" }}
          onMouseLeave={() => setContextMenu(null)}>
          <button onClick={() => { handleItemClick(contextMenu.item); setContextMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-white/8 hover:text-white flex items-center gap-2.5 transition-colors">
            <Eye className="w-3.5 h-3.5 text-accent" /> {t("open")}
          </button>
          <button onClick={() => { setRenamingPath(contextMenu.item.path); setRenameValue(contextMenu.item.name); setContextMenu(null); }}
            className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-white/8 hover:text-white flex items-center gap-2.5 transition-colors">
            <Edit2 className="w-3.5 h-3.5 text-zinc-500" /> {t("rename")}
          </button>
          <div className="my-1 border-t" style={{ borderColor: "rgba(139,92,246,0.1)" }} />
          <button onClick={() => handleDelete(contextMenu.item)}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2.5 transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> {t("delete")}
          </button>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={closePreview}>
          <div className="rounded-2xl border w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden"
            style={{ background: "#0b0616", borderColor: "rgba(139,92,246,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
              <div className="flex items-center gap-2"><File className="w-4 h-4 text-accent" /><span className="text-sm font-mono text-zinc-300">{previewFile.name}</span></div>
              <button onClick={closePreview} className="text-zinc-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {previewFile.isImage ? (
                <img src={previewFile.imageUrl} className="max-w-full mx-auto rounded-lg" alt={previewFile.name} />
              ) : (
                <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">{previewFile.content}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {newFileModal && (
        <Modal title={t("new_file")} onClose={() => setNewFileModal(false)}>
          <Input value={newFileName} onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleNewFile(); if (e.key === "Escape") setNewFileModal(false); }}
            placeholder="filename.txt" autoFocus className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white font-mono text-sm" />
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={() => setNewFileModal(false)} className="text-zinc-400">{t("cancel")}</Button>
            <Button size="sm" onClick={handleNewFile} className="bg-primary hover:bg-primary/90" disabled={!newFileName.trim()}>{t("create")}</Button>
          </div>
        </Modal>
      )}

      {newFolderModal && (
        <Modal title={t("new_folder")} onClose={() => setNewFolderModal(false)}>
          <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleNewFolder(); if (e.key === "Escape") setNewFolderModal(false); }}
            placeholder="folder-name" autoFocus className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white font-mono text-sm" />
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={() => setNewFolderModal(false)} className="text-zinc-400">{t("cancel")}</Button>
            <Button size="sm" onClick={handleNewFolder} className="bg-primary hover:bg-primary/90" disabled={!newFolderName.trim()}>{t("create")}</Button>
          </div>
        </Modal>
      )}

      {extractModal && (
        <Modal title="Extract File" onClose={() => { setExtractModal(false); setExtractPath(""); setExtractDest(""); }}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Archive path</label>
              <Input value={extractPath} onChange={(e) => setExtractPath(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleExtract(); if (e.key === "Escape") setExtractModal(false); }}
                placeholder="/path/to/archive.zip" autoFocus className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Destination <span className="text-zinc-700">(optional)</span></label>
              <Input value={extractDest} onChange={(e) => setExtractDest(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleExtract(); if (e.key === "Escape") setExtractModal(false); }}
                placeholder="Same directory as archive" className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white font-mono text-sm" />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="ghost" size="sm" onClick={() => { setExtractModal(false); setExtractPath(""); setExtractDest(""); }} className="text-zinc-400">{t("cancel")}</Button>
            <Button size="sm" onClick={handleExtract} className="bg-primary hover:bg-primary/90" disabled={!extractPath.trim() || extracting}>
              {extracting ? "Extracting..." : "Extract"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
