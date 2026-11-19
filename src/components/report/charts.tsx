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
const eventLegend = [
  ["nonverbal", "Body language"],
  ["vocal", "Voice"],
  ["integrity", "Integrity"],
  ["live_vision", "Camera check"],
  ["positive", "Strength"],
] as const;
// One row per signal over the same time axis: questions, fillers, events and
// delivery lines. Every mark is a button that plays the clip at that moment.
export function TimelineTracks({
  timeline,
  playhead,
  seek,
  jump,
}: {
  timeline: ReportData["timeline"];
  playhead: number;
  seek: (at: number) => void;
  jump: (at: number) => void;
}) {
  const colors = useThemeColors(),
    duration = Math.max(1, timeline.durationMs);
  const place = (t: number) => Math.max(0, Math.min(100, (100 * t) / duration));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * timeline.durationMs);
  const present = new Set(timeline.events.map((item) => item.category));
  return (
    <div className="stack">
      <ul className="timeline-legend" aria-label="Timeline legend">
        <li>
          <i className="swatch bar" />
          Question
        </li>
        {timeline.fillers.length > 0 && (
          <li>
            <i
              className="swatch dot"
              style={{ background: colors["ev-vocal"] }}
            />
            Filler word
          </li>
        )}
        {eventLegend
          .filter(([key]) => present.has(key))
          .map(([key, label]) => (
            <li key={key}>
              <i
                className="swatch dot"
                style={{
                  background: "var(--ev-" + key.replace("_", "-") + ")",
                }}
              />
              {label}
            </li>
          ))}
      </ul>
      <div className="timeline">
        <div className="timeline-row timeline-axis" aria-hidden="true">
          <span />
          <div className="timeline-ticks">
            {ticks.map((at, index) => (
              <time key={index} style={{ left: place(at) + "%" }}>
                {shortTime(at)}
              </time>
            ))}
          </div>
        </div>
        <div className="timeline-row">
          <span className="timeline-label">
            Questions
            <small>{timeline.turns.length} answered</small>
          </span>
          <div className="timeline-track">
            <div
              className="timeline-head"
              style={{ left: place(playhead) + "%" }}
              aria-hidden="true"
            />
            {timeline.turns.map((turn, index) => {
              const width = Math.max(
                1,
                place(turn.endMs) - place(turn.startMs),
              );
              return (
                <button
                  key={turn.turnIdx}
                  className="timeline-bar"
                  style={{
                    left: place(turn.startMs) + "%",
                    width: width + "%",
                  }}
                  title={turn.label}
                  aria-label={turn.label + " at " + shortTime(turn.startMs)}
                  onClick={() => jump(turn.startMs)}
                >
                  {width > 4 && <span aria-hidden="true">Q{index + 1}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {timeline.fillers.length > 0 && (
          <div className="timeline-row">
            <span className="timeline-label">
              Fillers
              <small>{timeline.fillers.length} heard</small>
            </span>
            <div className="timeline-track thin">
              <div
                className="timeline-head"
                style={{ left: place(playhead) + "%" }}
                aria-hidden="true"
              />
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
          <span className="timeline-label">
            Moments
            <small>{timeline.events.length} noted</small>
          </span>
          <div className="timeline-track thin">
            <div
              className="timeline-head"
              style={{ left: place(playhead) + "%" }}
              aria-hidden="true"
            />
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
        {timeline.buckets.length > 0 && (
          <div className="timeline-row">
            <span className="timeline-label">
              Delivery
              <small>
                <i className="line-key" style={{ background: colors.accent }} />
                Eye contact{" "}
                <i
                  className="line-key"
                  style={{ background: colors["ev-nonverbal"] }}
                />
                Tension{" "}
                <i
                  className="line-key"
                  style={{ background: colors.primary }}
                />
                Pitch
              </small>
            </span>
            <div className="chart timeline-chart">
              <ResponsiveContainer width="100%" height={96}>
                <LineChart data={timeline.buckets}>
                  <XAxis dataKey="t" hide />
                  <YAxis hide domain={[0, 1]} yAxisId="percent" />
                  <YAxis hide yAxisId="pitch" />
                  <Line
                    dataKey="ec"
                    name="Eye contact"
                    yAxisId="percent"
                    stroke={colors.accent}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="tension"
                    name="Tension"
                    yAxisId="percent"
                    stroke={colors["ev-nonverbal"]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="f0"
                    name="Pitch"
                    yAxisId="pitch"
                    stroke={colors.primary}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Tooltip
                    isAnimationActive={false}
                    contentStyle={{
                      background: colors.surface,
                      borderColor: colors.border,
                      borderRadius: 12,
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
      <div className="timeline-controls">
        <label className="timeline-seek">
          <span>Seek through the interview</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={500}
            value={Math.min(duration, playhead)}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <time>{shortTime(Math.min(duration, playhead))}</time>
        </label>
        <button
          type="button"
          className="button"
          onClick={() => jump(playhead)}
          disabled={playhead >= timeline.durationMs}
        >
          Play from playhead
        </button>
      </div>
      <small>
        Select any mark to replay that moment. Drag the slider to move the
        playhead.
      </small>
    </div>
  );
}
