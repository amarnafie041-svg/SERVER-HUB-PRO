import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Send, Bot, User, Copy, Check, Trash2, FileSearch,
  ChevronDown, Loader2, Sparkles, Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { api, BASE } from "@/lib/api";
import { useAuth } from "@/contexts/auth";

type Model = "chat" | "console";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  timestamp: Date;
  streaming?: boolean;
}

const MODEL_CONFIG = {
  chat: { label: "GPT-OSS 20B", icon: Sparkles, color: "#8b5cf6" },
  console: { label: "Qwen 3.5 397B", icon: Terminal, color: "#a855f7" },
};

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<Model>("chat");
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "analyze">("chat");
  const [analyzePath, setAnalyzePath] = useState("");
  const [analyzeQuestion, setAnalyzeQuestion] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isStreaming) return;
    setInput("");

    const userMsg: Message = { id: Math.random().toString(36).slice(2), role: "user", content: msg, timestamp: new Date() };
    const assistantMsg: Message = { id: Math.random().toString(36).slice(2), role: "assistant", content: "", model: MODEL_CONFIG[model].label, timestamp: new Date(), streaming: true };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`${BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, model, history, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error("Stream failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
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
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: "Sorry, something went wrong. Please try again." } : m));
      }
    } finally {
      setIsStreaming(false);
      setMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, streaming: false } : m));
    }
  }, [input, isStreaming, model, messages]);

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
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setActiveTab("chat");
    } catch { toast({ title: "Analysis failed", variant: "destructive" }); }
    finally { setAnalyzing(false); }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
            <button onClick={() => setActiveTab("chat")}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${activeTab === "chat" ? "bg-primary text-white" : "text-zinc-400 hover:text-white"}`}>Chat</button>
            <button onClick={() => setActiveTab("analyze")}
              className={`px-4 py-1.5 text-xs font-medium transition-colors ${activeTab === "analyze" ? "bg-primary text-white" : "text-zinc-400 hover:text-white"}`}>Analyze File</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={model} onChange={(e) => setModel(e.target.value as Model)}
              className="appearance-none h-8 pl-3 pr-8 text-xs rounded-lg border text-zinc-300 cursor-pointer outline-none"
              style={{ background: "#1d1033", borderColor: "rgba(139,92,246,0.3)" }}>
              {Object.entries(MODEL_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} className="h-8 px-2 text-zinc-500 hover:text-white" title="Clear chat">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {activeTab === "analyze" ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 max-w-xl mx-auto w-full">
          <div className="text-center mb-2">
            <FileSearch className="w-12 h-12 text-accent/50 mx-auto mb-3" />
            <h2 className="text-lg font-semibold">File Analyzer</h2>
            <p className="text-xs text-zinc-500 mt-1">Analyze any file with AI assistance</p>
          </div>
          <div className="w-full space-y-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">File Path</label>
              <Input value={analyzePath} onChange={(e) => setAnalyzePath(e.target.value)} placeholder="/path/to/file.py"
                className="bg-[#1d1033] border-[rgba(139,92,246,0.3)] text-white font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Question</label>
              <textarea value={analyzeQuestion} onChange={(e) => setAnalyzeQuestion(e.target.value)}
                placeholder="What does this file do? Are there any bugs?" rows={4}
                className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <Button onClick={handleAnalyze} disabled={analyzing || !analyzePath.trim() || !analyzeQuestion.trim()}
              className="w-full bg-gradient-to-r from-primary to-accent hover:opacity-90 text-white">
              {analyzing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</> : <><FileSearch className="w-4 h-4 mr-2" /> Analyze File</>}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #6d28d9, #a855f7)", boxShadow: "0 0 30px rgba(139,92,246,0.3)" }}>
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">AI Assistant</h2>
                  <p className="text-zinc-500 text-sm mt-1">Ask anything about server management, code, or Linux</p>
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-md w-full mt-2">
                  {["How do I monitor CPU usage?", "Explain this bash script", "How to set up nginx?", "Debug my Python code"].map((s) => (
                    <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                      className="px-3 py-2 text-xs text-left rounded-lg border text-zinc-400 hover:text-white hover:border-[rgba(139,92,246,0.4)] hover:bg-[#140a24] transition-all"
                      style={{ borderColor: "rgba(139,92,246,0.15)" }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === "user" ? "border border-[rgba(139,92,246,0.3)]" : ""} overflow-hidden`}
                  style={msg.role === "assistant" ? { background: "linear-gradient(135deg, #6d28d9, #a855f7)" } : msg.role === "user" && user?.avatar ? { background: "none" } : { background: "#1d1033" }}>
                  {msg.role === "user" && user?.avatar ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" /> : msg.role === "user" ? <User className="w-4 h-4 text-accent" /> : <Bot className="w-4 h-4 text-white" />}
                </div>
                <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  {msg.role === "assistant" && msg.model && <span className="text-[10px] text-zinc-600 px-1">{msg.model}</span>}
                    {msg.role === "user" && <span className="text-[10px] text-zinc-600 px-1">{user?.display_name || user?.username}</span>}
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                    style={msg.role === "user" ? { background: "#1d1033", border: "1px solid rgba(139,92,246,0.3)" } : { background: "#140a24", border: "1px solid rgba(139,92,246,0.15)" }}>
                    {msg.streaming ? (
                      <div className="flex items-center gap-2 text-zinc-500"><Loader2 className="w-4 h-4 animate-spin text-accent" /><span className="text-xs">Thinking...</span></div>
                    ) : (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown components={{
                          code({ node, className, children, ...props }: any) {
                            const inline = !className;
                            const match = /language-(\w+)/.exec(className || "");
                            const codeString = String(children).replace(/\n$/, "");
                            if (!inline && match) {
                              return (
                                <div className="relative my-2 rounded-lg overflow-hidden border" style={{ borderColor: "rgba(139,92,246,0.2)" }}>
                                  <div className="flex items-center justify-between px-3 py-1.5 text-xs font-mono text-zinc-500" style={{ background: "#0b0616" }}>
                                    <span>{match[1]}</span><CopyButton text={codeString} />
                                  </div>
                                  <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div"
                                    customStyle={{ margin: 0, background: "#0b0616", padding: "12px" }}>{codeString}</SyntaxHighlighter>
                                </div>
                              );
                            }
                            return <code className="bg-black/40 px-1.5 py-0.5 rounded text-accent text-xs font-mono" {...props}>{children}</code>;
                          },
                        }}>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  {msg.role === "assistant" && !msg.streaming && <CopyButton text={msg.content} />}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-4 py-3 border-t shrink-0" style={{ background: "#140a24", borderColor: "rgba(139,92,246,0.2)" }}>
            <div className="flex gap-2 items-end rounded-xl border p-2 focus-within:border-[rgba(139,92,246,0.5)]"
              style={{ background: "#0b0616", borderColor: "rgba(139,92,246,0.2)" }}>
              <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Message the AI... (Enter to send, Shift+Enter for new line)" rows={1}
                className="flex-1 bg-transparent border-none text-sm text-white placeholder:text-zinc-600 resize-none focus:ring-0 focus:outline-none max-h-32 py-1.5"
                style={{ minHeight: "36px" }} />
              <Button onClick={sendMessage} disabled={!input.trim() || isStreaming} size="icon" className="h-8 w-8 shrink-0 rounded-lg"
                style={input.trim() && !isStreaming ? { background: "linear-gradient(135deg, #6d28d9, #a855f7)" } : {}}>
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-zinc-700 mt-1.5 text-center">AI may make mistakes. Verify important commands before running.</p>
          </div>
        </>
      )}
    </div>
  );
}
