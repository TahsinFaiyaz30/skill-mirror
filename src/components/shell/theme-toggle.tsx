"use client";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenu } from "radix-ui";

const choices = [
  { name: "light", label: "Light", Icon: Sun },
  { name: "dark", label: "Dark", Icon: Moon },
  { name: "system", label: "System", Icon: Laptop },
];

export function ThemeOptions() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu.RadioGroup value={theme ?? "system"} onValueChange={setTheme}>
      {choices.map(({ name, label, Icon }) => (
        <DropdownMenu.RadioItem className="menu-item" key={name} value={name}>
          <Icon size={16} />
          {label}
          <DropdownMenu.ItemIndicator className="menu-check">
            ✓
          </DropdownMenu.ItemIndicator>
        </DropdownMenu.RadioItem>
      ))}
    </DropdownMenu.RadioGroup>
  );
}

export function ThemeToggle() {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="button ghost icon" aria-label="Theme">
        <Sun className="light-only" size={18} />
        <Moon className="dark-only" size={18} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="menu">
          <ThemeOptions />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
