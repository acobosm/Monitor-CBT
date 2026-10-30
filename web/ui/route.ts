// Navigation with the browser's History API: pages are few and fixed, so no router dependency.
import { useEffect, useState, type MouseEvent } from "react";

export type Route = { page: "home" } | { page: "usage" } | { page: "site"; id: string };

export function parseRoute(pathname: string): Route {
  if (pathname === "/consumo") return { page: "usage" };
  const site = /^\/sitios\/([a-z0-9-]+)$/.exec(pathname);
  return site?.[1] ? { page: "site", id: site[1] } : { page: "home" };
}

export function useRoute(): Route {
  const [pathname, setPathname] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return parseRoute(pathname);
}

/** For internal links: changes the page without reloading; modified clicks keep the browser's behavior. */
export function navigate(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  event.preventDefault();
  window.history.pushState(null, "", event.currentTarget.getAttribute("href"));
  window.dispatchEvent(new PopStateEvent("popstate"));
}
