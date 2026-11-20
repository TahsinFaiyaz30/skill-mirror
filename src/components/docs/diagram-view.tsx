"use client";
import { useId, useMemo, useState } from "react";
import { Code2, Copy, Check, GitBranch } from "lucide-react";
import { parseMermaidFlowchart } from "@/lib/docs/diagram";

export function DiagramView({
  source,
  title,
}: {
  source: string;
  title?: string;
}) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const markerId = useId().replace(/:/g, "");

  const parsed = useMemo(() => parseMermaidFlowchart(source), [source]);

  const layout = useMemo(() => {
    const isLR = parsed.direction === "LR";
    const nodeW = 220;
    const nodeH = 74;
    const gapX = isLR ? 76 : 36;
    const gapY = isLR ? 30 : 62;
    const pad = 28;

    const maxRank = Math.max(0, ...parsed.nodes.map((n) => n.rank));
    const rankCounts = new Map<number, number>();
    for (const node of parsed.nodes) {
      rankCounts.set(node.rank, (rankCounts.get(node.rank) ?? 0) + 1);
    }
    const maxPerRank = Math.max(1, ...rankCounts.values());

    const totalW = isLR
      ? pad * 2 + (maxRank + 1) * nodeW + maxRank * gapX
      : pad * 2 + maxPerRank * nodeW + (maxPerRank - 1) * gapX;
    const totalH = isLR
      ? pad * 2 + maxPerRank * nodeH + (maxPerRank - 1) * gapY
      : pad * 2 + (maxRank + 1) * nodeH + maxRank * gapY;

    const positions = new Map<
      string,
      { x: number; y: number; w: number; h: number }
    >();
    for (const node of parsed.nodes) {
      const countInRank = rankCounts.get(node.rank) ?? 1;
      if (isLR) {
        const colHeight =
          countInRank * nodeH + Math.max(0, countInRank - 1) * gapY;
        const startY = (totalH - colHeight) / 2;
        const x = pad + node.rank * (nodeW + gapX);
        const y = startY + node.order * (nodeH + gapY);
        positions.set(node.id, { x, y, w: nodeW, h: nodeH });
      } else {
        const rowWidth =
          countInRank * nodeW + Math.max(0, countInRank - 1) * gapX;
        const startX = (totalW - rowWidth) / 2;
        const x = startX + node.order * (nodeW + gapX);
        const y = pad + node.rank * (nodeH + gapY);
        positions.set(node.id, { x, y, w: nodeW, h: nodeH });
      }
    }

    return { positions, width: Math.max(totalW, 560), height: Math.max(totalH, 160), isLR };
  }, [parsed]);

  async function copyMermaid() {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore clipboard error */
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]/70 px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
          <GitBranch size={14} className="text-[var(--orange-text)]" />
          <span>{title ?? "System Diagram"}</span>
          <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--faint)]">
            Mermaid SVG
          </span>
        </div>
        <div className="docs-no-print flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowCode((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--soft)] hover:bg-[var(--hover)]"
          >
            <Code2 size={13} />
            {showCode ? "Hide Mermaid" : "Mermaid source"}
          </button>
          <button
            type="button"
            onClick={() => void copyMermaid()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--soft)] hover:bg-[var(--hover)]"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <svg
          role="img"
          aria-label={title ?? "Architecture diagram"}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto w-full min-w-[620px]"
        >
          <defs>
            <marker
              id={`arrow-${markerId}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--orange)" />
            </marker>
          </defs>

          {parsed.edges.map((edge, idx) => {
            const from = layout.positions.get(edge.from);
            const to = layout.positions.get(edge.to);
            if (!from || !to) return null;

            const x1 = layout.isLR ? from.x + from.w : from.x + from.w / 2;
            const y1 = layout.isLR ? from.y + from.h / 2 : from.y + from.h;
            const x2 = layout.isLR ? to.x : to.x + to.w / 2;
            const y2 = layout.isLR ? to.y + to.h / 2 : to.y;
            const dx = (x2 - x1) * 0.5;
            const dy = (y2 - y1) * 0.5;
            const d = layout.isLR
              ? `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;

            return (
              <g key={`${edge.from}-${edge.to}-${idx}`}>
                <path
                  d={d}
                  fill="none"
                  stroke="var(--border-strong)"
                  strokeWidth="2"
                  markerEnd={`url(#arrow-${markerId})`}
                />
                {edge.label && (
                  <g transform={`translate(${midX}, ${midY})`}>
                    <rect
                      x={-edge.label.length * 3.5 - 8}
                      y={-10}
                      width={edge.label.length * 7 + 16}
                      height={20}
                      rx={5}
                      fill="var(--background)"
                      stroke="var(--border)"
                    />
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="10"
                      fill="var(--muted)"
                    >
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {parsed.nodes.map((node, index) => {
            const box = layout.positions.get(node.id);
            if (!box) return null;
            const highlight = node.rank === 0 || index === 0;
            return (
              <g key={node.id} transform={`translate(${box.x}, ${box.y})`}>
                <rect
                  width={box.w}
                  height={box.h}
                  rx={10}
                  fill="var(--surface-2)"
                  stroke={highlight ? "var(--orange)" : "var(--border-strong)"}
                  strokeWidth={highlight ? "1.75" : "1.25"}
                />
                <rect
                  x={0}
                  y={14}
                  width={3.5}
                  height={box.h - 28}
                  rx={2}
                  fill={highlight ? "var(--orange)" : "var(--muted)"}
                />
                <text
                  x={16}
                  y={node.sublabel ? 30 : 41}
                  fontSize="12.5"
                  fontWeight="600"
                  fill="var(--foreground)"
                >
                  {node.label.length > 26
                    ? node.label.slice(0, 25) + "…"
                    : node.label}
                </text>
                {node.sublabel && (
                  <text
                    x={16}
                    y={50}
                    fontSize="10.5"
                    fill="var(--muted)"
                  >
                    {node.sublabel.length > 32
                      ? node.sublabel.slice(0, 31) + "…"
                      : node.sublabel}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {showCode && (
        <pre className="docs-no-print overflow-x-auto border-t border-[var(--border)] bg-[var(--surface-2)]/50 p-4 font-mono text-xs leading-relaxed text-[var(--muted)]">
          <code>{source}</code>
        </pre>
      )}
    </div>
  );
}
