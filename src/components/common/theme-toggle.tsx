"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { DropdownMenu } from "radix-ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";

const subscribe = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

const choices = [
  ["light", Sun, "Light"],
  ["dark", Moon, "Dark"],
  ["system", Monitor, "System"],
] as const;

export function ThemeSelector({ fullWidth = false }: { fullWidth?: boolean }) {
  const hydrated = useHydrated();
  const { theme, setTheme } = useTheme();
  const current = hydrated ? (theme ?? "system") : "system";

  return (
    <div
      className="theme-segment"
      style={fullWidth ? { width: "100%" } : undefined}
      role="group"
      aria-label="Color theme"
    >
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

export function ThemeToggle({
  variant = "icon",
}: {
  variant?: "icon" | "row" | "navpill";
}) {
  const hydrated = useHydrated();
  const { theme, setTheme } = useTheme();
  const current = hydrated ? (theme ?? "system") : "system";
  const currentChoice =
    choices.find(([value]) => value === current) ?? choices[2];
  const ActiveIcon = currentChoice[1];
  const currentLabel = hydrated ? currentChoice[2] : "System";

  if (variant === "row") {
    return <ThemeSelector fullWidth />;
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={
            variant === "navpill" ? "navpill-theme" : "button secondary icon sm"
          }
          disabled={!hydrated}
          aria-label={"Theme: " + currentLabel}
          title={"Theme: " + currentLabel}
        >
          <ActiveIcon size={variant === "navpill" ? 18 : 17} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="end" sideOffset={8}>
          {choices.map(([value, Icon, text]) => (
            <DropdownMenu.Item
              key={value}
              className="menu-item"
              onSelect={() => setTheme(value)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{text}</span>
              {current === value && (
                <Check size={15} className="menu-check" aria-hidden="true" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
