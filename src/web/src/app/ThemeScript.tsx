"use client";

// Runs before paint: for "auto" only the browser knows the system setting.
const THEME_INIT_SCRIPT = `(function(){
  try {
    var cookie = document.cookie.split('; ').find(function(c){return c.indexOf('NBN-theme=')===0});
    var value = cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : null;
    var theme;
    if (value === 'light' || value === 'dark') {
      theme = value;
    } else {
      var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
    }
    var html = document.documentElement;
    if (html.getAttribute('data-bs-theme') !== theme) {
      html.setAttribute('data-bs-theme', theme);
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
