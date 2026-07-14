import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Send, Bot, User, Copy, Check, Trash2, FileSearch,
  Loader2, Sparkles, Terminal,
  Plus, MessageSquare, X, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { BASE } from "@/lib/api";

function getToken(): string | null {
  return localStorage.getItem("sh_token");
}

type Model = "gemini-flash" | "gemini-deep";

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
  "gemini-flash": { label: "Gemini 3.5 Flash", icon: Sparkles, color: "#22c55e" },
  "gemini-deep": { label: "Gemini Deep Research", icon: Terminal, color: "#3b82f6" },
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
  const [model, setModel] = useState<Model>("gemini-flash");
  const [thinking, setThinking] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "analyze">("chat");
  const [analyzePath, setAnalyzePath] = useState("");
  const [analyzeQuestion, setAnalyzeQuestion] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (conversations.length > 0) saveConversations(conversations);
  }, [conversations]);

  const createNewConversation = useCallback(() => {
    const newConv: Conversation = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title: "محادثة جديدة",
      messages: [],
      model: "gemini-flash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newConv.id);
    setMessages([]);
    setModel("gemini-flash");
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
      const token = getToken();
      const response = await fetch(`${BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: msg, model, history, stream: false }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errBody.error || `خطأ ${response.status}`);
      }
      const result = await response.json();
      const content = result.content || "⚠️ الـ AI لم يرسل رد";
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content, streaming: false } : m));

      if (currentConvId) {
        updateConversation(currentConvId, { messages: [...messages, userMsg, { ...assistantMsg, content, streaming: false }], model });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `❌ ${err.message}`, streaming: false } : m));
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
      const token = getToken();
      const response = await fetch(`${BASE}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ path: analyzePath, question: analyzeQuestion }),
      });
      const result = await response.json();
      const userMsg: Message = { id: Math.random().toString(36).slice(2), role: "user", content: `تحليل الملف: ${analyzePath}\n\n${analyzeQuestion}`, timestamp: new Date() };
      const aiMsg: Message = { id: Math.random().toString(36).slice(2), role: "assistant", content: result.content || result.error || "لا يوجد رد", model: result.model, timestamp: new Date() };
      const newMsgs = [...messages, userMsg, aiMsg];
      setMessages(newMsgs);
      if (activeConvId) updateConversation(activeConvId, { messages: newMsgs });
      setActiveTab("chat");
    } catch { toast({ title: "فشل التحليل", variant: "destructive" }); }
    finally { setAnalyzing(false); }
  };

  const formatDate = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return "الآن";
    if (diff < 3600000) return `منذ ${Math.floor(diff / 60000)} د`;
    if (diff < 86400000) return `منذ ${Math.floor(diff / 3600000)} س`;
    return d.toLocaleDateString("ar-SA");
  };

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "var(--background)" }}>
      {sidebarOpen && (
        <div className="w-64 shrink-0 flex flex-col border-r overflow-hidden" style={{ background: "var(--sidebar)", borderColor: "var(--sidebar-border)" }}>
          <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: "var(--sidebar-border)" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>المحادثات</span>
            <Button variant="ghost" size="sm" onClick={createNewConversation}
              className="h-6 px-1.5 gap-1 text-[10px]" style={{ color: "var(--accent)" }}>
              <Plus className="w-3 h-3" /> جديد
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {conversations.length === 0 && (
              <div className="px-3 py-6 text-center">
                <MessageSquare className="w-6 h-6 mx-auto mb-2" style={{ color: "var(--accent)" }} />
                <p className="text-xs" style={{ color: "var(--sidebar-foreground)" }}>لا توجد محادثات بعد</p>
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
                    {formatDate(conv.updatedAt)} · {conv.messages.length} رسالة
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
              title={sidebarOpen ? "إغلاق الشريط" : "فتح الشريط"}>
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <Bot className="w-4 h-4" style={{ color: "var(--accent)" }} />
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>AI Chat</span>
            <div className="flex ml-3 overflow-hidden rounded" style={{ border: "1px solid var(--border)" }}>
              <button onClick={() => setActiveTab("chat")}
                className={`px-3 py-1 text-[10px] font-medium transition-colors ${activeTab === "chat" ? "text-accent" : "text-zinc-500 hover:text-zinc-300"}`}
                style={activeTab === "chat" ? { background: "var(--card)" } : {}}>محادثة</button>
              <button onClick={() => setActiveTab("analyze")}
                className={`px-3 py-1 text-[10px] font-medium transition-colors ${activeTab === "analyze" ? "text-accent" : "text-zinc-500 hover:text-zinc-300"}`}
                style={activeTab === "analyze" ? { background: "var(--card)" } : {}}>تحليل</button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={createNewConversation}
              className="h-7 px-1.5 gap-1 text-[10px]" style={{ color: "var(--accent)" }} title="محادثة جديدة">
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
              className="h-7 px-1.5" style={{ color: "var(--foreground)" }} title="مسح المحادثة">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {activeTab === "analyze" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 max-w-xl mx-auto w-full">
            <div className="text-center mb-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <FileSearch className="w-5 h-5" style={{ color: "var(--accent)" }} />
                <span className="text-lg font-bold" style={{ color: "var(--accent)" }}>تحليل الملفات</span>
              </div>
              <p className="text-xs" style={{ color: "var(--foreground)" }}>حلل أي ملف بمساعدة الذكاء الاصطناعي</p>
            </div>
            <div className="w-full space-y-3">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--foreground)" }}>مسار الملف</label>
                <Input value={analyzePath} onChange={(e) => setAnalyzePath(e.target.value)} placeholder="/path/to/file.py"
                  className="text-sm" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: "var(--foreground)" }}>السؤال</label>
                <textarea value={analyzeQuestion} onChange={(e) => setAnalyzeQuestion(e.target.value)}
                  placeholder="ماذا يفعل هذا الملف؟" rows={4}
                  className="w-full px-3 py-2 rounded text-sm resize-none focus:outline-none focus:ring-1"
                  style={{ background: "var(--background)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
              </div>
              <Button onClick={handleAnalyze} disabled={analyzing || !analyzePath.trim() || !analyzeQuestion.trim()}
                className="w-full text-xs font-medium gap-2">
                {analyzing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جارٍ التحليل...</> : <><FileSearch className="w-3.5 h-3.5" /> تحليل</>}
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
                  <p className="text-sm" style={{ color: "var(--foreground)" }}>اسأل عن أي شيء يخص السيرفرات أو البرمجة</p>
                  <div className="grid grid-cols-2 gap-2 max-w-md w-full mt-2">
                    {["كيف أراقب استخدام CPU؟", "اكتب لي سكربت bash", "إعداد nginx", "إصلاح كود python"].map((s) => (
                      <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                        className="px-3 py-2 text-xs font-medium text-right rounded border transition-all"
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
                    style={{ background: "var(--card)" }}>
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
                          <span className="text-sm" style={{ color: "var(--accent)" }}>جارٍ التفكير...</span>
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
                  placeholder="اكتب رسالتك..." rows={1}
                  className="flex-1 bg-transparent border-none text-sm resize-none focus:ring-0 focus:outline-none max-h-32 py-1.5"
                  style={{ color: "var(--foreground)", minHeight: "28px", direction: "rtl" }} />
                <Button onClick={sendMessage} disabled={!input.trim() || isStreaming} size="icon" className="h-8 w-8 shrink-0 rounded-lg"
                  style={input.trim() && !isStreaming ? { background: "var(--accent)", color: "var(--background)" } : { background: "transparent", color: "var(--foreground)" }}>
                  {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-[10px] mt-1.5 text-center" style={{ color: "var(--foreground)" }}>ردود الذكاء الاصطناعي قد لا تكون دقيقة دائماً</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
