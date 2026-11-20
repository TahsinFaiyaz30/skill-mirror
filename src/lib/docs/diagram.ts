export interface DiagramNode {
  id: string;
  label: string;
  sublabel?: string;
  rank: number;
  order: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ParsedDiagram {
  direction: "LR" | "TD";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

function cleanLabel(raw: string): { label: string; sublabel?: string } {
  const unquoted = raw.trim().replace(/^["']|["']$/g, "");
  const parts = unquoted
    .split(/\\n|\s*\|\s*/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    label: parts[0] ?? unquoted,
    sublabel: parts.slice(1).join(" · ") || undefined,
  };
}

function parseNodeToken(token: string): {
  id: string;
  label?: string;
  sublabel?: string;
} | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const bracketed = trimmed.match(
    /^([A-Za-z0-9_-]+)\s*(?:\[\((.*?)\)\]|\[(.*?)\]|\((.*?)\)|\{(.*?)\})$/,
  );
  if (bracketed) {
    const raw =
      bracketed[2] ?? bracketed[3] ?? bracketed[4] ?? bracketed[5] ?? "";
    const cleaned = cleanLabel(raw);
    return { id: bracketed[1], ...cleaned };
  }
  const plain = trimmed.match(/^([A-Za-z0-9_-]+)$/);
  if (plain) return { id: plain[1] };
  return null;
}

/**
 * Lightweight, safe Mermaid flowchart parser (supports `flowchart LR`/`TD`,
 * `graph LR`/`TD`, node labels `A["Title | Subtitle"]`, and labeled arrows
 * `A -->|label| B` or `A -- label --> B`). Renders cleanly to pure React SVG
 * without loading external scripts or injecting raw HTML.
 */
export function parseMermaidFlowchart(source: string): ParsedDiagram {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("%%"));

  let direction: "LR" | "TD" = "LR";
  const nodeMap = new Map<string, { label: string; sublabel?: string }>();
  const edges: DiagramEdge[] = [];

  const ensureNode = (token: string): string | null => {
    const parsed = parseNodeToken(token);
    if (!parsed) return null;
    const existing = nodeMap.get(parsed.id);
    if (!existing) {
      nodeMap.set(parsed.id, {
        label: parsed.label ?? parsed.id,
        sublabel: parsed.sublabel,
      });
    } else if (parsed.label && existing.label === parsed.id) {
      nodeMap.set(parsed.id, {
        label: parsed.label,
        sublabel: parsed.sublabel,
      });
    }
    return parsed.id;
  };

  for (const line of lines) {
    const header = line.match(/^(?:flowchart|graph)\s+(LR|RL|TD|TB)\b/i);
    if (header) {
      direction = header[1].toUpperCase().startsWith("T") ? "TD" : "LR";
      continue;
    }
    if (/^(?:subgraph|end|classDef|class|style)\b/i.test(line)) continue;

    // Match A -->|label| B, A -- label --> B, A --> B, A <--> B
    const edgeMatch = line.match(
      /^(.+?)\s*(?:<-->|-->|--\s+([^->]+?)\s+-->|-->\|([^|]+)\|)\s*(.+)$/,
    );
    if (edgeMatch) {
      const fromId = ensureNode(edgeMatch[1]);
      const toId = ensureNode(edgeMatch[4]);
      const rawLabel = (edgeMatch[2] ?? edgeMatch[3] ?? "")
        .trim()
        .replace(/^["']|["']$/g, "");
      if (fromId && toId) {
        edges.push({
          from: fromId,
          to: toId,
          label: rawLabel || undefined,
        });
      }
      continue;
    }

    ensureNode(line);
  }

  // Topological rank assignment (BFS from sources, resilient to cycles)
  const ids = [...nodeMap.keys()];
  const incoming = new Map<string, number>(ids.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const ranks = new Map<string, number>();
  const queue: string[] = ids.filter((id) => (incoming.get(id) ?? 0) === 0);
  if (queue.length === 0 && ids.length > 0) queue.push(ids[0]);
  for (const id of queue) ranks.set(id, 0);

  const visitedCount = new Map<string, number>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentRank = ranks.get(current) ?? 0;
    for (const next of outgoing.get(current) ?? []) {
      const seen = visitedCount.get(next) ?? 0;
      if (seen > ids.length) continue;
      visitedCount.set(next, seen + 1);
      const nextRank = currentRank + 1;
      if (!ranks.has(next) || (ranks.get(next)! < nextRank && nextRank <= 8)) {
        ranks.set(next, nextRank);
        queue.push(next);
      }
    }
  }
  for (const id of ids) {
    if (!ranks.has(id)) ranks.set(id, 0);
  }

  const perRank = new Map<number, string[]>();
  for (const id of ids) {
    const r = ranks.get(id) ?? 0;
    const list = perRank.get(r) ?? [];
    list.push(id);
    perRank.set(r, list);
  }

  const nodes: DiagramNode[] = ids.map((id) => {
    const r = ranks.get(id) ?? 0;
    const meta = nodeMap.get(id)!;
    return {
      id,
      label: meta.label,
      sublabel: meta.sublabel,
      rank: r,
      order: (perRank.get(r) ?? []).indexOf(id),
    };
  });

  return { direction, nodes, edges };
}
