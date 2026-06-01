import type { PageIngest } from "@/types";

export async function extractActiveTabPage(): Promise<PageIngest> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) throw new Error("No active tab");
  if (!/^https?:/i.test(tab.url)) {
    throw new Error("Only http(s) pages can be ingested");
  }

  let response: any;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: "extract" });
  } catch (e) {
    // sendMessage throws when no content script is registered on this tab —
    // typically a page that was open before the extension was (re)loaded.
    throw new Error(
      "Content script not loaded on this tab. Reload the page and try again.",
    );
  }
  if (!response) throw new Error("Extractor returned nothing");
  if (response.error) throw new Error(response.error);
  return response as PageIngest;
}
