"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileDown,
  Hash,
  Layers,
  Menu,
  Printer,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { Brand } from "@/components/shell/brand";
import Footer01 from "@/components/ui/footer-01";
import {
  EXPOSED_API_ENDPOINTS,
  EXTERNAL_APIS,
  type ExposedApiEndpoint,
} from "@/lib/docs/api-catalog";
import type { DocsPublicPayload, FeatureItem } from "@/types/docs";
import { DiagramView } from "./diagram-view";
import { MarkdownView } from "./markdown-view";
import { TeamGrid } from "./team-grid";

const LiveAnalytics = dynamic(
  () => import("./live-analytics").then((m) => m.LiveAnalytics),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
        Loading live analytics charts…
      </div>
    ),
  },
);

const METHOD_STYLES: Record<ExposedApiEndpoint["method"], string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  POST: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  PATCH: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  PUT: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  DELETE: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

const FEATURE_STATUS_STYLES: Record<FeatureItem["status"], string> = {
  live: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  beta: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  upcoming: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  planned: "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--border-strong)]",
};

export function DocsViewer({
  initial,
  authenticated,
}: {
  initial: DocsPublicPayload;
  authenticated: boolean;
}) {
  const [payload, setPayload] = useState<DocsPublicPayload>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"all" | "pitch" | "technical">("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>(
    initial.document.sections.find((s) => s.enabled)?.id ?? "pitch",
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [featureFilter, setFeatureFilter] = useState<string>("all");
  const [apiGroup, setApiGroup] = useState<string>("all");
  const [apiSearch, setApiSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { document: doc, live, access, isAdmin } = payload;

  const visibleSections = useMemo(
    () =>
      doc.sections.filter((section) => {
        if (!section.enabled) return false;
        if (viewMode === "pitch")
          return section.category === "pitch" || section.id === "team" || section.id === "analytics";
        if (viewMode === "technical")
          return section.category === "technical" || section.category === "operations";
        return true;
      }),
    [doc.sections, viewMode],
  );

  // Keyboard shortcut `/` or Cmd/Ctrl+K to focus global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll-spy for active section in sidebar TOC
  useEffect(() => {
    const elements = visibleSections
      .map((s) => window.document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0.01 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [visibleSections]);

  // Global search results across sections, pitch items, features, and API endpoints
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: {
      id: string;
      anchor: string;
      badge: string;
      title: string;
      snippet: string;
    }[] = [];

    for (const sec of doc.sections.filter((s) => s.enabled)) {
      if (
        sec.title.toLowerCase().includes(q) ||
        sec.summary.toLowerCase().includes(q) ||
        sec.bodyMarkdown.toLowerCase().includes(q)
      ) {
        results.push({
          id: `sec-${sec.id}`,
          anchor: sec.id,
          badge: `Section ${sec.code}`,
          title: sec.title,
          snippet: sec.summary || sec.bodyMarkdown.slice(0, 100),
        });
      }
    }
    for (const pitch of doc.pitchItems) {
      if (
        pitch.title.toLowerCase().includes(q) ||
        pitch.eyebrow.toLowerCase().includes(q) ||
        pitch.summary.toLowerCase().includes(q) ||
        pitch.body.toLowerCase().includes(q)
      ) {
        results.push({
          id: `pitch-${pitch.key}`,
          anchor: `pitch-${pitch.key}`,
          badge: "Pitch Deck",
          title: `${pitch.eyebrow} — ${pitch.title}`,
          snippet: pitch.summary,
        });
      }
    }
    for (const feat of doc.features) {
      if (
        feat.name.toLowerCase().includes(q) ||
        feat.description.toLowerCase().includes(q) ||
        feat.category.toLowerCase().includes(q)
      ) {
        results.push({
          id: `feat-${feat.id}`,
          anchor: "features",
          badge: `Feature · ${feat.status}`,
          title: feat.name,
          snippet: feat.description,
        });
      }
    }
    for (const ep of EXPOSED_API_ENDPOINTS) {
      if (
        ep.path.toLowerCase().includes(q) ||
        ep.summary.toLowerCase().includes(q) ||
        ep.group.toLowerCase().includes(q)
      ) {
        results.push({
          id: `api-${ep.method}-${ep.path}`,
          anchor: "api",
          badge: `${ep.method} API`,
          title: ep.path,
          snippet: ep.summary,
        });
      }
    }
    return results.slice(0, 12);
  }, [doc, query]);

  const apiGroups = useMemo(
    () => ["all", ...new Set(EXPOSED_API_ENDPOINTS.map((e) => e.group))],
    [],
  );

  const filteredEndpoints = useMemo(() => {
    const q = apiSearch.trim().toLowerCase();
    return EXPOSED_API_ENDPOINTS.filter((ep) => {
      if (apiGroup !== "all" && ep.group !== apiGroup) return false;
      if (!q) return true;
      return (
        ep.path.toLowerCase().includes(q) ||
        ep.summary.toLowerCase().includes(q) ||
        ep.auth.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q)
      );
    });
  }, [apiGroup, apiSearch]);

  const filteredFeatures = useMemo(
    () =>
      doc.features.filter((f) =>
        featureFilter === "all" ? true : f.status === featureFilter,
      ),
    [doc.features, featureFilter],
  );

  async function refreshLive() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/docs", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not refresh live telemetry.");
      const fresh = (await res.json()) as DocsPublicPayload;
      setPayload(fresh);
      toast.success("Synced live data from PostgreSQL & AI provider pool.");
    } catch {
      toast.error("Failed to refresh live metrics.");
    } finally {
      setRefreshing(false);
    }
  }

  async function copyLink(anchor?: string) {
    try {
      const url = new URL(window.location.href);
      url.hash = anchor ? `#${anchor}` : "";
      await navigator.clipboard.writeText(url.toString());
      setCopiedId(anchor ?? "__root");
      toast.success(anchor ? `Copied #${anchor} link` : "Copied /docs link");
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast.error("Could not copy link.");
    }
  }

  function jumpTo(anchor: string) {
    setQuery("");
    setMobileNavOpen(false);
    const target = window.document.getElementById(anchor);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${anchor}`);
    }
  }

  function featureMetricLabel(key: FeatureItem["liveMetricKey"]) {
    if (!key) return null;
    const count = live.counts[key];
    const labels: Record<NonNullable<FeatureItem["liveMetricKey"]>, string> = {
      sessions: `${count} sessions`,
      completedReports: `${count} reports`,
      cvs: `${count} CVs`,
      openings: `${count} openings`,
      certificates: `${count} certs`,
      events: `${count.toLocaleString()} events`,
      organizations: `${count} orgs`,
      users: `${count} users`,
    };
    return labels[key];
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--background)] text-[var(--foreground)]">
      {/* Admin preview notice when public access is OFF or outside schedule */}
      {isAdmin && !access.allowed && (
        <div className="docs-no-print border-b border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-xs text-[var(--foreground)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-medium">
              <ShieldAlert size={15} className="text-amber-500" />
              Admin Preview: Public access is currently{" "}
              <strong>{access.label}</strong> (non-admins see HTTP 403).
            </span>
            <Link
              href="/admin/docs"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--orange)] px-2.5 py-1 text-xs font-semibold text-[var(--orange-fg)] no-underline hover:bg-[var(--orange-hover)]"
            >
              Manage visibility
              <ArrowUpRight size={13} />
            </Link>
          </div>
        </div>
      )}

      {/* Top Sticky Bar */}
      <header className="docs-no-print sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/92 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] lg:hidden"
              aria-label="Toggle documentation navigation"
            >
              {mobileNavOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
            <Brand />
            <span className="hidden items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--muted)] sm:inline-flex">
              <Radio size={11} className="text-emerald-500" />
              /docs · v{payload.publishedVersion}
            </span>
          </div>

          {/* Global Search */}
          <div className="relative hidden max-w-sm flex-1 md:block">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--faint)]"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pitch, architecture, APIs… (Ctrl+K)"
              style={{ paddingLeft: "2.25rem" }}
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pr-3 text-xs text-[var(--foreground)] placeholder:text-[var(--faint)] focus:border-[var(--orange)] focus:outline-none"
            />
            {searchHits.length > 0 && (
              <div className="absolute top-11 right-0 left-0 z-50 max-h-96 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-xl">
                {searchHits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => jumpTo(hit.anchor)}
                    className="flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-[var(--hover)]"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-[var(--foreground)]">
                        {hit.title}
                      </span>
                      <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted)]">
                        {hit.badge}
                      </span>
                    </div>
                    <span className="mt-0.5 line-clamp-1 text-[11px] text-[var(--muted)]">
                      {hit.snippet}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right actions */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={() => void refreshLive()}
              disabled={refreshing}
              title="Refresh live DB metrics"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--soft)] hover:bg-[var(--hover)] disabled:opacity-50 sm:inline-flex"
            >
              <RefreshCw
                size={13}
                className={refreshing ? "animate-spin" : ""}
              />
              <span className="hidden xl:inline">Sync</span>
            </button>
            <a
              href="/api/docs?format=md"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--soft)] no-underline hover:bg-[var(--hover)] sm:inline-flex"
              title="Download Markdown"
            >
              <FileDown size={13} />
              <span className="hidden sm:inline">MD</span>
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--soft)] hover:bg-[var(--hover)] sm:inline-flex"
              title="Export PDF via Print"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-medium text-[var(--soft)] hover:bg-[var(--hover)]"
              title="Copy shareable link"
            >
              {copiedId === "__root" ? <Check size={13} /> : <Share2 size={13} />}
              <span className="hidden lg:inline">Share</span>
            </button>
            {isAdmin && (
              <Link
                href="/admin/docs"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--orange)] px-3 text-xs font-semibold text-[var(--orange-fg)] no-underline hover:bg-[var(--orange-hover)]"
              >
                <Settings2 size={13} />
                <span className="hidden sm:inline">Edit</span>
              </Link>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Mobile Collapsible Nav + Search */}
      {mobileNavOpen && (
        <div className="docs-no-print border-b border-[var(--border)] bg-[var(--surface)] px-4 py-4 lg:hidden">
          <div className="relative mb-3">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--faint)]"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sections, features, APIs…"
              style={{ paddingLeft: "2.25rem" }}
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pr-3 text-xs"
            />
          </div>
          {searchHits.length > 0 && (
            <div className="mb-3 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--background)] p-2">
              {searchHits.slice(0, 6).map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => jumpTo(hit.anchor)}
                  className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[var(--hover)]"
                >
                  <span className="font-semibold">{hit.title}</span>{" "}
                  <span className="text-[var(--muted)]">({hit.badge})</span>
                </button>
              ))}
            </div>
          )}
          <nav className="grid grid-cols-2 gap-1.5 text-xs">
            {visibleSections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => jumpTo(sec.id)}
                className={`rounded-lg px-2.5 py-2 text-left font-medium ${
                  activeId === sec.id
                    ? "bg-[var(--orange-tint)] text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:bg-[var(--hover)]"
                }`}
              >
                <span className="mr-1.5 font-mono text-[10px] text-[var(--orange-text)]">
                  {sec.code}
                </span>
                {sec.title}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Main Layout */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:py-10">
        {/* Left Sticky Sidebar TOC */}
        <aside className="docs-no-print hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="text-[11px] font-semibold tracking-wider text-[var(--muted)] uppercase">
                Reading Mode
              </p>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-[var(--surface-2)] p-1 text-[11px] font-medium">
                {(
                  [
                    ["all", "All"],
                    ["pitch", "2m Pitch"],
                    ["technical", "10m Tech"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={`rounded-md py-1 transition-colors ${
                      viewMode === mode
                        ? "bg-[var(--orange)] font-semibold text-[var(--orange-fg)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <nav aria-label="Documentation sections" className="space-y-1">
              {visibleSections.map((sec) => {
                const active = activeId === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => jumpTo(sec.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      active
                        ? "bg-[var(--orange-tint)] font-semibold text-[var(--foreground)]"
                        : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded font-mono text-[10px] ${
                        active
                          ? "bg-[var(--orange)] font-bold text-[var(--orange-fg)]"
                          : "bg-[var(--surface-2)] text-[var(--muted)]"
                      }`}
                    >
                      {sec.code}
                    </span>
                    <span className="truncate">{sec.title}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[11px] text-[var(--muted)]">
              <p className="font-semibold text-[var(--foreground)]">
                Live System Pulse
              </p>
              <dl className="mt-2 space-y-1.5">
                <div className="flex justify-between">
                  <dt>Users</dt>
                  <dd className="font-mono font-semibold text-[var(--foreground)]">
                    {live.counts.users}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Sessions</dt>
                  <dd className="font-mono font-semibold text-[var(--foreground)]">
                    {live.counts.sessions}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Reports</dt>
                  <dd className="font-mono font-semibold text-[var(--foreground)]">
                    {live.counts.completedReports}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>API Routes</dt>
                  <dd className="font-mono font-semibold text-[var(--foreground)]">
                    {live.apiEndpointsCount}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </aside>

        {/* Main Documentation Content */}
        <main className="min-w-0 space-y-12">
          {/* Hero Header */}
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--orange)]/40 bg-[var(--orange-tint)] px-3 py-1 font-semibold text-[var(--orange-text)]">
                <Sparkles size={12} />
                Live Pitch Deck + Technical Whitepaper
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                v{payload.publishedVersion} · {access.label}
              </span>
              <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 font-mono text-[11px] text-[var(--muted)]">
                AI Mode: {live.environment.aiMode}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
              SkillMirror
            </h1>
            <p className="mt-2 text-base font-medium text-[var(--orange-text)] sm:text-lg">
              {doc.tagline}
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--soft)]">
              {doc.heroSubtitle}
            </p>

            {/* Live Hero Metrics Strip */}
            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-6 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-medium text-[var(--muted)] uppercase">
                  Users / Orgs
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight">
                  {live.counts.users}{" "}
                  <span className="text-sm font-normal text-[var(--muted)]">
                    / {live.counts.organizations}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[var(--muted)] uppercase">
                  Interviews Run
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight">
                  {live.counts.sessions}{" "}
                  <span className="text-sm font-normal text-[var(--muted)]">
                    ({live.counts.completedSessions} done)
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[var(--muted)] uppercase">
                  Multimodal Events
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight">
                  {live.counts.events.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-[var(--muted)] uppercase">
                  Exposed APIs
                </p>
                <p className="mt-1 text-xl font-bold tracking-tight">
                  {live.apiEndpointsCount}
                </p>
              </div>
            </div>

            <div className="docs-no-print mt-6 flex flex-wrap items-center gap-2.5">
              <Link
                href={authenticated ? "/dashboard" : "/signup"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--orange)] px-4 py-2 text-xs font-semibold text-[var(--orange-fg)] no-underline hover:bg-[var(--orange-hover)]"
              >
                Launch Live Product
                <ArrowUpRight size={14} />
              </Link>
              <button
                type="button"
                onClick={() => jumpTo("architecture")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--hover)]"
              >
                <Layers size={14} />
                Jump to Architecture
              </button>
              <a
                href="/api/docs?format=md"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs font-medium text-[var(--soft)] no-underline hover:bg-[var(--hover)]"
              >
                <Download size={14} />
                Export Markdown
              </a>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-xs font-medium text-[var(--soft)] hover:bg-[var(--hover)] sm:hidden"
              >
                <Printer size={14} />
                Export PDF
              </button>
            </div>
          </section>

          {/* Dynamic Ordered Sections */}
          {visibleSections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="scroll-mt-24 space-y-6 border-t border-[var(--border)] pt-10 first:border-t-0 first:pt-0"
            >
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--orange)] font-mono text-xs font-bold text-[var(--orange-fg)]">
                      {section.code}
                    </span>
                    <span className="text-xs font-semibold tracking-wider text-[var(--muted)] uppercase">
                      {section.category}
                    </span>
                  </div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)]">
                    {section.title}
                  </h2>
                  {section.summary && (
                    <p className="mt-1.5 max-w-3xl text-sm text-[var(--muted)]">
                      {section.summary}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void copyLink(section.id)}
                  title={`Copy link to ${section.title}`}
                  className="docs-no-print inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                >
                  {copiedId === section.id ? (
                    <Check size={13} />
                  ) : (
                    <Hash size={13} />
                  )}
                  <span>Link</span>
                </button>
              </header>

              {/* Section A: YC-Style Pitch Deck */}
              {section.id === "pitch" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {doc.pitchItems.map((item) => (
                      <article
                        key={item.key}
                        id={`pitch-${item.key}`}
                        className={`min-w-0 scroll-mt-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 ${
                          item.key === "competition" ? "md:col-span-2" : ""
                        }`}
                      >
                        <p className="font-mono text-[11px] font-semibold tracking-wider text-[var(--orange-text)] uppercase">
                          {item.eyebrow}
                        </p>
                        <h3 className="mt-1.5 text-base font-semibold leading-snug text-[var(--foreground)]">
                          {item.title}
                        </h3>
                        <p className="mt-1.5 text-xs font-medium text-[var(--muted)]">
                          {item.summary}
                        </p>
                        <div className="mt-3.5 border-t border-[var(--border)] pt-3.5">
                          <MarkdownView content={item.body} />
                        </div>
                        {item.key === "traction" && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] text-[var(--foreground)]">
                              {live.counts.users} live users
                            </span>
                            <span className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] text-[var(--foreground)]">
                              {live.counts.sessions} interviews
                            </span>
                            <span className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] text-[var(--foreground)]">
                              {live.counts.organizations} hiring orgs
                            </span>
                            <span className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 font-mono text-[11px] text-[var(--foreground)]">
                              {live.counts.events.toLocaleString()} CV/vocal events
                            </span>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>

                  {/* Required Team Showcase embedded inside Pitch Deck */}
                  <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)]/40 p-5 sm:p-6">
                    <TeamGrid
                      teamName={doc.teamName}
                      members={doc.teamMembers}
                      compact
                    />
                  </div>
                </div>
              )}

              {/* Section C: Feature Matrix */}
              {section.id === "features" && (
                <div className="space-y-4">
                  <div className="docs-no-print flex flex-wrap items-center gap-1.5">
                    {(["all", "live", "beta", "upcoming", "planned"] as const).map(
                      (status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setFeatureFilter(status)}
                          className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors ${
                            featureFilter === status
                              ? "border-[var(--orange)] bg-[var(--orange)] font-semibold text-[var(--orange-fg)]"
                              : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {status}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-xs uppercase">
                          <th className="px-4 py-3 font-semibold">Feature</th>
                          <th className="px-4 py-3 font-semibold">Category</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Live Telemetry</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {filteredFeatures.map((feat) => {
                          const metric = featureMetricLabel(feat.liveMetricKey);
                          return (
                            <tr key={feat.id} className="hover:bg-[var(--hover)]">
                              <td className="px-4 py-3 align-top">
                                <p className="font-semibold text-[var(--foreground)]">
                                  {feat.name}
                                </p>
                                <p className="mt-0.5 text-xs text-[var(--muted)]">
                                  {feat.description}
                                </p>
                              </td>
                              <td className="px-4 py-3 align-top text-xs text-[var(--soft)]">
                                {feat.category}
                              </td>
                              <td className="px-4 py-3 align-top">
                                <span
                                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${FEATURE_STATUS_STYLES[feat.status]}`}
                                >
                                  {feat.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 align-top font-mono text-xs text-[var(--muted)]">
                                {metric ? (
                                  <span className="rounded bg-[var(--surface-2)] px-2 py-0.5 text-[var(--foreground)]">
                                    {metric}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Diagram renderer for Architecture, Data Flow, or custom diagram sections */}
              {section.diagramSource && (
                <DiagramView
                  source={section.diagramSource}
                  title={section.title}
                />
              )}

              {/* Section G: API Documentation */}
              {section.id === "api" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-base font-semibold text-[var(--foreground)]">
                      External APIs & Cloud Providers Integrated
                    </h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {EXTERNAL_APIS.map((ext) => (
                        <div
                          key={ext.provider}
                          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-sm font-semibold text-[var(--foreground)]">
                              {ext.provider}
                            </h4>
                            <span className="shrink-0 rounded bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted)]">
                              {ext.protocol.split(" ")[0]}
                            </span>
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-[var(--soft)]">
                            {ext.purpose}
                          </p>
                          <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">
                            Models/Services: {ext.modelsOrServices}
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--orange-text)]">
                            Auth: {ext.auth}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-[var(--foreground)]">
                        Exposed SkillMirror REST APIs ({filteredEndpoints.length}{" "}
                        / {EXPOSED_API_ENDPOINTS.length})
                      </h3>
                      <div className="docs-no-print flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search
                            size={13}
                            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--faint)]"
                          />
                          <input
                            type="search"
                            value={apiSearch}
                            onChange={(e) => setApiSearch(e.target.value)}
                            placeholder="Filter endpoints…"
                            style={{ paddingLeft: "2rem" }}
                            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--surface)] pr-2.5 text-xs focus:border-[var(--orange)] focus:outline-none"
                          />
                        </div>
                        <div className="relative">
                          <select
                            aria-label="Filter API group"
                            value={apiGroup}
                            onChange={(e) => setApiGroup(e.target.value)}
                            className="h-8 appearance-none rounded-lg border border-[var(--border)] bg-[var(--surface)] pr-7 pl-2.5 text-xs text-[var(--foreground)] focus:border-[var(--orange)] focus:outline-none"
                          >
                            {apiGroups.map((g) => (
                              <option key={g} value={g}>
                                {g === "all" ? "All groups" : g}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={12}
                            className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[var(--muted)]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] uppercase">
                            <th className="px-3.5 py-2.5 font-semibold">Method</th>
                            <th className="px-3.5 py-2.5 font-semibold">Endpoint</th>
                            <th className="px-3.5 py-2.5 font-semibold">Auth Model</th>
                            <th className="px-3.5 py-2.5 font-semibold">Description</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {filteredEndpoints.map((ep) => (
                            <tr
                              key={`${ep.method}-${ep.path}`}
                              className="hover:bg-[var(--hover)]"
                            >
                              <td className="px-3.5 py-2.5 align-top">
                                <span
                                  className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${METHOD_STYLES[ep.method]}`}
                                >
                                  {ep.method}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 align-top font-mono font-medium text-[var(--foreground)]">
                                {ep.path}
                              </td>
                              <td className="px-3.5 py-2.5 align-top whitespace-nowrap text-[var(--muted)]">
                                {ep.auth}
                              </td>
                              <td className="px-3.5 py-2.5 align-top text-[var(--soft)]">
                                {ep.summary}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Section I: Live AI Provider Ladders Card */}
              {section.id === "ai_layer" && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold text-[var(--orange-text)] uppercase">
                      Live Gemini Failover Ladders ({live.providers.geminiKeyCount}{" "}
                      key slots)
                    </p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div>
                        <dt className="text-[var(--muted)]">Reasoning / CV / Plan / Report</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.providers.flashModels.join(" → ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Live Voice & Vision Interviewer</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.providers.liveModels.join(" → ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Live Streaming Transcription</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.providers.transcribeLiveModel}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Interviewer TTS</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.providers.ttsModels.join(" → ")}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-semibold text-[var(--orange-text)] uppercase">
                      Live Groq LPU & Whisper Ladders ({live.providers.groqKeyCount}{" "}
                      key slots)
                    </p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div>
                        <dt className="text-[var(--muted)]">Hidden Adversarial Strategist (p4 / p6)</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.providers.groqStrategistModels.join(" → ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Word-Level Whisper Alignment</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.providers.groqWhisperModels.join(" → ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">GitHub Repo Enrichment</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.environment.githubEnrichmentEnabled
                            ? "Enabled (public repos + README)"
                            : "Optional (ready via FEATURE_GITHUB=true)"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[var(--muted)]">Active Provider Cooldowns</dt>
                        <dd className="mt-0.5 font-mono text-[var(--foreground)]">
                          {live.providers.activeCooldowns} cooling down
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}

              {/* Section J: Roadmap */}
              {section.id === "roadmap" && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {doc.roadmap.map((phase) => (
                    <div
                      key={phase.horizon}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                    >
                      <span className="rounded-full bg-[var(--orange-tint)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--orange-text)]">
                        {phase.timeframe}
                      </span>
                      <h3 className="mt-2.5 text-base font-semibold text-[var(--foreground)]">
                        {phase.label}
                      </h3>
                      <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-relaxed text-[var(--soft)]">
                        {phase.items.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {/* Section M: Live Analytics */}
              {section.id === "analytics" && <LiveAnalytics live={live} />}

              {/* Section N: Team & Contributors */}
              {section.id === "team" && (
                <TeamGrid teamName={doc.teamName} members={doc.teamMembers} />
              )}

              {/* Section O: Changelog */}
              {section.id === "changelog" && (
                <div className="space-y-4">
                  {doc.changelog.map((entry) => (
                    <article
                      key={`${entry.version}-${entry.date}`}
                      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="rounded-md bg-[var(--orange)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--orange-fg)]">
                            {entry.version}
                          </span>
                          <h3 className="text-sm font-semibold text-[var(--foreground)]">
                            {entry.title}
                          </h3>
                        </div>
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {entry.date}
                        </span>
                      </div>
                      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-[var(--soft)]">
                        {entry.highlights.map((h, idx) => (
                          <li key={idx}>{h}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              )}

              {/* Freeform Markdown Body for any section */}
              {section.bodyMarkdown.trim() && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
                  <MarkdownView content={section.bodyMarkdown} />
                </div>
              )}
            </section>
          ))}

          {/* Footer CTA inside docs */}
          <section className="docs-no-print flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-6">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--orange-text)] uppercase">
                <BookOpen size={13} />
                Single Source of Truth
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Ready to experience SkillMirror live?
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Run a 2-minute quick test interview or explore hiring workspaces directly.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={authenticated ? "/dashboard" : "/signup"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--orange)] px-4 py-2 text-xs font-semibold text-[var(--orange-fg)] no-underline hover:bg-[var(--orange-hover)]"
              >
                Try SkillMirror
                <ExternalLink size={13} />
              </Link>
              {isAdmin && (
                <Link
                  href="/admin/docs"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-2 text-xs font-medium text-[var(--foreground)] no-underline hover:bg-[var(--hover)]"
                >
                  Open /admin/docs
                </Link>
              )}
            </div>
          </section>
        </main>
      </div>

      <div className="docs-no-print">
        <Footer01 authenticated={authenticated} />
      </div>
    </div>
  );
}
