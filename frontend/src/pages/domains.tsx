import { useState, useEffect } from "react";
import { Globe, Server, Copy, Check, ExternalLink, Save, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DomainsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [domainInfo, setDomainInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const [customSubdomain, setCustomSubdomain] = useState("");
  const [customPort, setCustomPort] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    api.getDomainInfo()
      .then((info) => {
        setDomainInfo(info);
        setCustomSubdomain(info.username || "");
        setCustomPort(String(info.port || ""));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubdomainChange = (val: string) => {
    setCustomSubdomain(val.toLowerCase().replace(/[^a-z0-9-]/g, ""));
    setHasChanges(true);
  };

  const handlePortChange = (val: string) => {
    const num = val.replace(/[^0-9]/g, "");
    setCustomPort(num);
    setHasChanges(true);
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const updates: any = {};
      if (customSubdomain !== (domainInfo.username || "")) {
        updates.custom_subdomain = customSubdomain;
      }
      if (parseInt(customPort) !== (domainInfo.port || 3001)) {
        updates.custom_port = parseInt(customPort);
      }

      if (Object.keys(updates).length === 0) {
        setSaving(false);
        return;
      }

      await api.updateDomainInfo(updates);
      const updated = await api.getDomainInfo();
      setDomainInfo(updated);
      setHasChanges(false);
      toast({ title: "Saved successfully", description: "Your subdomain and port settings have been updated" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message || "Failed to save settings", variant: "destructive" });
    }
    setSaving(false);
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
  const previewSubdomain = customSubdomain || user?.username || "";
  const previewPort = customPort || "3001";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Domains & Ports</h1>
        <p className="text-zinc-400 mt-1">Manage your subdomain and port configuration</p>
      </div>

      {/* Subdomain Editor */}
      <div className="rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-purple-400" />
          Subdomain Settings
        </h2>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Your Subdomain</label>
            <div className="flex items-center gap-2">
              <Input
                value={customSubdomain}
                onChange={(e) => handleSubdomainChange(e.target.value)}
                placeholder="e.g. elmodmen"
                maxLength={32}
                className="font-mono text-white text-lg h-11"
                style={{ background: "var(--background)", borderColor: "var(--border)" }}
              />
              <span className="text-lg font-mono text-purple-400 whitespace-nowrap">.{baseDomain}</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Lowercase letters, numbers, and hyphens only. Min 2 characters.</p>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Port</label>
            <Input
              type="text"
              value={customPort}
              onChange={(e) => handlePortChange(e.target.value)}
              placeholder="e.g. 3001"
              maxLength={5}
              className="font-mono text-white text-lg h-11 max-w-[200px]"
              style={{ background: "var(--background)", borderColor: "var(--border)" }}
            />
            <p className="text-xs text-zinc-500 mt-1">Port number (1024 - 65535)</p>
          </div>

          {hasChanges && (
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={saveChanges} disabled={saving || !customSubdomain || !customPort}
                className="gap-2 text-sm" style={{ background: "var(--accent)", color: "var(--background)" }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
              <Button variant="ghost" onClick={() => {
                setCustomSubdomain(domainInfo?.username || "");
                setCustomPort(String(domainInfo?.port || ""));
                setHasChanges(false);
              }} className="text-zinc-400 text-sm">
                Cancel
              </Button>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="mt-6 rounded-lg p-4" style={{ background: "var(--background)" }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-mono text-white">
                {previewSubdomain}<span className="text-purple-400">.{baseDomain}</span>
              </p>
              <p className="text-sm text-zinc-400">Port: {previewPort}</p>
            </div>
            <a href={`https://${previewSubdomain}.${baseDomain}`} target="_blank" rel="noopener"
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/20 rounded-lg text-purple-400 transition-colors">
              <ExternalLink className="w-4 h-4" />
              Visit
            </a>
          </div>
        </div>

        {/* Access URLs */}
        <div className="space-y-3 mt-4">
          <h3 className="text-sm font-medium text-zinc-400">Access URLs</h3>
          {[
            { label: "Subdomain", url: `https://${previewSubdomain}.${baseDomain}` },
            { label: "Local", url: `http://localhost:${previewPort}` },
            { label: "Path-based", url: `${domainInfo?.urls?.direct?.split("/~")[0] || ""}/~${previewSubdomain}` },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--background)" }}>
              <span className="text-xs text-zinc-500 w-20">{item.label}</span>
              <span className="text-sm text-white font-mono flex-1 truncate">{item.url}</span>
              <button onClick={() => copyToClipboard(item.url, item.label)} className="p-1 text-zinc-400 hover:text-white transition-colors">
                {copied === item.label ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
              <a href={item.url} target="_blank" rel="noopener" className="p-1 text-zinc-400 hover:text-white transition-colors">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>
      </div>

      {/* Domain Format */}
      <div className="rounded-xl border p-6" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Server className="w-5 h-5 text-amber-400" />
          Domain Format
        </h2>
        <div className="rounded-lg p-4" style={{ background: "var(--background)" }}>
          <div className="text-center">
            <p className="text-2xl font-mono text-white mb-2">
              <span className="text-purple-400">{previewSubdomain || "yourname"}</span>
              <span className="text-zinc-500">.</span>
              <span className="text-indigo-400">{baseDomain}</span>
            </p>
            <p className="text-sm text-zinc-400">
              Your subdomain follows the format: <code className="text-white px-1 rounded" style={{ background: "var(--card)" }}>subdomain.{baseDomain}</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
