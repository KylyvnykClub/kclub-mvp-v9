"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

/**
 * A select whose open list can be styled.
 *
 * A native `<select>` draws its popup in the operating system, outside the
 * page's CSS: the closed control can be made to match the design exactly, and
 * the list that drops out of it cannot be touched at all. On this page that is
 * a grey Windows list hanging under a gold rule. So the closed control keeps
 * the prototype's own styling - the same class names, the same chevron - and
 * only the list is ours.
 *
 * It behaves like the control it replaces, because a combobox that looks right
 * and cannot be driven from a keyboard is worse than the grey list: arrows and
 * Home/End move the active option, Enter and Space take it, Escape closes and
 * returns focus, a click elsewhere closes, and the active option is announced
 * through `aria-activedescendant` rather than by moving focus into the list.
 */
export type KylOption = {
  value: string;
  label: string;
  /** A flag or other 16px mark shown before the label. */
  icon?: string;
};

export function KylSelect({
  value,
  options,
  onChange,
  label,
  className = "",
  placeholder,
}: {
  value: string;
  options: KylOption[];
  onChange: (value: string) => void;
  /** Accessible name; the visible one is the field's own `<span>`. */
  label: string;
  className?: string;
  /** Shown when nothing is selected - the "All countries" row of the design. */
  placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the active row in view when the arrows walk past the panel's edge.
  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function openAt(index: number) {
    setActive(Math.max(0, index));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openAt(selectedIndex);
        else setActive((index) => Math.min(index + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openAt(selectedIndex);
        else setActive((index) => Math.max(index - 1, 0));
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActive(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active);
        else openAt(selectedIndex);
        break;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  }

  return (
    <div className={`kyl-select ${className}`.trim()} ref={root}>
      <button
        type="button"
        className="kyl-select-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={label}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt(selectedIndex))}
        onKeyDown={onKeyDown}
      >
        <span className="kyl-select-value">
          {selected?.icon && (
            <Image
              className="kyl-select-icon"
              src={selected.icon}
              alt=""
              width={20}
              height={14}
            />
          )}
          {selected?.label ?? placeholder ?? ""}
        </span>
      </button>

      <ul
        className="kyl-select-panel"
        id={`${id}-list`}
        role="listbox"
        aria-label={label}
        ref={list}
        hidden={!open}
      >
        {options.map((option, index) => (
          // The keyboard drives this list from the combobox button, through
          // `aria-activedescendant`, which is what the listbox pattern asks
          // for; an option that also took focus would break arrow navigation.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={option.value || "any"}
            id={`${id}-option-${index}`}
            className="kyl-select-option"
            role="option"
            aria-selected={option.value === value}
            data-active={index === active}
            // The trigger keeps focus, so the pointer must not steal it.
            onPointerDown={(event) => event.preventDefault()}
            onPointerEnter={() => setActive(index)}
            onClick={() => choose(index)}
          >
            {option.icon && (
              <Image
                className="kyl-select-icon"
                src={option.icon}
                alt=""
                width={20}
                height={14}
              />
            )}
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
