import Defuddle from "defuddle/full";
import type { PageIngest } from "@/types";
import { chunkMarkdown } from "./chunker";

export async function runExtractor(): Promise<PageIngest> {
  const res = new Defuddle(document, {
    markdown: true,
    url: location.href,
    removeImages: false,
  }).parse();

  const md = res.content || "";
  console.info(
    "[sigshare/extractor] Defuddle output — title:",
    res.title,
    "| markdown length:",
    md.length,
    "| first 1500 chars:",
  );
  console.info(md.slice(0, 1500));
  const chunks = chunkMarkdown(md, {
    minChars: 200,
    maxChars: 1200,
    prefixChars: 90,
  });

  return {
    url: location.href.split("#")[0],
    page_title: res.title || document.title || location.hostname,
    chunks,
  };
}
