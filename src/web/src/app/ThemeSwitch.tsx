"use client";

import { useEffect, useSyncExternalStore } from "react";
import Dropdown from "react-bootstrap/Dropdown";
import Nav from "react-bootstrap/Nav";

// Same NBN-theme cookie as the other NextBestNetwork sites; the root layout reads it.

type Mode = "light" | "dark" | "auto";

const COOKIE = "NBN-theme";

const MODES: { value: Mode; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "bi-sun-fill" },
  { value: "dark", label: "Dark", icon: "bi-moon-stars-fill" },
  { value: "auto", label: "Auto", icon: "bi-circle-half" },
];

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function storedMode(): Mode {
  const match = document.cookie.match(new RegExp(`(^|; )${COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[2]) : null;
  return value === "light" || value === "dark" ? value : "auto";
}

function storeMode(mode: Mode) {
  document.cookie = `${COOKIE}=${encodeURIComponent(mode)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function applyMode(mode: Mode) {
  const effective = mode === "auto" ? (prefersDark() ? "dark" : "light") : mode;
  document.documentElement.setAttribute("data-bs-theme", effective);
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ThemeSwitch() {
  const mode = useSyncExternalStore(subscribe, storedMode, () => null);

  useEffect(() => {
    if (mode !== "auto") return;
    applyMode("auto");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("auto");
    media.addEventListener("change", onChange);
    window.addEventListener("pageshow", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("pageshow", onChange);
    };
  }, [mode]);

  const choose = (next: Mode) => {
    storeMode(next);
    applyMode(next);
    listeners.forEach((listener) => listener());
  };

  const toggleIcon = MODES.find((m) => m.value === mode)?.icon ?? "bi-circle-half";

  return (
    // In a Nav for the navbar's link colours.
    <Nav>
      <Dropdown as={Nav.Item} align="end">
        <Dropdown.Toggle data-testid="theme-toggle"
          as={Nav.Link}
          id="bd-theme"
          className="px-2 py-2 d-flex align-items-center"
          aria-label="Toggle theme"
        >
          <i className={`bi ${toggleIcon}`} aria-hidden="true" />
        </Dropdown.Toggle>
        <Dropdown.Menu>
          {MODES.map(({ value, label, icon }) => (
            <Dropdown.Item data-testid={`theme-${value}`}
              key={value}
              as="button"
              type="button"
              className="d-flex align-items-center"
              active={mode === value}
              onClick={() => choose(value)}
            >
              <i className={`bi ${icon}`} aria-hidden="true" />
              <span className="ms-2">{label}</span>
              {mode === value && <i className="bi bi-check2 ms-auto" aria-hidden="true" />}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>
    </Nav>
  );
}
