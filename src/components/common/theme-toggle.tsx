"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const subscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

export function ThemeToggle({
  variant = "icon",
}: {
  variant?: "icon" | "row";
}) {
  const hydrated = useHydrated();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = hydrated && resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  if (variant === "row") {
    return (
      <button
        type="button"
        className="button ghost theme-toggle-row"
        disabled={!hydrated}
        aria-label={label}
        onClick={() => setTheme(next)}
      >
        <span className="cluster" style={{ gap: 10 }}>
          {isDark ? (
            <Moon size={17} aria-hidden="true" />
          ) : (
            <Sun size={17} aria-hidden="true" />
          )}
          <span>Theme</span>
        </span>
        <span className="badge theme-toggle-pill">
          {hydrated ? (isDark ? "Dark" : "Light") : "System"}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="button secondary icon sm"
      disabled={!hydrated}
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      {isDark ? (
        <Sun size={17} aria-hidden="true" />
      ) : (
        <Moon size={17} aria-hidden="true" />
      )}
    </button>
  );
}

const choices = [
  ["light", Sun, "Light"],
  ["dark", Moon, "Dark"],
  ["system", Monitor, "System"],
] as const;

export function ThemeSelector() {
  const hydrated = useHydrated();
  const { theme, setTheme } = useTheme();
  const current = hydrated ? (theme ?? "system") : "system";

  return (
    <div className="theme-segment" role="group" aria-label="Color theme">
      {choices.map(([value, Icon, text]) => (
        <button
          key={value}
          type="button"
          className="button ghost sm"
          disabled={!hydrated}
          aria-pressed={hydrated ? current === value : undefined}
          onClick={() => setTheme(value)}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
