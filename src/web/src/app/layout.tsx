import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import Container from "react-bootstrap/Container";
import Navbar from "react-bootstrap/Navbar";
import NavbarBrand from "react-bootstrap/NavbarBrand";
import NavbarCollapse from "react-bootstrap/NavbarCollapse";
import NavbarToggle from "react-bootstrap/NavbarToggle";
import "bootstrap-icons/font/bootstrap-icons.min.css";
import { currentUser, isAdmin } from "@/lib/session";
import { findTheme, MODE_COOKIE, resolveMode, THEME_COOKIE, themeHref, THEME_LINK_ID } from "@/themes";
import { logIn, logOut } from "./actions";
import { ThemeScript } from "./ThemeScript";
import { ThemeSwitch } from "./ThemeSwitch";

export const metadata: Metadata = {
  title: "SPUN",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const admin = user ? await isAdmin(user.id) : false;
  const jar = await cookies();
  const theme = findTheme(jar.get(THEME_COOKIE)?.value);
  const mode = resolveMode(theme, jar.get(MODE_COOKIE)?.value);
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      data-theme={theme.id}
      data-bs-theme={mode === "auto" ? "light" : mode}
      suppressHydrationWarning
    >
      <head>
        <link rel="stylesheet" id={THEME_LINK_ID} href={themeHref(theme.id)} />
        <ThemeScript />
      </head>
      <body>
        <Navbar data-testid="navbar" bg="primary" data-bs-theme="dark" expand="xl" className="mb-4">
          <Container>
            <NavbarBrand href="/" data-testid="nav-brand">
              <i className="bi bi-box-seam me-2" />
              SPUN
            </NavbarBrand>
            <NavbarToggle aria-controls="nav-menu" data-testid="nav-toggle" />
            <NavbarCollapse id="nav-menu">
              <div className="d-flex flex-column flex-xl-row align-items-start align-items-xl-center gap-3 w-100 py-3 py-xl-0">
                <Link href="/catalogue" className="nav-link text-light text-nowrap me-xl-auto" data-testid="nav-catalogue">
                  <i className="bi bi-grid me-1" />
                  Catalogue
                </Link>
                {admin && (
                  <Link href="/admin" className="nav-link text-light text-nowrap" data-testid="nav-admin">
                    <i className="bi bi-gear me-1" />
                    Admin
                  </Link>
                )}
                {user?.username && (
                  <Link href="/me" className="nav-link text-light text-nowrap" data-testid="nav-username">
                    {user.username}
                  </Link>
                )}
                <ThemeSwitch />
                {user && (
                  <Link href="/publish" className="btn btn-light btn-sm text-nowrap" data-testid="nav-publish">
                    <i className="bi bi-upload me-1" />
                    Publishers
                  </Link>
                )}
                {user ? (
                  <form action={logOut} suppressHydrationWarning>
                    <button type="submit" className="btn btn-outline-light btn-sm text-nowrap" data-testid="nav-logout">
                      <i className="bi bi-box-arrow-right me-1" />
                      Log out
                    </button>
                  </form>
                ) : (
                  <form action={logIn} suppressHydrationWarning>
                    <button type="submit" className="btn btn-light btn-sm text-nowrap" data-testid="nav-login">
                      <i className="bi bi-box-arrow-in-right me-1" />
                      Log in
                    </button>
                  </form>
                )}
              </div>
            </NavbarCollapse>
          </Container>
        </Navbar>
        <Container>{children}</Container>
      </body>
    </html>
  );
}
