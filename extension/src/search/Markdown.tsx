import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((p, i) =>
    pattern.test(p) ? (
      <mark
        key={i}
        className="rounded bg-amber-200/70 px-0.5 text-amber-950 not-italic"
      >
        {p}
      </mark>
    ) : (
      p
    ),
  );
}

function walk(children: ReactNode, terms: string[]): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") return highlight(child, terms);
    if (isValidElement(child)) {
      const c = child as React.ReactElement<{ children?: ReactNode }>;
      return cloneElement(c, {
        ...c.props,
        children: walk(c.props.children, terms),
      });
    }
    return child;
  });
}

/**
 * Obsidian-flavoured markdown renderer.
 * - Generous reading typography (Inter at ~16px, leading-relaxed)
 * - Clean blue accent for links
 * - Subtle gray block for inline + fenced code
 * - Quoted block with left rule
 */
export function Markdown({
  text,
  highlight: terms = [],
}: {
  text: string;
  highlight?: string[];
}) {
  return (
    <div className="obsidian">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-4 first:mt-0 last:mb-0 text-[15.5px] leading-[1.7] text-slate-800">
              {walk(children, terms)}
            </p>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand/80"
            >
              {walk(children, terms)}
            </a>
          ),
          h1: ({ children }) => (
            <h1 className="mt-7 mb-3 text-[26px] font-bold tracking-tight text-slate-900 border-b border-slate-200 pb-2 first:mt-0">
              {walk(children, terms)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-6 mb-3 text-[21px] font-semibold tracking-tight text-slate-900 first:mt-0">
              {walk(children, terms)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-5 mb-2 text-[17px] font-semibold tracking-tight text-slate-900 first:mt-0">
              {walk(children, terms)}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-4 mb-1.5 text-[15px] font-semibold text-slate-900 first:mt-0">
              {walk(children, terms)}
            </h4>
          ),
          h5: ({ children }) => (
            <h5 className="mt-3 mb-1 text-[13px] font-semibold uppercase tracking-wide text-slate-600 first:mt-0">
              {walk(children, terms)}
            </h5>
          ),
          h6: ({ children }) => (
            <h6 className="mt-3 mb-1 text-[12px] font-semibold uppercase tracking-wider text-slate-500 first:mt-0">
              {walk(children, terms)}
            </h6>
          ),
          ul: ({ children }) => (
            <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-slate-400">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:text-slate-400">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-[15.5px] leading-[1.7] text-slate-800">
              {walk(children, terms)}
            </li>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[13px] font-mono text-slate-800 border border-slate-200/70">
                  {children}
                </code>
              );
            }
            return <code className={`${className} text-[13px] font-mono`}>{children}</code>;
          },
          pre: ({ children }) => (
            <pre className="my-4 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 border-l-[3px] border-brand/50 bg-brand-light/40 px-4 py-2 italic text-slate-700 rounded-r-md">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-[14px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-50 text-slate-700">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
              {walk(children, terms)}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-slate-100 px-3 py-2 text-slate-800">
              {walk(children, terms)}
            </td>
          ),
          hr: () => <hr className="my-6 border-slate-200" />,
          img: ({ src, alt }) => (
            <img
              src={src}
              alt={alt ?? ""}
              className="my-4 max-w-full rounded-md border border-slate-200"
            />
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900">
              {walk(children, terms)}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-800">{walk(children, terms)}</em>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
