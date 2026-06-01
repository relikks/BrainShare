import { useEffect, useState } from "react";
import { FilePlus2, Search, Settings as SettingsIcon } from "lucide-react";
import { Setup } from "@/components/Setup";
import { SaveView } from "@/components/SaveView";
import { SettingsView } from "@/components/SettingsView";
import { Header } from "@/components/Header";
import { fetchBranding } from "@/lib/api";
import { isConfigured, loadSettings } from "@/lib/settings";
import type { Branding, Settings } from "@/types";

type Tab = "save" | "settings";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "save", label: "Save", icon: FilePlus2 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const DEFAULT_BRANDING: Branding = { name: "SIGSHARE", logo_url: "" };

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [tab, setTab] = useState<Tab>("save");

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!settings?.endpoint) return;
    fetchBranding(settings.endpoint)
      .then(setBranding)
      .catch(() => setBranding(DEFAULT_BRANDING));
  }, [settings?.endpoint]);

  function openSearch() {
    chrome.tabs.create({ url: chrome.runtime.getURL("search.html") });
    window.close();
  }

  if (!settings) {
    return (
      <div className="w-[380px] h-[200px] flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isConfigured(settings)) {
    return (
      <div className="w-[380px] p-4">
        <Header branding={branding} />
        <div className="mt-4">
          <Setup
            onReady={setSettings}
            onEndpointChange={(ep) =>
              fetchBranding(ep).then(setBranding).catch(() => setBranding(DEFAULT_BRANDING))
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-[380px] flex flex-col">
      <div className="p-4 pb-3">
        <Header branding={branding} />
        <button
          onClick={openSearch}
          className="group mt-3 w-full flex items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/70 transition"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search your corpus…</span>
          <span className="text-[10px] font-mono opacity-60">↗</span>
        </button>
      </div>
      <nav className="px-4 flex gap-1 border-b">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </nav>
      <div className="p-4">
        {tab === "save" && <SaveView settings={settings} />}
        {tab === "settings" && (
          <SettingsView
            settings={settings}
            onChange={setSettings}
            onSignOut={() =>
              setSettings({ endpoint: settings.endpoint, username: "", uuid: "", topK: 10 })
            }
          />
        )}
      </div>
    </div>
  );
}
