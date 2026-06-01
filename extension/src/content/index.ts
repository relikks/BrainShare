import { runExtractor } from "./extractor";

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg?.type !== "extract") return;
  runExtractor()
    .then(send)
    .catch((e) => send({ error: String(e?.message ?? e) }));
  return true; // keep the channel open for async response
});
