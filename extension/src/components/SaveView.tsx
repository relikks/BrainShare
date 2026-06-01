import { useEffect, useState } from "react";
import { CheckCircle2, FilePlus2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ingestPage } from "@/lib/api";
import { extractActiveTabPage } from "@/lib/extract";
import type { IngestResult, Settings } from "@/types";

export function SaveView({ settings }: { settings: Settings }) {
  const [tabUrl, setTabUrl] = useState("");
  const [tabTitle, setTabTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    chrome.tabs
      .query({ active: true, lastFocusedWindow: true })
      .then(([t]) => {
        setTabUrl(t?.url || "");
        setTabTitle(t?.title || "");
      });
  }, []);

  async function handleSave() {
    setErr(null);
    setResult(null);
    setBusy(true);
    try {
      const payload = await extractActiveTabPage();
      const res = await ingestPage(settings.endpoint, settings.uuid, payload);
      setResult(res);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const canSave = /^https?:/i.test(tabUrl);

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 p-3 space-y-1">
        <p className="text-sm font-medium line-clamp-2">{tabTitle || "—"}</p>
        <p className="text-xs text-muted-foreground truncate">{tabUrl || "—"}</p>
      </div>

      <Button
        className="w-full h-11"
        disabled={!canSave || busy}
        onClick={handleSave}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" /> Saving page…
          </>
        ) : (
          <>
            <FilePlus2 /> Add this page to my corpus
          </>
        )}
      </Button>

      {!canSave && tabUrl && (
        <p className="text-xs text-muted-foreground">
          Only http(s) pages can be saved.
        </p>
      )}

      {result && (
        <div className="rounded-md border border-emerald-300/40 bg-emerald-50/40 p-3 text-sm flex gap-2 items-start">
          <CheckCircle2 className="text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Saved {result.ingested} chunks</p>
            {result.replaced > 0 && (
              <p className="text-xs text-muted-foreground">
                Replaced {result.replaced} chunks from a previous version.
              </p>
            )}
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm flex gap-2 items-start">
          <XCircle className="text-destructive mt-0.5 shrink-0" />
          <p className="text-destructive">{err}</p>
        </div>
      )}
    </div>
  );
}
