"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Award, Building2, Cpu, FileText, Users } from "lucide-react";
import type { LiveDocsTelemetry } from "@/types/docs";

export function LiveAnalytics({ live }: { live: LiveDocsTelemetry }) {
  const completionRate =
    live.counts.sessions > 0
      ? Math.round((live.counts.completedSessions / live.counts.sessions) * 100)
      : 0;

  const kpis = [
    {
      label: "Registered Users",
      value: live.counts.users.toLocaleString(),
      sub: `${live.counts.practiceUsers} practice · ${live.counts.hiringUsers} hiring`,
      icon: Users,
    },
    {
      label: "Interview Sessions",
      value: live.counts.sessions.toLocaleString(),
      sub: `${live.counts.completedSessions} completed (${completionRate}%)`,
      icon: Activity,
    },
    {
      label: "Reports & Avg Score",
      value: live.counts.completedReports.toLocaleString(),
      sub:
        live.counts.averageScore !== null
          ? `Avg score ${live.counts.averageScore}/100`
          : "Awaiting completed reports",
      icon: Award,
    },
    {
      label: "Organizations & Openings",
      value: `${live.counts.organizations} / ${live.counts.openings}`,
      sub: `${live.counts.activeOpenings} active openings · ${live.counts.invitations} invites`,
      icon: Building2,
    },
    {
      label: "Parsed CVs & Turns",
      value: `${live.counts.parsedCvs} / ${live.counts.turns}`,
      sub: `${live.counts.events.toLocaleString()} tracked multimodal events`,
      icon: FileText,
    },
    {
      label: "AI Failover Pool",
      value: `${live.providers.geminiKeyCount}G · ${live.providers.groqKeyCount}Q`,
      sub: `${live.providers.activeCooldowns} active cooldowns · ${live.environment.aiMode} mode`,
      icon: Cpu,
    },
  ];

  const eventData =
    live.eventsByCategory.length > 0
      ? live.eventsByCategory.map((e) => ({
          name: e.category.replace("_", " "),
          count: e.count,
        }))
      : [{ name: "no events yet", count: 0 }];

  const sessionData =
    live.sessionsByDay.length > 0
      ? live.sessionsByDay.map((d) => ({
          day: d.day.slice(5),
          Practice: d.practice,
          Hiring: d.company,
        }))
      : [{ day: "Today", Practice: 0, Hiring: 0 }];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>{item.label}</span>
                <Icon size={15} className="text-[var(--orange-text)]" />
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)]">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{item.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--foreground)]">
              Interview Volume (Last 14 Days)
            </h4>
            <span className="text-xs text-[var(--muted)]">Live PostgreSQL</span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={30}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="Practice"
                  fill="var(--orange)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Hiring"
                  fill="var(--info)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--foreground)]">
              Multimodal Events Captured by Category
            </h4>
            <span className="text-xs text-[var(--muted)]">
              {live.counts.events.toLocaleString()} total
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={eventData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "var(--muted)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="var(--ev-nonverbal)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-[var(--muted)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-[var(--foreground)]">
              Runtime Quotas & Policies:
            </strong>{" "}
            {live.environment.maxPracticePerDay} practice sessions/day ·{" "}
            {live.environment.maxCompanyPerDayPerOrg} company invites/day/org ·{" "}
            {live.environment.retentionDays}-day recording retention ·{" "}
            {live.counts.certificates} active verified certificates
          </span>
          <span className="font-mono text-[11px]">
            Synced {new Date(live.syncedAt).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
