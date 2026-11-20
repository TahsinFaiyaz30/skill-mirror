"use client";
import { useId, useState, type KeyboardEvent } from "react";

// A text input with a styled suggestion list. It replaces <datalist>, whose
// native arrow and popup ignored the app's styles and looked broken.
export function SuggestInput({
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  maxLength,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLowerCase();
  const matches = options
    .filter((option) => !query || option.toLowerCase().includes(query))
    .filter((option) => option.toLowerCase() !== query)
    .slice(0, 8);
  const shown = open && matches.length > 0;
  const choose = (option: string) => {
    onChange(option);
    setOpen(false);
    setActive(-1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        matches.length ? (current + step + matches.length) % matches.length : -1,
      );
    } else if (event.key === "Enter" && shown && active >= 0) {
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape" && shown) {
      event.preventDefault();
      setOpen(false);
    }
  };
  const highlight = (option: string) => {
    const at = query ? option.toLowerCase().indexOf(query) : -1;
    if (at < 0) return option;
    return (
      <>
        {option.slice(0, at)}
        <mark>{option.slice(at, at + query.length)}</mark>
        {option.slice(at + query.length)}
      </>
    );
  };
  return (
    <div className="suggest">
      <input
        name={name}
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={
          shown && active >= 0 ? listId + "-" + active : undefined
        }
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {shown && (
        <ul className="suggest-list" role="listbox" id={listId}>
          {matches.map((option, index) => (
            <li
              key={option}
              id={listId + "-" + index}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(index)}
            >
              {highlight(option)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
