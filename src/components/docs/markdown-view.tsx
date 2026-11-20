"use client";
import React from "react";

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern =
    /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold text-[var(--foreground)]">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[0.84em] text-[var(--foreground)]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("*")) {
      nodes.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (match[2] && match[3]) {
      const href = match[3];
      const external = href.startsWith("http");
      nodes.push(
        <a
          key={key++}
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className="font-medium text-[var(--orange-text)] underline decoration-[var(--orange)]/50 underline-offset-2 hover:decoration-[var(--orange)]"
        >
          {match[2]}
        </a>,
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MarkdownView({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  if (!content.trim()) return null;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 font-mono text-xs leading-relaxed text-[var(--foreground)]"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Headings
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      if (level <= 2) {
        blocks.push(
          <h3
            key={key++}
            className="mt-5 text-base font-semibold tracking-tight text-[var(--foreground)] first:mt-0"
          >
            {renderInline(text)}
          </h3>,
        );
      } else {
        blocks.push(
          <h4
            key={key++}
            className="mt-4 text-sm font-semibold tracking-tight text-[var(--foreground)] first:mt-0"
          >
            {renderInline(text)}
          </h4>,
        );
      }
      i++;
      continue;
    }

    // Markdown table
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())
    ) {
      const parseCells = (row: string) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim());
      const headers = parseCells(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseCells(lines[i]));
        i++;
      }
      blocks.push(
        <div
          key={key++}
          className="overflow-x-auto rounded-lg border border-[var(--border)]"
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-3.5 py-2.5 text-xs font-semibold tracking-wide text-[var(--foreground)] uppercase"
                  >
                    {renderInline(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-[var(--hover)]">
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-3.5 py-2.5 align-top text-sm leading-relaxed text-[var(--soft)]"
                    >
                      {renderInline(row[cIdx] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="border-l-2 border-[var(--orange)] bg-[var(--surface-2)]/60 py-2.5 pr-4 pl-4 text-sm leading-relaxed text-[var(--soft)]"
        >
          {renderInline(quoteLines.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul
          key={key++}
          className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--soft)]"
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol
          key={key++}
          className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-[var(--soft)]"
        >
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>|[-*]\s|\d+\.\s|\|)/.test(lines[i].trim())
    ) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length === 0) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push(
      <p
        key={key++}
        className="text-sm leading-relaxed text-[var(--soft)]"
      >
        {renderInline(para.join(" "))}
      </p>,
    );
  }

  return <div className={`space-y-3 ${className}`}>{blocks}</div>;
}
