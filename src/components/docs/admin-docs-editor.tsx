"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bold,
  CalendarClock,
  CheckCircle2,
  Clock,
  Code,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  Heading2,
  Heading3,
  History,
  Italic,
  List,
  ListOrdered,
  Lock,
  Plus,
  Quote,
  RotateCcw,
  Save,
  Send,
  Table2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_SCHEDULE_END,
  DEFAULT_SCHEDULE_START,
  evaluateDocsAccess,
} from "@/lib/docs/access";
import {
  memberInitials,
  resizeTeamAvatar,
  teamPhotoURL,
} from "@/lib/docs/assets";
import { uploadFile, type SignedUpload } from "@/lib/supabase/upload";
import type {
  DocsAccessSettings,
  DocsAdminPayload,
  DocsDocument,
  DocsSectionConfig,
  DocsVisibilityMode,
  FeatureItem,
  TeamMember,
} from "@/types/docs";
import { DiagramView } from "./diagram-view";
import { MarkdownView } from "./markdown-view";

type AdminTab = "access" | "sections" | "pitch" | "team" | "lists";

function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalDateTimeInput(val: string, fallback: string): string {
  const parsed = new Date(val);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function SortableSectionRow({
  section,
  selected,
  onSelect,
  onToggle,
}: {
  section: DocsSectionConfig;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: section.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
        selected
          ? "border-[var(--orange)] bg-[var(--orange-tint)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${section.title}`}
        className="cursor-grab text-[var(--muted)] hover:text-[var(--foreground)] active:cursor-grabbing"
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--surface-2)] font-mono text-[10px] font-bold text-[var(--foreground)]">
          {section.code}
        </span>
        <span
          className={`truncate font-medium ${
            section.enabled
              ? "text-[var(--foreground)]"
              : "text-[var(--faint)] line-through"
          }`}
        >
          {section.title}
        </span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        title={section.enabled ? "Hide section" : "Show section"}
        className="rounded p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
      >
        {section.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
    </div>
  );
}

