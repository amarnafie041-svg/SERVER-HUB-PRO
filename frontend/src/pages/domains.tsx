import { useState, useEffect } from "react";
import { Globe, Server, Copy, Check, ExternalLink, Save, Loader2, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DomainsPage() {
  const { toast } = useToast();
  const [domainInfo, setDomainInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [port, setPort] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getDomainInfo()
      .then((info) => {
        setDomainInfo(info);
        setSubdomain(info.username || "");
        setPort(String(info.port || ""));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubdomainChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    setSubdomain(clean);
    setSaved(false);
    setError("");
  };

  const handlePortChange = (val: string) => {
    const num = val.replace(/[^0-9]/g, "");
    if (num.length <= 5) setPort(num);
    setSaved(false);
    setError("");
  };

  const hasChanges = subdomain !== (domainInfo?.username || "") || parseInt(port) !== (domainInfo?.port || 3001);

  const save = async () => {
    if (!subdomain || subdomain.length < 2) {
      setError("Subdomain must be at least 2 characters");
      return;
    }
    if (!port || parseInt(port) < 1024 || parseInt(port) > 65535) {
      setError("Port must be between 1024 and 65535");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.updateDomainInfo({
        custom_subdomain: subdomain,
        custom_port: parseInt(port),
      });
      const updated = await api.getDomainInfo();
      setDomainInfo(updated);
      setSubdomain(updated.username || subdomain);
      setPort(String(updated.port || port));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: "Settings saved", description: "Your subdomain and port have been updated" });
    } catch (err: any) {
      setError(err.message || "Failed to save");
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const reset = () => {
    setSubdomain(domainInfo?.username || "");
    setPort(String(domainInfo?.port || ""));
    setError("");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const baseDomain = domainInfo?.baseDomain || "server.app";
  const previewSub = subdomain || "yourname";
  const previewPort = port || "3001";
  const baseUrl = domainInfo?.urls?.direct?.split("/~")[0] || "";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Domains & Ports</h1>
        <p className="text-zinc-400 mt-1">Manage your subdomain and port configuration</p>
      </div>

      {/* Editor Card */}
      <div className="rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="text-lg font-semibold text-white mb-5 flex items-center gap-2">
          <Globe className="w-5 h-5 text-purple-400" />
          Configuration
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Subdomain */}
          <div>
            <label className="text-sm font-medium text-zinc-400 mb-2 block">Subdomain</label>
            <div className="flex items-stretch">
              <Input
                value={subdomain}
                onChange={(e) => handleSubdomainChange(e.target.value)}
                placeholder="your-subdomain"
                maxLength={32}
                className="rounded-r-none font-mono text-white h-11 border-r-0"
                style={{ background: "var(--background)", borderColor: "var(--border)" }}
              />
              <div className="flex items-center px-3 rounded-r-lg border text-sm font-mono text-purple-400 whitespace-nowrap"
                style={{ background: "var(--background)", borderColor: "var(--border)", borderLeft: "none" }}>
                .{baseDomain}
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1.5">Lowercase letters, numbers, hyphens. Min 2 characters.</p>
          </div>

          {/* Port */}
          <div>
            <label className="text-sm font-medium text-zinc-400 mb-2 block">Port</label>
            <Input
              type="text"
              value={port}
              onChange={(e) => handlePortChange(e.target.value)}
              placeholder="3001"
              maxLength={5}
              className="font-mono text-white h-11 max-w-[200px]"
              style={{ background: "var(--background)", borderColor: "var(--border)" }}
            />
            <p className="text-[11px] text-zinc-500 mt-1.5">Range: 1024 - 65535</p>
          </div>
        </div>

        {error && (
          <div className="mt-3 px-3 py-2 rounded-lg text-sm text-red-400 bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-5">
          <Button onClick={save} disabled={saving || !hasChanges || !subdomain || !port}
            className="gap-2 text-sm font-medium h-9 px-5"
            style={{
              background: saved ? "#22c55e" : hasChanges ? "var(--accent)" : "var(--background)",
              color: saved || hasChanges ? "var(--background)" : "var(--foreground)",
              borderColor: "var(--border)",
            }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
          </Button>
          {hasChanges && (
            <Button variant="ghost" onClick={reset} className="gap-1.5 text-xs text-zinc-400 h-9">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Live Preview */}
      <div className="rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Server className="w-5 h-5 text-amber-400" />
          Preview
        </h2>

        {/* Big Preview */}
        <div className="rounded-xl p-5 mb-5 text-center" style={{ background: "var(--background)" }}>
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Globe className="w-7 h-7 text-white" />
            </div>
          </div>
          <p className="text-2xl md:text-3xl font-mono text-white mb-1">
            <span className="text-purple-400">{previewSub}</span>
            <span className="text-zinc-500">.</span>
            <span className="text-indigo-400">{baseDomain}</span>
          </p>
          <p className="text-sm text-zinc-400">
            Port: <span className="text-white font-mono">{previewPort}</span>
          </p>
        </div>

        {/* Access URLs */}
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Access URLs</h3>

          {[
            { label: "Subdomain", value: `https://${previewSub}.${baseDomain}`, color: "text-purple-400" },
            { label: "Path-based", value: `${baseUrl}/~${previewSub}`, color: "text-blue-400" },
            { label: "Local", value: `http://localhost:${previewPort}`, color: "text-amber-400" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-lg p-3 group transition-colors hover:bg-white/5"
              style={{ background: "var(--background)" }}>
              <span className={`text-[11px] font-semibold uppercase tracking-wider w-20 shrink-0 ${item.color}`}>
                {item.label}
              </span>
              <span className="text-sm text-white font-mono flex-1 truncate">{item.value}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => copyToClipboard(item.value, item.label)}
                  className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Copy">
                  {copied === item.label ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a href={item.value} target="_blank" rel="noopener"
                  className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
                  title="Open">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Format Info */}
      <div className="rounded-xl border p-5" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <p className="text-xs text-zinc-500 text-center">
          Your subdomain follows the format:{" "}
          <code className="text-purple-400 font-mono">subdomain.{baseDomain}</code>
        </p>
      </div>
    </div>
  );
}
