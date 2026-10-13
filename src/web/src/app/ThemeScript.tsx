"use client";

import { MODE_COOKIE, THEME_COOKIE, THEMES } from "@/themes";

const THEME_MODES = JSON.stringify(Object.fromEntries(THEMES.map((theme) => [theme.id, theme.modes])));

// Runs before paint: for "auto" only the browser knows the system setting.
const THEME_INIT_SCRIPT = `(function(){
  try {
    var themes = ${THEME_MODES};
    function cookie(name) {
      var c = document.cookie.split('; ').find(function(c){return c.indexOf(name + '=')===0});
      return c ? decodeURIComponent(c.split('=').slice(1).join('=')) : null;
    }
    var id = cookie('${THEME_COOKIE}');
    if (!Object.prototype.hasOwnProperty.call(themes, id)) id = '${THEMES[0].id}';
    var modes = themes[id];
    var mode = cookie('${MODE_COOKIE}');
    if (modes.indexOf(mode) < 0) mode = modes.indexOf('auto') >= 0 ? 'auto' : modes[0];
    if (mode === 'auto') {
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      mode = prefersDark ? 'dark' : 'light';
    }
    var html = document.documentElement;
    if (html.getAttribute('data-theme') !== id) {
      html.setAttribute('data-theme', id);
    }
    if (html.getAttribute('data-bs-theme') !== mode) {
      html.setAttribute('data-bs-theme', mode);
    }
  } catch(_) {}
})();`;

// A server action redirect remounts the root layout, and React then makes this
// script on the client, where it never runs: text/plain there stops React's warning.
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}
