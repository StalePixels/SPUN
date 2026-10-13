"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Dropdown from "react-bootstrap/Dropdown";
import Nav from "react-bootstrap/Nav";
import { findTheme, MODE_COOKIE, MODES, resolveMode, THEME_COOKIE, THEME_LINK_ID, themeHref, THEMES, type Mode, type Theme } from "@/themes";

const prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;

function readCookie(name: string) {
  const match = document.cookie.match(new RegExp(`(^|; )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

// A string, so useSyncExternalStore sees the same snapshot until a choice changes it.
function storedChoice() {
  const theme = findTheme(readCookie(THEME_COOKIE));
  return `${theme.id} ${resolveMode(theme, readCookie(MODE_COOKIE))}`;
}

function apply(theme: Theme, mode: Mode) {
  const effective = mode === "auto" ? (prefersDark() ? "dark" : "light") : mode;
  document.documentElement.setAttribute("data-theme", theme.id);
  document.documentElement.setAttribute("data-bs-theme", effective);
}

// Loads the new stylesheet beside the old one first, so the page is never unstyled.
function swapStylesheet(href: string) {
  const current = document.getElementById(THEME_LINK_ID);
  if (!current || current.getAttribute("href") === href) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const next = document.createElement("link");
    next.rel = "stylesheet";
    next.href = href;
    next.onload = next.onerror = () => {
      current.onload = current.onerror = () => next.remove();
      current.setAttribute("href", href);
      resolve();
    };
    current.after(next);
  });
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function ThemeSwitch() {
  const choice = useSyncExternalStore(subscribe, storedChoice, () => null);
  const [show, setShow] = useState(false);
  const [themeId, mode] = choice ? (choice.split(" ") as [string, Mode]) : [null, null];
  const current = themeId ? findTheme(themeId) : null;

  useEffect(() => {
    if (!current || mode !== "auto") return;
    apply(current, "auto");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply(current, "auto");
    media.addEventListener("change", onChange);
    window.addEventListener("pageshow", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("pageshow", onChange);
    };
  }, [current, mode]);

  const choose = async (theme: Theme, next: Mode) => {
    writeCookie(THEME_COOKIE, theme.id);
    if (theme.modes.length > 1) writeCookie(MODE_COOKIE, next);
    setShow(false);
    await swapStylesheet(themeHref(theme.id));
    apply(theme, next);
    listeners.forEach((listener) => listener());
  };

  const toggleIcon = current && current.modes.length === 1 ? current.icon : MODES[mode ?? "auto"].icon;

  return (
    // In a Nav for the navbar's link colours.
    <Nav>
      <Dropdown as={Nav.Item} align="end" show={show} onToggle={setShow}>
        <Dropdown.Toggle data-testid="theme-toggle"
          as={Nav.Link}
          id="bd-theme"
          className="px-2 py-2 d-flex align-items-center"
          aria-label="Choose theme"
        >
          <i className={`bi ${toggleIcon}`} aria-hidden="true" />
        </Dropdown.Toggle>
        <Dropdown.Menu>
          {THEMES.map((theme) => {
            const active = current?.id === theme.id;
            const label = (
              <>
                <i className={`bi ${theme.icon}`} aria-hidden="true" />
                <span className="ms-2 me-3">{theme.label}</span>
                {active && <i className="bi bi-check2 ms-auto" aria-hidden="true" />}
              </>
            );
            if (theme.modes.length === 1) {
              return (
                <Dropdown.Item data-testid={`theme-${theme.id}`}
                  key={theme.id}
                  as="button"
                  type="button"
                  className="d-flex align-items-center"
                  active={active}
                  onClick={() => choose(theme, theme.modes[0])}
                >
                  {label}
                </Dropdown.Item>
              );
            }
            return (
              <Dropdown key={theme.id} drop="start">
                <Dropdown.Toggle data-testid={`theme-${theme.id}`}
                  as="button"
                  type="button"
                  className={`dropdown-item d-flex align-items-center${active ? " active" : ""}`}
                >
                  {label}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {theme.modes.map((value) => (
                    <Dropdown.Item data-testid={`theme-${theme.id}-${value}`}
                      key={value}
                      as="button"
                      type="button"
                      className="d-flex align-items-center"
                      active={active && mode === value}
                      onClick={() => choose(theme, value)}
                    >
                      <i className={`bi ${MODES[value].icon}`} aria-hidden="true" />
                      <span className="ms-2 me-3">{MODES[value].label}</span>
                      {active && mode === value && <i className="bi bi-check2 ms-auto" aria-hidden="true" />}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            );
          })}
        </Dropdown.Menu>
      </Dropdown>
    </Nav>
  );
}
