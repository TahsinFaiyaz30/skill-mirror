"use client";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReportData, SoftDimension } from "@/types/report";
import { shortTime } from "@/lib/utils/client";
const chartVariables = [
  "primary",
  "accent",
  "muted",
  "border",
  "surface",
  "danger",
  "warning",
  "ev-nonverbal",
  "ev-vocal",
  "ev-integrity",
  "ev-live-vision",
  "ev-positive",
] as const;
export function useThemeColors() {
  const [colors, setColors] = useState(
    () =>
      Object.fromEntries(
        chartVariables.map((key) => [key, "var(--" + key + ")"]),
      ) as Record<(typeof chartVariables)[number], string>,
  );
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const css = getComputedStyle(root);
      setColors(
        Object.fromEntries(
          chartVariables.map((key) => [
            key,
            css.getPropertyValue("--" + key).trim(),
          ]),
        ) as typeof colors,
      );
    };
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    const task = setTimeout(read, 0);
    return () => {
      clearTimeout(task);
      observer.disconnect();
    };
  }, []);
  return colors;
}
export function SoftSkillRadar({
  candidates,
}: {
  candidates: { name: string; dimensions: SoftDimension[] }[];
}) {
  const colors = useThemeColors();
  const base = candidates[0]?.dimensions ?? [];
  if (!base.length) return null;
  const rows = base.map(({ key, label }) => ({
    label,
    ...Object.fromEntries(
      candidates.map((candidate, i) => [
        "candidate" + i,
        candidate.dimensions.find((d) => d.key === key)?.score ?? null,
      ]),
    ),
  }));
  const fills = [colors.primary, colors.accent, colors["ev-nonverbal"]];
  return (
    <div className="chart" role="figure" aria-label="Soft-skill radar">
      <p className="sr-only">
        {candidates
          .map(
            (c) =>
              c.name +
              ": " +
              c.dimensions
                .map((d) => d.label + " " + (d.score ?? "unavailable"))
                .join(", "),
          )
          .join(". ")}
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={rows} outerRadius="67%">
          <PolarGrid stroke={colors.border} />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: colors.muted, fontSize: 12 }}
          />
          <PolarRadiusAxis
            domain={[0, 100]}
            tick={{ fill: colors.muted, fontSize: 10 }}
          />
          {candidates.map((c, i) => (
            <Radar
              key={c.name + i}
              name={c.name}
              dataKey={"candidate" + i}
              stroke={fills[i]}
              fill={fills[i]}
              fillOpacity={0.19}
              isAnimationActive={false}
            />
          ))}
          <Tooltip
            contentStyle={{
              background: colors.surface,
              borderColor: colors.border,
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ComposureCurve({
  data,
}: {
  data: NonNullable<ReportData["composure"]>;
}) {
  const colors = useThemeColors();
  return (
    <div className="stack">
      {data.points.some(
        (p) => p.composure !== null || p.difficulty !== null,
      ) ? (
        <div className="chart" role="figure" aria-label="Composure by question">
          <p className="sr-only">
            {data.points
              .map(
                (p) =>
                  "Turn " +
                  (p.turnIdx + 1) +
                  ", composure " +
                  (p.composure ?? "unavailable") +
                  ", difficulty " +
                  (p.difficulty ?? "unavailable"),
              )
              .join(". ")}
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.points}>
              <CartesianGrid stroke={colors.border} />
              <XAxis
                dataKey="turnIdx"
                tickFormatter={(x: number) => String(x + 1)}
                stroke={colors.muted}
              />
              <YAxis
                yAxisId="composure"
                domain={[0, 100]}
                stroke={colors.muted}
              />
              <YAxis
                yAxisId="difficulty"
                orientation="right"
                domain={[1, 5]}
                stroke={colors.muted}
              />
              <Tooltip
                contentStyle={{
                  background: colors.surface,
                  borderColor: colors.border,
                }}
              />
              <Line
                yAxisId="composure"
                type="monotone"
                dataKey="composure"
                name="Composure"
                stroke={colors.accent}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                yAxisId="difficulty"
                type="stepAfter"
                dataKey="difficulty"
                name="Difficulty"
                stroke={colors.primary}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="muted">No composure measurements are available.</p>
      )}
      {data.pressureDelta !== null && (
        <p className="inset">
          Stress change during pressure turns ·{" "}
          <strong className="mono">{data.pressureDelta.toFixed(2)}</strong>
        </p>
      )}
      {data.commentary && <p>{data.commentary}</p>}
    </div>
  );
}
export function TimelineTracks({
  timeline,
  playhead,
  jump,
}: {
  timeline: ReportData["timeline"];
  playhead: number;
  jump: (at: number) => void;
}) {
  const colors = useThemeColors(),
    duration = Math.max(1, timeline.durationMs);
  const place = (t: number) => Math.max(0, Math.min(100, (100 * t) / duration));
  return (
    <div className="stack-sm">
      <div className="cluster between">
        <time>00:00</time>
        <time>{shortTime(timeline.durationMs)}</time>
      </div>
      <div className="timeline">
        <div
          className="timeline-head"
          style={{ left: place(playhead) + "%" }}
          aria-hidden="true"
        />
        <div className="timeline-row">
          <span>Questions</span>
          <div className="timeline-track">
            {timeline.turns.map((turn) => (
              <button
                key={turn.turnIdx}
                className="timeline-bar"
                style={{
                  left: place(turn.startMs) + "%",
                  width:
                    Math.max(1, place(turn.endMs) - place(turn.startMs)) + "%",
                }}
                title={turn.label}
                aria-label={turn.label + " at " + shortTime(turn.startMs)}
                onClick={() => jump(turn.startMs)}
              />
            ))}
          </div>
        </div>
        {timeline.buckets.length > 0 && (
          <div className="timeline-row">
            <span>Delivery</span>
            <div className="chart">
              <ResponsiveContainer width="100%" height={108}>
                <LineChart data={timeline.buckets}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={[0, 1]} yAxisId="percent" />
                  <YAxis hide yAxisId="pitch" />
                  <Line
                    dataKey="ec"
                    name="Eye contact"
                    yAxisId="percent"
                    stroke={colors.accent}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="tension"
                    name="Tension"
                    yAxisId="percent"
                    stroke={colors["ev-nonverbal"]}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="f0"
                    name="Pitch"
                    yAxisId="pitch"
                    stroke={colors.primary}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: colors.surface,
                      borderColor: colors.border,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {timeline.fillers.length > 0 && (
          <div className="timeline-row">
            <span>Fillers</span>
            <div className="timeline-track">
              {timeline.fillers.map((item, i) => (
                <button
                  key={i}
                  className="timeline-event"
                  style={{
                    left: place(item.s) + "%",
                    background: colors["ev-vocal"],
                  }}
                  title={item.w}
                  aria-label={"Filler at " + shortTime(item.s)}
                  onClick={() => jump(item.s)}
                />
              ))}
            </div>
          </div>
        )}
        <div className="timeline-row">
          <span>Events</span>
          <div className="timeline-track">
            {timeline.events.map((item) => (
              <button
                key={item.id}
                className="timeline-event"
                style={{
                  left: place(item.startMs) + "%",
                  background:
                    "var(--ev-" + item.category.replaceAll("_", "-") + ")",
                }}
                title={item.type.replaceAll("_", " ")}
                aria-label={
                  item.type.replaceAll("_", " ") +
                  " at " +
                  shortTime(item.startMs)
                }
                onClick={() => jump(item.startMs)}
              />
            ))}
          </div>
        </div>
      </div>
      <label className="cluster">
        <span>Seek through the interview</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={500}
          value={Math.min(duration, playhead)}
          onChange={(event) => jump(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
