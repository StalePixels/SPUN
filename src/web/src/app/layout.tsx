import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import NavbarBrand from "react-bootstrap/NavbarBrand";
import "bootstrap-icons/font/bootstrap-icons.min.css";
import "@/styles/theme.scss";
import { currentUser, isAdmin } from "@/lib/session";
import { logIn, logOut } from "./actions";
import { ThemeSwitch } from "./ThemeSwitch";

export const metadata: Metadata = {
  title: "SPUN",
};

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const admin = user ? await isAdmin(user.id) : false;
  const stored = (await cookies()).get("NBN-theme")?.value;
  const serverTheme = stored === "light" || stored === "dark" ? stored : "light";
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-bs-theme={serverTheme}
      suppressHydrationWarning
    >
      <head>
        {/* Not next/script: beforeInteractive is too late to stop a flash of the
            wrong mode. React warns about this in dev. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Navbar data-testid="navbar" bg="primary" data-bs-theme="dark" className="mb-4">
          <Container>
            <NavbarBrand href="/">
              <i className="bi bi-box-seam me-2" />
              SPUN
            </NavbarBrand>
            <div className="d-flex align-items-center gap-3">
              {admin && (
                <Link href="/admin" className="nav-link text-light" data-testid="nav-admin">
                  <i className="bi bi-gear me-1" />
                  Admin
                </Link>
              )}
              {user?.username && (
                <Link href="/me" className="nav-link text-light" data-testid="nav-username">
                  {user.username}
                </Link>
              )}
              <ThemeSwitch />
              {user && (
                <Link href="/my" className="nav-link text-light" data-testid="nav-my">
                  <i className="bi bi-bookmark me-1" />
                  My Apps
                </Link>
              )}
              {user && (
                <Link href="/publish" className="btn btn-light btn-sm" data-testid="nav-publish">
                  <i className="bi bi-upload me-1" />
                  Publishers
                </Link>
              )}
              {user ? (
                <form action={logOut}>
                  <button type="submit" className="btn btn-outline-light btn-sm" data-testid="nav-logout">
                    <i className="bi bi-box-arrow-right me-1" />
                    Log out
                  </button>
                </form>
              ) : (
                <form action={logIn}>
                  <button type="submit" className="btn btn-light btn-sm" data-testid="nav-login">
                    <i className="bi bi-box-arrow-in-right me-1" />
                    Log in
                  </button>
                </form>
              )}
            </div>
          </Container>
        </Navbar>
        <Container>{children}</Container>
      </body>
    </html>
  );
}
