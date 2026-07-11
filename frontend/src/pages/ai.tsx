import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Send, Bot, User, Copy, Check, Trash2, FileSearch,
  Loader2, Sparkles, Terminal, Key,
  Plus, MessageSquare, X, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api, BASE } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

type Model = "nemotron" | "deepseek" | "gemini" | "chat" | "console" | "claude";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  timestamp: Date;
  streaming?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  model: Model;
  createdAt: Date;
  updatedAt: Date;
}

const MODEL_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  nemotron: { label: "Nemotron 49B", icon: Sparkles, color: "#76b900" },
  deepseek: { label: "DeepSeek R1", icon: Terminal, color: "#3b82f6" },
  gemini: { label: "Gemini Flash", icon: Bot, color: "#22c55e" },
  chat: { label: "Llama 405B", icon: Sparkles, color: "#8b5cf6" },
  console: { label: "QwQ 32B", icon: Terminal, color: "#a855f7" },
  claude: { label: "Claude 4.5", icon: Bot, color: "#f59e0b" },
};

const STORAGE_KEY = "sh_ai_conversations";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((c: any) => ({
      ...c,
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.updatedAt),
      messages: c.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch {
    return [];
  }
}

function saveConversations(conversations: Conversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded text-zinc-500 hover:text-white hover:bg-white/10 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function AIPage() {
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations());
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<Model>("nemotron");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "analyze">("chat");
  const [analyzePath, setAnalyzePath] = useState("");
  const [analyzeQuestion, setAnalyzeQuestion] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (conversations.length > 0) saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    api.getAiSettings().then((s) => setHasApiKey(s.has_key)).catch(() => {});
  }, []);

  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title: "New Chat",
      messages: [],
      model: "nemotron",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    setMessages([]);
    setModel("nemotron");
  }, []);

  const selectConversation = useCallback((convId: string) => {
    const conv = conversations.find((c) => c.id === convId);
    if (conv) {
      setActiveConvId(convId);
      setMessages(conv.messages);
      setModel(conv.model);
    }
  }, [conversations]);

  const deleteConversation = useCallback((convId: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== convId));
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
    }
  }, [activeConvId]);

  const updateConversation = useCallback((convId: string, updates: Partial<Conversation>) => {
    setConversations((prev) => prev.map((c) => c.id === convId ? { ...c, ...updates, updatedAt: new Date() } : c));
  }, []);

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    setInput("");

    let currentConvId = activeConvId;

    if (!currentConvId) {
      const newConv: Conversation = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        title: msg.slice(0, 40) + (msg.length > 40 ? "..." : ""),
        messages: [],
        model,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setConversations((prev) => [newConv, ...prev]);
      currentConvId = newConv.id;
      setActiveConvId(currentConvId);
    }

    const userMsg: Message = { id: Math.random().toString(36).slice(2), role: "user", content: msg, timestamp: new Date() };
    const assistantMsg: Message = { id: Math.random().toString(36).slice(2), role: "assistant", content: "", model: MODEL_CONFIG[model].label, timestamp: new Date(), streaming: true };

    const newMessages = [...messages, userMsg, assistantMsg];
    setMessages(newMessages);
    setIsStreaming(true);

    if (currentConvId) {
      updateConversation(currentConvId, {
        messages: newMessages.filter((m) => !m.streaming),
        title: messages.length === 0 ? (msg.length > 40 ? msg.slice(0, 40) + "..." : msg) : undefined,
        model,
      });
    }

    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const useStream = typeof Response !== "undefined" && typeof ReadableStream !== "undefined" && typeof ReadableStream.prototype?.getReader === "function";

      if (!useStream) {
        const response = await fetch(`${BASE}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, model, history, stream: false }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Request failed");
        const data = await response.json();
        const content = data.content || "";
        setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content, streaming: false } : m));
        if (currentConvId) {
          updateConversation(currentConvId, { messages: [...messages, userMsg, { ...assistantMsg, content, streaming: false }], model });
        }
      } else {
        const response = await fetch(`${BASE}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg, model, history, stream: true }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error("Stream failed");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullContent = parsed.content;
                setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: fullContent } : m));
              }
            } catch {}
          }
        }

        if (currentConvId) {
          updateConversation(currentConvId, { messages: [...messages, userMsg, { ...assistantMsg, content: fullContent, streaming: false }], model });
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: "Sorry, something went wrong. Please try again.", streaming: false } : m));
      }
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, model, messages, activeConvId, updateConversation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const handleAnalyze = async () => {
    if (!analyzePath.trim() || !analyzeQuestion.trim() || analyzing) return;
    setAnalyzing(true);
    try {
      const response = await fetch(`${BASE}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: analyzePath, question: analyzeQuestion }),
      });
      const result = await response.json();
      const userMsg: Message = { id: Math.random().toString(36).slice(2), role: "user", content: `Analyze file: ${analyzePath}\n\n${analyzeQuestion}`, timestamp: new Date() };
      const aiMsg: Message = { id: Math.random().toString(36).slice(2), role: "assistant", content: result.content || result.error || "No response", model: result.model, timestamp: new Date() };
      const newMsgs = [...messages, userMsg, aiMsg];
      setMessages(newMsgs);
      if (activeConvId) updateConversation(activeConvId, { messages: newMsgs });
      setActiveTab("chat");
    } catch { toast({ title: "Analysis failed", variant: "destructive" }); }
    finally { setAnalyzing(false); }
  };

  const formatDate = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const saveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      await api.updateAiSettings({ gemini_api_key: apiKeyInput.trim() });
      setApiKeySaved(true);
      setHasApiKey(true);
      setTimeout(() => { setApiKeySaved(false); setShowApiKeySettings(false); setApiKeyInput(""); }, 1500);
    } catch {
      toast({ title: "Failed to save API key", variant: "destructive" });
    }
  };

  const s = (n: number) => " ".repeat(n);

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--background)" }}>
      {sidebarOpen && (
        <div className="w-64 shrink-0 flex flex-col border-r overflow-hidden" style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}>
          <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: "var(--sidebar-border)" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Conversations</span>
            <Button variant="ghost" size="sm" onClick={createNewConversation}
              className="h-6 px-1.5 gap-1 text-[10px]" style={{ color: "var(--accent)" }}>
              <Plus className="w-3 h-3" /> new
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {conversations.length === 0 && (
              <div className="px-3 py-6 text-center">
                <MessageSquare className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--accent)" }} />
                <p className="text-xs" style={{ color: "var(--sidebar-foreground)" }}>no conversations yet</p>
              </div>
            )}
            {conversations.map((conv) => (
              <div key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`group mx-1.5 mb-0.5 px-2.5 py-2 rounded cursor-pointer transition-all flex items-start gap-2 ${
                  activeConvId === conv.id ? "bg-primary/20" : "hover:bg-white/5"
                }`}>
                <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" style={{ color: activeConvId === conv.id ? "var(--accent)" : "var(--sidebar-foreground)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: activeConvId === conv.id ? "var(--accent)" : "var(--sidebar-foreground)" }}>
                    {conv.title}
                  </p>
                  <p className="text-[9px] mt-0.5" style={{ color: "var(--sidebar-foreground)" }}>
                    {formatDate(conv.updatedAt)} Â· {conv.messages.length} msgs
                  </p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all text-red-400 hover:text-red-300">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 rounded transition-colors" style={{ color: "var(--foreground)" }}
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}>
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <Bot className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>AI Chat</span>
              <div className="flex ml-3 overflow-hidden rounded" style={{ border: "1px solid var(--border)" }}>
              <button onClick={() => setActiveTab("chat")}
                className={`px-3 py-1 text-[10px] font-medium transition-colors ${activeTab === "chat" ? "text-accent" : "text-zinc-500 hover:text-zinc-300"}`}
                style={activeTab === "chat" ? { background: "var(--card)" } : {}}>chat</button>
              <button onClick={() => setActiveTab("analyze")}
                className={`px-3 py-1 text-[10px] font-medium transition-colors ${activeTab === "analyze" ? "text-accent" : "text-zinc-500 hover:text-zinc-300"}`}
                style={activeTab === "analyze" ? { background: "var(--card)" } : {}}>analyze</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={createNewConversation}
              className="h-7 px-1.5 gap-1 text-[10px]" style={{ color: "var(--accent)" }} title="New conversation">
              <Plus className="w-3.5 h-3.5" />
            </Button>
            <div className="flex overflow-hidden rounded" style={{ border: "1px solid var(--border)" }}>
              {(Object.entries(MODEL_CONFIG) as [Model, typeof MODEL_CONFIG[Model]][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const active = model === key;
                return (
                  <button key={key} onClick={() => setModel(key)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-all"
                    style={{
                      background: active ? cfg.color + "20" : "transparent",
                      color: active ? cfg.color : "var(--foreground)",
                    }}>
                    <Icon className="w-3 h-3" />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setMessages([]); setActiveConvId(null); }}
              className="h-7 px-1.5" style={{ color: "var(--foreground)" }} title="Clear chat">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <button onClick={() => setShowApiKeySettings(!showApiKeySettings)}
              className="p-1 rounded transition-colors relative" style={{ color: hasApiKey ? "#22c55e" : "var(--foreground)" }}
              title={hasApiKey ? "Gemini API key configured" : "Configure Gemini API key"}>
              <Key className="w-3.5 h-3.5" />
              {!hasApiKey && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>}
            </button>
          </div>
        </div>

        {showApiKeySettings && (
          <div className="px-4 py-3 border-b shrink-0 flex items-center gap-3" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
            <Key className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-xs text-zinc-400 shrink-0">Gemini API Key:</span>
            {apiKeySaved ? (
              <span className="text-xs text-green-400 font-medium">Saved!</span>
            ) : (
              <>
                <Input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Enter your free Gemini API key from aistudio.google.com"
                  className="flex-1 h-7 text-xs font-mono"
                  style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
                <Button size="sm" onClick={saveApiKey} disabled={!apiKeyInput.trim()}
                  className="h-7 px-3 text-xs" style={{ background: "var(--accent)", color: "var(--background)" }}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowApiKeySettings(false)}
                  className="h-7 px-2 text-xs text-zinc-400">
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}

        {activeTab === "analyze" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 max-w-xl mx-auto w-full">
            <div className="text-center mb-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <FileSearch className="w-5 h-5" style={{ color: "var(--accent)" }} />
                <span className="text-lg font-bold" style={{ color: "var(--accent)" }}>File Analyzer</span>
              </div>
              <p className="text-xs" style={{ color: "var(--foreground)" }}>analyze any file with AI assistance</p>
            </div>
            <div className="w-full space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--foreground)" }}>File Path</label>
                <Input value={analyzePath} onChange={(e) => setAnalyzePath(e.target.value)} placeholder="/path/to/file.py"
                  className="text-sm" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--foreground)" }}>Question</label>
                <textarea value={analyzeQuestion} onChange={(e) => setAnalyzeQuestion(e.target.value)}
                  placeholder="what does this file do?" rows={4}
                  className="w-full px-3 py-2 rounded text-sm resize-none focus:outline-none focus:ring-1"
                  style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
              </div>
              <Button onClick={handleAnalyze} disabled={analyzing || !analyzePath.trim() || !analyzeQuestion.trim()}
                className="w-full text-xs font-medium gap-2">
                {analyzing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...</> : <><FileSearch className="w-3.5 h-3.5" /> Analyze</>}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Bot className="w-10 h-10" style={{ color: "var(--accent)" }} />
                    <span className="text-lg font-bold uppercase tracking-widest" style={{ color: "var(--accent)" }}>AI Chat</span>
                  </div>
                  {!hasApiKey && (
                    <button onClick={() => setShowApiKeySettings(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border text-xs transition-all"
                      style={{ borderColor: "#22c55e40", color: "#22c55e", background: "#22c55e10" }}>
                      <Key className="w-3.5 h-3.5" />
                      Add free Gemini API key to start
                    </button>
                  )}
                  <p className="text-sm" style={{ color: "var(--foreground)" }}>ask anything about servers, code, or linux</p>
                  <div className="grid grid-cols-2 gap-2 max-w-md w-full mt-2">
                    {["how to monitor CPU?", "explain bash script", "set up nginx?", "debug python code"].map((s) => (
                      <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                        className="px-3 py-2 text-xs font-medium text-left rounded border transition-all"
                        style={{ borderColor: "var(--border)", color: "var(--foreground)", background: "var(--card)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1"
                    style={{ background: msg.role === "user" ? "var(--card)" : "var(--card)" }}>
                    {msg.role === "user"
                      ? <User className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
                      : <Bot className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />}
                  </div>
                  <div className="max-w-[85%] flex flex-col gap-1">
                    {msg.role === "assistant" && msg.model && (
                      <span className="text-[10px]" style={{ color: "var(--accent)" }}>
                        {msg.model}
                      </span>
                    )}
                    <div className="px-3 py-2.5 text-sm leading-relaxed rounded-lg"
                      style={msg.role === "user"
                        ? { background: "var(--card)", border: "1px solid var(--accent)", color: "var(--accent)" }
                        : { background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
                      {msg.streaming ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} />
                          <span className="text-sm" style={{ color: "var(--accent)" }}>Thinking...</span>
                        </div>
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown components={{
                            code({ node, className, children, ...props }: any) {
                              const inline = !className;
                              const match = /language-(\w+)/.exec(className || "");
                              const codeString = String(children).replace(/\n$/, "");
                              if (!inline && match) {
                                return (
                                  <div className="relative my-2 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
                                    <div className="flex items-center justify-between px-3 py-1.5 text-xs" style={{ background: "var(--background)" }}>
                                      <span style={{ color: "var(--accent)" }}>{match[1]}</span><CopyButton text={codeString} />
                                    </div>
                                    <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div"
                                      customStyle={{ margin: 0, padding: "12px", fontSize: "12px" }}>{codeString}</SyntaxHighlighter>
                                  </div>
                                );
                              }
                              return <code className="px-1 py-0.5 rounded text-xs" style={{ background: "var(--card)", color: "var(--accent)" }} {...props}>{children}</code>;
                            },
                          }}>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                    {msg.role === "assistant" && !msg.streaming && (
                      <div className="flex gap-2 px-1">
                        <CopyButton text={msg.content} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-3 border-t shrink-0" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              <div className="flex gap-2 items-end rounded-lg p-2" style={{ border: "1px solid var(--border)", background: "var(--background)" }}>
                <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Type your message..." rows={1}
                  className="flex-1 bg-transparent border-none text-sm resize-none focus:ring-0 focus:outline-none max-h-32 py-1.5"
                  style={{ color: "var(--foreground)", minHeight: "28px" }} />
                <Button onClick={sendMessage} disabled={!input.trim() || isStreaming} size="icon" className="h-8 w-8 shrink-0 rounded-lg"
                  style={input.trim() && !isStreaming ? { background: "var(--accent)", color: "var(--background)" } : { background: "transparent", color: "var(--foreground)" }}>
                  {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[10px] mt-1.5 text-center" style={{ color: "var(--foreground)" }}>AI responses are generated and may not always be accurate</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