export function AdminDocsEditor({ initial }: { initial: DocsAdminPayload }) {
  const [data, setData] = useState<DocsAdminPayload>(initial);
  const [draft, setDraft] = useState<DocsDocument>(initial.draft);
  const [settings, setSettings] = useState<DocsAccessSettings>(initial.settings);
  const [tab, setTab] = useState<AdminTab>("access");
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    initial.draft.sections[0]?.id ?? "pitch",
  );
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [releaseSummary, setReleaseSummary] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [uploadingMemberId, setUploadingMemberId] = useState<string | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const liveAccess = useMemo(() => evaluateDocsAccess(settings), [settings]);
  const selectedSection = useMemo(
    () =>
      draft.sections.find((s) => s.id === selectedSectionId) ??
      draft.sections[0],
    [draft.sections, selectedSectionId],
  );

  const hasUnsavedDraft = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(data.draft),
    [draft, data.draft],
  );
  const hasUnpublishedChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(data.published),
    [draft, data.published],
  );

  async function saveChanges(opts: {
    includeDraft?: boolean;
    includeSettings?: boolean;
    nextSettings?: DocsAccessSettings;
    label?: string;
  }) {
    setBusy(opts.label ?? "Saving…");
    try {
      const res = await fetch("/api/admin/docs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(opts.includeDraft && { draft }),
          ...(opts.includeSettings && {
            settings: opts.nextSettings ?? settings,
          }),
        }),
      });
      const json = (await res.json()) as DocsAdminPayload & {
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message || "Save failed.");
      setData(json);
      setDraft(json.draft);
      setSettings(json.settings);
      toast.success(opts.label ? `${opts.label} saved.` : "Changes saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save changes.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function publishLive() {
    setBusy("Publishing…");
    try {
      const res = await fetch("/api/admin/docs/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          summary: releaseSummary.trim() || undefined,
          draft,
          settings,
        }),
      });
      const json = (await res.json()) as DocsAdminPayload & {
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message || "Publish failed.");
      setData(json);
      setDraft(json.draft);
      setSettings(json.settings);
      setReleaseSummary("");
      toast.success(`Published v${json.publishedVersion} to live /docs.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not publish docs.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function restoreVersion(version: number) {
    setBusy(`Restoring v${version}…`);
    try {
      const res = await fetch("/api/admin/docs/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", version }),
      });
      const json = (await res.json()) as DocsAdminPayload & {
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message || "Restore failed.");
      setData(json);
      setDraft(json.draft);
      toast.success(
        `Restored v${version} into your draft. Click Publish Live to go live.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not restore revision.",
      );
    } finally {
      setBusy(null);
    }
  }

  function applyVisibilityMode(mode: DocsVisibilityMode) {
    const next: DocsAccessSettings = {
      ...settings,
      visibilityMode: mode,
      ...(mode === "duration" && {
        durationStartedAt: new Date().toISOString(),
        durationHours: settings.durationHours || 72,
      }),
    };
    setSettings(next);
    void saveChanges({
      includeSettings: true,
      nextSettings: next,
      label: `Visibility (${mode.toUpperCase()})`,
    });
  }

  function startDurationWindow(hours: number) {
    const next: DocsAccessSettings = {
      ...settings,
      visibilityMode: "duration",
      durationStartedAt: new Date().toISOString(),
      durationHours: hours,
    };
    setSettings(next);
    void saveChanges({
      includeSettings: true,
      nextSettings: next,
      label: `${hours}h publishing window`,
    });
  }

  function resetDefaultSchedule() {
    const next: DocsAccessSettings = {
      ...settings,
      visibilityMode: "scheduled",
      scheduleStart: DEFAULT_SCHEDULE_START,
      scheduleEnd: DEFAULT_SCHEDULE_END,
    };
    setSettings(next);
    void saveChanges({
      includeSettings: true,
      nextSettings: next,
      label: "Default Jun 10–14 schedule",
    });
  }

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      const oldIndex = prev.sections.findIndex((s) => s.id === active.id);
      const newIndex = prev.sections.findIndex((s) => s.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return { ...prev, sections: arrayMove(prev.sections, oldIndex, newIndex) };
    });
  }

  function updateSection(id: string, patch: Partial<DocsSectionConfig>) {
    setDraft((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    }));
  }

  function addCustomSection() {
    const customId = `custom_${Date.now().toString(36)}`;
    const nextCode = `P${draft.sections.filter((s) => s.category === "custom").length + 1}`;
    const created: DocsSectionConfig = {
      id: customId,
      code: nextCode,
      title: "Custom Section",
      category: "custom",
      enabled: true,
      summary: "Modular custom documentation block.",
      bodyMarkdown: "### Overview\n\nAdd your notes, metrics, or links here.",
    };
    setDraft((prev) => ({ ...prev, sections: [...prev.sections, created] }));
    setSelectedSectionId(customId);
  }

  function removeCustomSection(id: string) {
    setDraft((prev) => {
      const remaining = prev.sections.filter((s) => s.id !== id);
      if (selectedSectionId === id) {
        setSelectedSectionId(remaining[0]?.id ?? "pitch");
      }
      return { ...prev, sections: remaining };
    });
  }

  function insertMarkdown(before: string, after = "", placeholder = "text") {
    const el = textareaRef.current;
    if (!el || !selectedSection) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const current = selectedSection.bodyMarkdown;
    const selected = current.slice(start, end) || placeholder;
    const next =
      current.slice(0, start) + before + selected + after + current.slice(end);
    updateSection(selectedSection.id, { bodyMarkdown: next });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }

  function updateMember(id: string, patch: Partial<TeamMember>) {
    setDraft((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.map((m) =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    }));
  }

  function addMember() {
    const created: TeamMember = {
      id: `member-${Date.now().toString(36)}`,
      name: "New Team Member",
      role: "Contributor",
      email: "member@skillmirror.app",
      bio: "",
      photoPath: null,
    };
    setDraft((prev) => ({
      ...prev,
      teamMembers: [...prev.teamMembers, created],
    }));
  }

  function removeMember(id: string) {
    setDraft((prev) => ({
      ...prev,
      teamMembers: prev.teamMembers.filter((m) => m.id !== id),
    }));
  }

  async function handleMemberPhotoUpload(memberId: string, file: File) {
    setUploadingMemberId(memberId);
    try {
      const resized = await resizeTeamAvatar(file, 400);
      const tokenRes = await fetch("/api/admin/docs/team-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ext: resized.ext,
          sizeBytes: resized.blob.size,
        }),
      });
      const signed = (await tokenRes.json()) as SignedUpload & {
        error?: { message?: string };
      };
      if (!tokenRes.ok) {
        throw new Error(signed.error?.message || "Could not create upload URL.");
      }
      await uploadFile("org-assets", signed, resized.blob, resized.contentType);
      updateMember(memberId, { photoPath: signed.path });
      toast.success(
        "Photo auto-resized to 400×400 and uploaded. Click Publish Live to update /docs.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload team photo.",
      );
    } finally {
      setUploadingMemberId(null);
    }
  }

  function addFeature() {
    const created: FeatureItem = {
      id: `feat-${Date.now().toString(36)}`,
      name: "New Feature",
      category: "Core Engine",
      description: "Describe how this capability serves candidates or hiring teams.",
      status: "upcoming",
    };
    setDraft((prev) => ({ ...prev, features: [...prev.features, created] }));
  }

  function addChangelogEntry() {
    const today = new Date().toISOString().slice(0, 10);
    setDraft((prev) => ({
      ...prev,
      changelog: [
        {
          version: `v1.${prev.changelog.length}.0`,
          date: today,
          title: "New Release",
          highlights: ["Summary of what shipped in this release."],
        },
        ...prev.changelog,
      ],
    }));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                liveAccess.allowed
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300"
              }`}
            >
              {liveAccess.allowed ? <Globe size={12} /> : <Lock size={12} />}
              {liveAccess.label}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-0.5 font-mono text-xs text-[var(--muted)]">
              Published v{data.publishedVersion}
            </span>
            {hasUnpublishedChanges && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Unpublished draft changes
              </span>
            )}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            Live /docs Control Center
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Control public visibility &amp; showcase schedules, edit pitch deck
            and technical docs, manage team avatars, and publish versioned updates.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/docs"
            target="_blank"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3.5 text-xs font-medium text-[var(--foreground)] no-underline hover:bg-[var(--hover)]"
          >
            Preview /docs
            <ExternalLink size={13} />
          </Link>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() =>
              void saveChanges({
                includeDraft: true,
                includeSettings: true,
                label: "Draft",
              })
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--hover)] disabled:opacity-50"
          >
            <Save size={13} />
            {hasUnsavedDraft ? "Save Draft *" : "Save Draft"}
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void publishLive()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--orange)] px-4 text-xs font-semibold text-[var(--orange-fg)] hover:bg-[var(--orange-hover)] disabled:opacity-50"
          >
            <Send size={13} />
            {busy ?? "Publish Live"}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-3">
        {(
          [
            ["access", "Access & Scheduling", CalendarClock],
            ["sections", "Sections & Diagrams", Heading2],
            ["pitch", "YC Pitch Deck", CheckCircle2],
            ["team", "Team Showcase", Users],
            ["lists", "Features, Roadmap & Log", List],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors ${
              tab === id
                ? "bg-[var(--orange)] font-semibold text-[var(--orange-fg)]"
                : "border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: ACCESS CONTROL, SCHEDULING & REVISIONS */}
      {tab === "access" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
          <section className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div>
              <h2 className="text-base font-semibold">
                Visibility &amp; Publishing Schedule
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Instant override applies immediately to <code>/docs</code> and{" "}
                <code>/api/docs</code>. Non-admins receive HTTP 403 when offline
                or outside the active window.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {(
                [
                  ["off", "OFF (403)", "Block public access", Lock],
                  ["on", "ON (Public)", "Accessible anytime", Globe],
                  ["scheduled", "Scheduled", "Date & time window", CalendarClock],
                  ["duration", "Duration", "Auto-expiring window", Clock],
                ] as const
              ).map(([mode, title, desc, Icon]) => {
                const active = settings.visibilityMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => applyVisibilityMode(mode)}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-[var(--orange)] bg-[var(--orange-tint)]"
                        : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <Icon
                      size={16}
                      className={
                        active
                          ? "text-[var(--orange-text)]"
                          : "text-[var(--muted)]"
                      }
                    />
                    <span className="mt-2 text-xs font-semibold">{title}</span>
                    <span className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Scheduled Window Controls */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
                  Scheduled Availability Window
                </h3>
                <button
                  type="button"
                  onClick={resetDefaultSchedule}
                  className="text-xs font-medium text-[var(--orange-text)] hover:underline"
                >
                  Reset default: Jun 10 (00:00) → Jun 14 (23:59)
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                  <span className="text-[var(--muted)]">Start Date &amp; Time</span>
                  <input
                    type="datetime-local"
                    value={toLocalDateTimeInput(settings.scheduleStart)}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        scheduleStart: fromLocalDateTimeInput(
                          e.target.value,
                          s.scheduleStart,
                        ),
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-[var(--muted)]">End Date &amp; Time</span>
                  <input
                    type="datetime-local"
                    value={toLocalDateTimeInput(settings.scheduleEnd)}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        scheduleEnd: fromLocalDateTimeInput(
                          e.target.value,
                          s.scheduleEnd,
                        ),
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void saveChanges({
                    includeSettings: true,
                    nextSettings: { ...settings, visibilityMode: "scheduled" },
                    label: "Scheduled window",
                  })
                }
                className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--hover)]"
              >
                Activate Scheduled Window
              </button>
            </div>

            {/* Duration-Based Publishing */}
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
                Duration-Based Publishing (Starts Immediately)
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {[2, 12, 24, 72, 168].map((hours) => (
                  <button
                    key={hours}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => startDurationWindow(hours)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium hover:border-[var(--orange)]"
                  >
                    {hours < 24 ? `${hours}h` : `${hours / 24}d`}
                  </button>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={8760}
                    value={settings.durationHours ?? 72}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        durationHours: Math.max(
                          1,
                          Math.min(8760, Number(e.target.value) || 24),
                        ),
                      }))
                    }
                    aria-label="Custom duration hours"
                    className="h-8 w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                  />
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      startDurationWindow(settings.durationHours ?? 72)
                    }
                    className="rounded-lg bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--hover)]"
                  >
                    Publish for custom hours
                  </button>
                </div>
              </div>
              {liveAccess.windowEnd && settings.visibilityMode === "duration" && (
                <p className="font-mono text-[11px] text-[var(--muted)]">
                  Active until: {new Date(liveAccess.windowEnd).toLocaleString()}
                </p>
              )}
            </div>
          </section>

          {/* Publish Release + Version History */}
          <section className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div>
              <h2 className="text-base font-semibold">
                Publish Release &amp; Revisions
              </h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Publishing promotes your saved draft to public{" "}
                <code>/docs</code> and snapshots a versioned revision.
              </p>
            </div>

            <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] p-4">
              <label className="block text-xs">
                <span className="text-[var(--muted)]">
                  Release note (optional)
                </span>
                <input
                  type="text"
                  value={releaseSummary}
                  onChange={(e) => setReleaseSummary(e.target.value)}
                  placeholder="e.g. Updated team portraits and investor traction metrics"
                  className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-xs"
                />
              </label>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void publishLive()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--orange)] px-4 py-2 text-xs font-semibold text-[var(--orange-fg)] hover:bg-[var(--orange-hover)] disabled:opacity-50"
              >
                <Send size={13} />
                Publish Draft as v{data.publishedVersion + 1}
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                <History size={13} />
                Revision History ({data.revisions.length})
              </h3>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {data.revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--foreground)]">
                        v{rev.version}{" "}
                        <span className="font-normal text-[var(--muted)]">
                          · {new Date(rev.createdAt).toLocaleString()}
                        </span>
                      </p>
                      <p className="truncate text-[11px] text-[var(--muted)]">
                        {rev.summary}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void restoreVersion(rev.version)}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--hover)]"
                    >
                      <RotateCcw size={11} />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: DRAG-AND-DROP SECTIONS & WYSIWYG / DIAGRAM EDITOR */}
      {tab === "sections" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Drag to Reorder ({draft.sections.length})
              </p>
              <button
                type="button"
                onClick={addCustomSection}
                className="inline-flex items-center gap-1 rounded-md bg-[var(--orange)] px-2.5 py-1 text-[11px] font-semibold text-[var(--orange-fg)] hover:bg-[var(--orange-hover)]"
              >
                <Plus size={12} />
                Add Section
              </button>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionDragEnd}
            >
              <SortableContext
                items={draft.sections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1.5">
                  {draft.sections.map((sec) => (
                    <SortableSectionRow
                      key={sec.id}
                      section={sec}
                      selected={selectedSection?.id === sec.id}
                      onSelect={() => setSelectedSectionId(sec.id)}
                      onToggle={() =>
                        updateSection(sec.id, { enabled: !sec.enabled })
                      }
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {selectedSection && (
            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-[var(--orange)] px-2 py-0.5 font-mono text-xs font-bold text-[var(--orange-fg)]">
                    {selectedSection.code}
                  </span>
                  <h2 className="text-base font-semibold">
                    Edit: {selectedSection.title}
                  </h2>
                </div>
                {selectedSection.category === "custom" && (
                  <button
                    type="button"
                    onClick={() => removeCustomSection(selectedSection.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-300"
                  >
                    <Trash2 size={12} />
                    Delete custom section
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[100px_1fr]">
                <label className="block text-xs">
                  <span className="text-[var(--muted)]">Code</span>
                  <input
                    type="text"
                    value={selectedSection.code}
                    onChange={(e) =>
                      updateSection(selectedSection.id, {
                        code: e.target.value.slice(0, 12),
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 font-mono text-xs"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-[var(--muted)]">Section Title</span>
                  <input
                    type="text"
                    value={selectedSection.title}
                    onChange={(e) =>
                      updateSection(selectedSection.id, {
                        title: e.target.value,
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs"
                  />
                </label>
              </div>

              <label className="block text-xs">
                <span className="text-[var(--muted)]">Section Summary</span>
                <input
                  type="text"
                  value={selectedSection.summary}
                  onChange={(e) =>
                    updateSection(selectedSection.id, {
                      summary: e.target.value,
                    })
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs"
                />
              </label>

              {/* WYSIWYG Formatting Toolbar + Body */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        [Heading2, "H2", "## ", "", "Heading"],
                        [Heading3, "H3", "### ", "", "Subheading"],
                        [Bold, "Bold", "**", "**", "bold text"],
                        [Italic, "Italic", "*", "*", "italic"],
                        [List, "Bullets", "- ", "", "List item"],
                        [ListOrdered, "Numbered", "1. ", "", "Step"],
                        [Quote, "Quote", "> ", "", "Highlight callout"],
                        [Code, "Code", "`", "`", "endpoint"],
                        [
                          Table2,
                          "Table",
                          "\n| Column A | Column B |\n| :--- | :--- |\n| Value 1 | Value 2 |\n",
                          "",
                          "",
                        ],
                      ] as const
                    ).map(([Icon, title, before, after, placeholder]) => (
                      <button
                        key={title}
                        type="button"
                        title={title}
                        onClick={() =>
                          insertMarkdown(before, after, placeholder)
                        }
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] bg-[var(--background)] text-[var(--soft)] hover:bg-[var(--hover)]"
                      >
                        <Icon size={13} />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewMarkdown((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-2.5 py-1 text-xs font-medium"
                  >
                    <Eye size={12} />
                    {previewMarkdown ? "Edit Markdown" : "Live Preview"}
                  </button>
                </div>

                {previewMarkdown ? (
                  <div className="min-h-[220px] rounded-lg border border-[var(--border)] bg-[var(--background)] p-4">
                    <MarkdownView
                      content={
                        selectedSection.bodyMarkdown || "*No markdown body.*"
                      }
                    />
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    rows={10}
                    value={selectedSection.bodyMarkdown}
                    onChange={(e) =>
                      updateSection(selectedSection.id, {
                        bodyMarkdown: e.target.value,
                      })
                    }
                    placeholder="Write rich Markdown content for this section…"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs leading-relaxed"
                  />
                )}
              </div>

              {/* Optional Mermaid Diagram Source + Live Preview */}
              {(selectedSection.id === "architecture" ||
                selectedSection.id === "data_flow" ||
                selectedSection.diagramSource !== undefined) && (
                <div className="space-y-3 border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--orange-text)]">
                      Editable Mermaid / SVG Diagram
                    </h3>
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      Syntax: A[&quot;Title | Subtitle&quot;] --&gt; B[&quot;Next&quot;]
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={selectedSection.diagramSource ?? ""}
                    onChange={(e) =>
                      updateSection(selectedSection.id, {
                        diagramSource: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs leading-relaxed"
                  />
                  {selectedSection.diagramSource && (
                    <DiagramView
                      source={selectedSection.diagramSource}
                      title={`Preview: ${selectedSection.title}`}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: YC PITCH DECK EDITOR */}
      {tab === "pitch" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 md:grid-cols-2">
            <label className="block text-xs">
              <span className="text-[var(--muted)]">Hero Tagline</span>
              <input
                type="text"
                value={draft.tagline}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, tagline: e.target.value }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs"
              />
            </label>
            <label className="block text-xs">
              <span className="text-[var(--muted)]">Hero Subtitle</span>
              <input
                type="text"
                value={draft.heroSubtitle}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, heroSubtitle: e.target.value }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {draft.pitchItems.map((item, idx) => (
              <div
                key={item.key}
                className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <p className="font-mono text-[11px] font-semibold text-[var(--orange-text)] uppercase">
                  {item.eyebrow}
                </p>
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      pitchItems: prev.pitchItems.map((p, i) =>
                        i === idx ? { ...p, title: e.target.value } : p,
                      ),
                    }))
                  }
                  className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs font-semibold"
                />
                <input
                  type="text"
                  value={item.summary}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      pitchItems: prev.pitchItems.map((p, i) =>
                        i === idx ? { ...p, summary: e.target.value } : p,
                      ),
                    }))
                  }
                  className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs text-[var(--muted)]"
                />
                <textarea
                  rows={5}
                  value={item.body}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      pitchItems: prev.pitchItems.map((p, i) =>
                        i === idx ? { ...p, body: e.target.value } : p,
                      ),
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-xs leading-relaxed"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: TEAM SHOWCASE EDITOR */}
      {tab === "team" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <label className="block flex-1 text-xs">
              <span className="text-[var(--muted)]">Team Name</span>
              <input
                type="text"
                value={draft.teamName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, teamName: e.target.value }))
                }
                className="mt-1 h-9 w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-xs font-semibold"
              />
            </label>
            <button
              type="button"
              onClick={addMember}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--orange)] px-3.5 text-xs font-semibold text-[var(--orange-fg)] hover:bg-[var(--orange-hover)]"
            >
              <Plus size={14} />
              Add Team Member
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {draft.teamMembers.map((member) => {
              const photo = teamPhotoURL(member.photoPath);
              const uploading = uploadingMemberId === member.id;
              return (
                <div
                  key={member.id}
                  className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)]">
                        {photo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={photo}
                            alt={member.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--orange)]/25 to-[var(--surface-3)] text-sm font-bold">
                            {memberInitials(member.name)}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--background)] px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--hover)]">
                          <Upload size={12} />
                          <span>
                            {uploading ? "Resizing & uploading…" : "Upload photo"}
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            disabled={uploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void handleMemberPhotoUpload(member.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {member.photoPath && (
                          <button
                            type="button"
                            onClick={() =>
                              updateMember(member.id, { photoPath: null })
                            }
                            className="block text-[11px] text-[var(--muted)] hover:text-rose-500"
                          >
                            Reset to fallback avatar
                          </button>
                        )}
                        <p className="text-[10px] text-[var(--faint)]">
                          Auto-cropped &amp; resized to 400×400 WebP
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(member.id)}
                      aria-label={`Remove ${member.name}`}
                      className="rounded p-1.5 text-[var(--muted)] hover:bg-rose-500/10 hover:text-rose-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="block text-xs">
                      <span className="text-[var(--muted)]">Full Name</span>
                      <input
                        type="text"
                        value={member.name}
                        onChange={(e) =>
                          updateMember(member.id, { name: e.target.value })
                        }
                        className="mt-1 h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 text-xs"
                      />
                    </label>
                    <label className="block text-xs">
                      <span className="text-[var(--muted)]">Email</span>
                      <input
                        type="email"
                        value={member.email}
                        onChange={(e) =>
                          updateMember(member.id, { email: e.target.value })
                        }
                        className="mt-1 h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 text-xs"
                      />
                    </label>
                  </div>

                  <label className="block text-xs">
                    <span className="text-[var(--muted)]">
                      Role in Application
                    </span>
                    <input
                      type="text"
                      value={member.role}
                      onChange={(e) =>
                        updateMember(member.id, { role: e.target.value })
                      }
                      className="mt-1 h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2.5 text-xs"
                    />
                  </label>

                  <label className="block text-xs">
                    <span className="text-[var(--muted)]">Short Bio</span>
                    <textarea
                      rows={2}
                      value={member.bio ?? ""}
                      onChange={(e) =>
                        updateMember(member.id, { bio: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2 text-xs"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: FEATURE MATRIX, ROADMAP & CHANGELOG */}
      {tab === "lists" && (
        <div className="space-y-6">
          {/* Features */}
          <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Feature Matrix ({draft.features.length})
              </h2>
              <button
                type="button"
                onClick={addFeature}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--orange)] px-3 py-1.5 text-xs font-semibold text-[var(--orange-fg)]"
              >
                <Plus size={13} />
                Add Feature
              </button>
            </div>
            <div className="space-y-2.5">
              {draft.features.map((feat, idx) => (
                <div
                  key={feat.id}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 sm:grid-cols-[1.2fr_1fr_110px_1.8fr_auto]"
                >
                  <input
                    type="text"
                    value={feat.name}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        features: prev.features.map((f, i) =>
                          i === idx ? { ...f, name: e.target.value } : f,
                        ),
                      }))
                    }
                    className="h-8 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium"
                  />
                  <input
                    type="text"
                    value={feat.category}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        features: prev.features.map((f, i) =>
                          i === idx ? { ...f, category: e.target.value } : f,
                        ),
                      }))
                    }
                    className="h-8 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                  />
                  <select
                    value={feat.status}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        features: prev.features.map((f, i) =>
                          i === idx
                            ? {
                                ...f,
                                status: e.target.value as FeatureItem["status"],
                              }
                            : f,
                        ),
                      }))
                    }
                    className="h-8 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                  >
                    <option value="live">live</option>
                    <option value="beta">beta</option>
                    <option value="upcoming">upcoming</option>
                    <option value="planned">planned</option>
                  </select>
                  <input
                    type="text"
                    value={feat.description}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        features: prev.features.map((f, i) =>
                          i === idx ? { ...f, description: e.target.value } : f,
                        ),
                      }))
                    }
                    className="h-8 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        features: prev.features.filter((_, i) => i !== idx),
                      }))
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-rose-500/10 hover:text-rose-500"
                    aria-label="Remove feature"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Roadmap */}
          <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="text-base font-semibold">Product Roadmap</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {draft.roadmap.map((phase, idx) => (
                <div
                  key={phase.horizon}
                  className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{phase.label}</span>
                    <input
                      type="text"
                      value={phase.timeframe}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          roadmap: prev.roadmap.map((r, i) =>
                            i === idx ? { ...r, timeframe: e.target.value } : r,
                          ),
                        }))
                      }
                      className="h-7 w-28 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px]"
                    />
                  </div>
                  <textarea
                    rows={6}
                    value={phase.items.join("\n")}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        roadmap: prev.roadmap.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                items: e.target.value
                                  .split("\n")
                                  .map((line) => line.trim())
                                  .filter(Boolean),
                              }
                            : r,
                        ),
                      }))
                    }
                    placeholder="One milestone per line…"
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-xs"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Changelog */}
          <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Changelog ({draft.changelog.length})
              </h2>
              <button
                type="button"
                onClick={addChangelogEntry}
                className="inline-flex items-center gap-1 rounded-lg bg-[var(--orange)] px-3 py-1.5 text-xs font-semibold text-[var(--orange-fg)]"
              >
                <Plus size={13} />
                Add Release
              </button>
            </div>
            <div className="space-y-3">
              {draft.changelog.map((entry, idx) => (
                <div
                  key={`${entry.version}-${idx}`}
                  className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--background)] p-3.5"
                >
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_130px_1fr_auto]">
                    <input
                      type="text"
                      value={entry.version}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          changelog: prev.changelog.map((c, i) =>
                            i === idx ? { ...c, version: e.target.value } : c,
                          ),
                        }))
                      }
                      className="h-8 rounded border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-xs"
                    />
                    <input
                      type="text"
                      value={entry.date}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          changelog: prev.changelog.map((c, i) =>
                            i === idx ? { ...c, date: e.target.value } : c,
                          ),
                        }))
                      }
                      className="h-8 rounded border border-[var(--border)] bg-[var(--surface)] px-2 font-mono text-xs"
                    />
                    <input
                      type="text"
                      value={entry.title}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          changelog: prev.changelog.map((c, i) =>
                            i === idx ? { ...c, title: e.target.value } : c,
                          ),
                        }))
                      }
                      className="h-8 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          changelog: prev.changelog.filter((_, i) => i !== idx),
                        }))
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-rose-500/10 hover:text-rose-500"
                      aria-label="Remove changelog entry"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={entry.highlights.join("\n")}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        changelog: prev.changelog.map((c, i) =>
                          i === idx
                            ? {
                                ...c,
                                highlights: e.target.value
                                  .split("\n")
                                  .map((line) => line.trim())
                                  .filter(Boolean),
                              }
                            : c,
                        ),
                      }))
                    }
                    placeholder="One highlight per line…"
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-xs"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
