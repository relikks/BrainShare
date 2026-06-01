import type { ChunkIn } from "@/types";

export interface ChunkOpts {
  minChars: number;
  maxChars: number;
  prefixChars: number;
}

/**
 * Heading-aware markdown chunker. Splits on ATX headings, never splits
 * inside fenced code blocks, soft-wraps on blank lines when over maxChars.
 *
 * heading_path is built from real markdown headings, indexed by their
 * ATX level (1..6). Empty slots are filtered out, so passing an H3 in
 * a section that has no H1/H2 yields heading_path = ["The H3 text"] not
 * [null, null, "The H3 text"].
 */
export function chunkMarkdown(md: string, opts: ChunkOpts): ChunkIn[] {
  const lines = md.split(/\r?\n/);
  const stack: string[] = []; // index = level-1
  let inFence = false;
  let buffer = "";
  let bufferHeadings: string[] = [];
  const out: { text: string; headingPath: string[] }[] = [];

  const flush = () => {
    const t = buffer.trim();
    if (t.length >= opts.minChars) {
      out.push({ text: t, headingPath: bufferHeadings });
    }
    buffer = "";
    bufferHeadings = stack.filter((s) => s && s.length > 0);
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Toggle code fences — never split inside.
    if (/^(```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      buffer += line + "\n";
      continue;
    }
    if (inFence) {
      buffer += line + "\n";
      continue;
    }

    // ATX heading.
    const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (h) {
      flush();
      const level = h[1].length;
      const text = h[2].trim();
      stack.length = level; // drop deeper levels
      while (stack.length < level) stack.push("");
      stack[level - 1] = text;
      bufferHeadings = stack.filter((s) => s && s.length > 0);
      // Keep the heading at the top of the new chunk so the markdown
      // renderer produces an <h*> element instead of starting mid-paragraph.
      buffer += line + "\n\n";
      continue;
    }

    buffer += line + "\n";

    // Soft size cap: only break on a blank line so we don't split mid-paragraph.
    if (buffer.length > opts.maxChars && trimmed === "") {
      flush();
    }
  }
  flush();

  return out.map((c, i) => ({
    text: c.text,
    position: i,
    anchor: {
      text_prefix: plainTextPrefix(c.text, opts.prefixChars),
      text_suffix: null,
      heading_path: c.headingPath,
    },
  }));
}

/**
 * Strip markdown syntax so the prefix matches the *literal* text the
 * user sees on the page — required for Chrome's #:~:text= deep-link.
 */
function plainTextPrefix(md: string, n: number): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/[*_~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, n).trim();
}
