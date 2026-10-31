import type { ReactNode } from "react";
import logoInverse from "../assets/cbt_logo_inverse.svg";
import logo from "../assets/cbt_logo.svg";
import { navigate, type Route } from "../route";
import { PageCircuit, SideCircuit } from "./Circuit";
import { ThemeButton } from "./ThemeButton";

export const FOOTER_TEXT = "Powered by CBT · © 2026";

/** Menu entries (R37). Only ids and names: account and zone IDs stay in the Worker. */
export const MENU_SITES = [
  { id: "soma", name: "SOMA" },
  { id: "boraei", name: "BORAEI" },
  { id: "mohamed-boraei", name: "MOHAMED-BORAEI" },
] as const;

export function Footer() {
  return <footer>{FOOTER_TEXT}</footer>;
}

function MenuLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <a href={href} onClick={navigate} aria-current={current ? "page" : undefined}>
      {children}
    </a>
  );
}

export function Layout({ route, notice, children }: { route: Route; notice: ReactNode; children: ReactNode }) {
  return (
    <div className="app">
      <PageCircuit />
      <aside className="side">
        <SideCircuit />
        {/* R1: the CSS shows the version that matches the theme. */}
        <img className="logo-light" src={logo} alt="CBT" />
        <img className="logo-dark" src={logoInverse} alt="CBT" />
        <nav aria-label="Menú">
          <MenuLink href="/consumo" current={route.page === "usage"}>
            Consumo de planes
          </MenuLink>
          {MENU_SITES.map((site) => (
            <MenuLink key={site.id} href={`/sitios/${site.id}`} current={route.page === "site" && route.id === site.id}>
              {site.name}
            </MenuLink>
          ))}
        </nav>
        <div className="side-actions">
          <ThemeButton />
          {/* R40: ends the Access session; it only exists behind Access, so it is checked in production. */}
          <a className="button" href="/cdn-cgi/access/logout">
            Salir
          </a>
        </div>
      </aside>
      <div className="content">
        <main>
          {notice}
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
