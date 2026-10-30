import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import sitesJson from "../../config/sites.json";
import type { AccountUsage, SiteData, UsageData, UsageRow } from "../../ui/api";
import { App } from "../../ui/App";
import { Loaded, TEXT_API_FAILED } from "../../ui/components/Loaded";
import { FOOTER_TEXT, Layout, MENU_SITES } from "../../ui/components/Layout";
import { TEXT_TOKEN_UNVERIFIED, TokenNoticeView } from "../../ui/components/TokenNotice";
import { formatBytes, formatNumber, formatPercent } from "../../ui/format";
import { Home, MODULE_NAME } from "../../ui/pages/Home";
import { SiteView, TEXT_NO_DAYS } from "../../ui/pages/Site";
import { TEXT_NO_DATA, UsageView } from "../../ui/pages/Usage";
import { parseRoute } from "../../ui/route";

const html = renderToStaticMarkup;

const row: UsageRow = {
  product: "workers",
  productLabel: "Workers",
  metric: "requests",
  label: "Peticiones",
  period: "daily",
  periodLabel: "Diario",
  usage: 92000,
  limit: 100000,
  percent: 92,
  state: "critical",
  stateText: "Límite crítico",
  level: "red",
  peak7: 95000,
  note: "Se reinicia a las 19:00 ECT",
  projection: null,
};

const storage: UsageRow = {
  ...row,
  product: "d1",
  productLabel: "D1",
  metric: "storage_bytes",
  label: "Almacenamiento",
  period: "total",
  periodLabel: "Total",
  usage: 1_500_000,
  limit: 5_000_000_000,
  percent: 0,
  state: "ok",
  stateText: "Normal",
  level: "normal",
  peak7: null,
  note: null,
  projection: "Sin riesgo este mes",
};

const account: AccountUsage = {
  id: "cobtec",
  name: "COBTEC",
  live: true,
  rows: [row, storage],
  limitsCheckedText: "Límites verificados el 29 de octubre de 2026",
  unclassifiedText: null,
};

const usage = (a: Partial<AccountUsage> = {}, notice: string | null = null): UsageData => ({ accounts: [{ ...account, ...a }], notice });

const site: SiteData = {
  id: "soma",
  name: "SOMA",
  notice: null,
  traffic: {
    note: "Cada día va de 19:00 a 19:00 ECT.",
    rows: [
      { day: "2026-10-29", label: "Hoy (parcial)", partial: true, totals: { requests: 1561, visits: 105, pageViews: null, bytes: 6012356 } },
      { day: "2026-10-28", label: "28/10/2026", partial: false, totals: null },
    ],
  },
  pageViewsNotice: null,
  days: ["2026-10-27", "2026-10-28"],
  selectedDay: "2026-10-28",
  unavailableText: null,
  countries: [{ country: "EC", requests: 3000, percent: 75 }],
  topTrafficIps: [{ ip: "192.0.2.1", country: "EC", requests: 9, actionText: null, lastSeen: "10:00–11:00" }],
  topSecurityIps: [{ ip: "192.0.2.2", country: "US", requests: 4, actionText: "Bloqueada", lastSeen: "11:00–12:00" }],
};

const siteHtml = (data: Partial<SiteData> = {}) => html(<SiteView data={{ ...site, ...data }} onSelectDay={() => {}} />);
const token = (data: Partial<import("../../ui/api").TokenNoticeData>) =>
  html(<TokenNoticeView state={{ kind: "ok", data: { state: "valid", level: "normal", daysLeft: 60, text: "Token vence en 60 días", label: null, policyText: null, ...data } }} />);

describe("R36 home", () => {
  it("offers the single module, leading to the dashboard", () => {
    const out = html(<Home />);
    expect(out).toContain(`href="/consumo"`);
    expect(out).toContain(MODULE_NAME);
    expect(out.match(/<li>/g)).toHaveLength(1);
  });
});

describe("R37 menu", () => {
  it("has plan usage and one entry per site with a zone, the same as sites.json", () => {
    const out = html(<Layout route={{ page: "usage" }} notice={null}>x</Layout>);
    expect(out).toContain("Consumo de planes");
    expect(MENU_SITES.map((s) => s.id)).toEqual(sitesJson.sites.map((s) => s.id));
    for (const s of sitesJson.sites) expect(out).toContain(`href="/sitios/${s.id}">${s.name}<`);
  });

  it("marks the current page", () => {
    const out = html(<Layout route={{ page: "site", id: "soma" }} notice={null}>x</Layout>);
    expect(out).toContain(`href="/sitios/soma" aria-current="page"`);
  });
});

describe("R38 footer, on every page", () => {
  it("appears on home and in the dashboard", () => {
    expect(html(<Home />)).toContain(FOOTER_TEXT);
    expect(html(<Layout route={{ page: "usage" }} notice={null}>x</Layout>)).toContain("Powered by CBT · © 2026");
  });
});

describe("R39 es-EC numbers", () => {
  it("formats numbers, bytes and percentages", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatBytes(1_500_000)).toBe("1,5 MB");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(5_000_000_000)).toBe("5,0 GB");
    expect(formatPercent(92)).toBe("92,0 %");
  });
});

describe("R40 Salir", () => {
  it("links to the Access logout", () => {
    expect(html(<Layout route={{ page: "usage" }} notice={null}>x</Layout>)).toContain(`href="/cdn-cgi/access/logout"`);
  });
});

describe("routes", () => {
  it("reads the page from the path; anything else is home", () => {
    expect(parseRoute("/")).toEqual({ page: "home" });
    expect(parseRoute("/consumo")).toEqual({ page: "usage" });
    expect(parseRoute("/sitios/mohamed-boraei")).toEqual({ page: "site", id: "mohamed-boraei" });
    expect(parseRoute("/sitios/../x")).toEqual({ page: "home" });
  });

  it("exports the application root", () => {
    expect(typeof App).toBe("function");
  });
});

describe("R8–R13 token notice", () => {
  it("R8 shows the days", () => expect(token({})).toContain("Token vence en 60 días"));

  it("R9 amber with its word", () => {
    const out = token({ level: "amber", label: "Por vencer", text: "Token vence en 20 días" });
    expect(out).toContain("level-amber");
    expect(out).toContain("Por vencer");
  });

  it("R10 red with its word", () => {
    const out = token({ level: "red", label: "Renuévalo ya" });
    expect(out).toContain("level-red");
    expect(out).toContain("Renuévalo ya");
  });

  it("R13 shows the policy text in red", () => {
    expect(token({ policyText: "El token no cumple la regla de caducidad (máximo 1 año)." })).toContain("level-red");
  });

  it("R12 keeps a notice when the API fails", () => {
    expect(html(<TokenNoticeView state={{ kind: "error" }} />)).toContain(TEXT_TOKEN_UNVERIFIED);
  });
});

describe("R2 and API failures", () => {
  it("R2 shows the API's text when access is denied", () => {
    const out = html(<Loaded state={{ kind: "denied", message: "Tu correo no tiene acceso a este panel." }}>{() => "datos"}</Loaded>);
    expect(out).toContain("Tu correo no tiene acceso a este panel.");
    expect(out).not.toContain("datos");
  });

  it("explains a failed read", () => {
    expect(html(<Loaded state={{ kind: "error" }}>{() => "datos"}</Loaded>)).toContain(TEXT_API_FAILED);
  });
});

describe("R14–R20 usage", () => {
  it("R14 shows product, metric, usage, limit, %, period and state", () => {
    const out = html(<UsageView data={usage()} />);
    for (const text of ["COBTEC", "Workers", "Peticiones", "92.000", "100.000", "92,0 %", "Diario", "Límite crítico"]) expect(out).toContain(text);
  });

  it("R15 shows the date limits were checked", () => {
    expect(html(<UsageView data={usage()} />)).toContain("Límites verificados el 29 de octubre de 2026");
  });

  it("R16 shows the state with its color", () => {
    expect(html(<UsageView data={usage()} />)).toContain(`<span class="badge level-red">Límite crítico</span>`);
  });

  it("R17 shows the 7-day peak and the reset note", () => {
    const out = html(<UsageView data={usage()} />);
    expect(out).toContain("95.000");
    expect(out).toContain("Se reinicia a las 19:00 ECT");
  });

  it("R18 shows the projection, and storage in bytes", () => {
    const out = html(<UsageView data={usage()} />);
    expect(out).toContain("Sin riesgo este mes");
    expect(out).toContain("1,5 MB");
  });

  it("R19 shows the text instead of the percentage without a limit", () => {
    const noLimit = { ...row, limit: null, percent: null, state: "unconfigured", stateText: "Límite no configurado", level: "normal" as const };
    const out = html(<UsageView data={usage({ rows: [noLimit] })} />);
    expect(out).toContain("Límite no configurado");
    expect(out).not.toContain(" %");
  });

  it("R20 lists unclassified operations", () => {
    expect(html(<UsageView data={usage({ unclassifiedText: "Operaciones de R2 sin clasificar (contadas como Clase A): X" })} />)).toContain("sin clasificar");
  });

  it("R35 shows the notice and, without the live read, no usage that looks real", () => {
    const failed = { ...row, usage: 0, percent: 0, state: "ok", stateText: "Normal", level: "normal" as const };
    const out = html(<UsageView data={usage({ live: false, rows: [failed, storage] }, "No pudimos leer los datos recientes de Cloudflare.")} />);
    expect(out).toContain("No pudimos leer los datos recientes de Cloudflare.");
    expect(out).toContain(TEXT_NO_DATA);
    expect(out).toContain("1,5 MB"); // the last stored storage is still known
    expect(out).not.toContain("0,0 %</td><td>Diario");
  });
});

describe("R21–R27 site", () => {
  it("R21, R22, R23 shows the daily table with today labeled and the day note", () => {
    const out = siteHtml();
    for (const text of ["Cada día va de 19:00 a 19:00 ECT.", "Hoy (parcial)", "Peticiones al sitio", "Visitas", "Páginas vistas", "Bytes", "1.561", "6,0 MB"]) {
      expect(out).toContain(text);
    }
  });

  it("R21 shows a dash for days not stored", () => {
    expect(siteHtml()).toContain("28/10/2026</td><td class=\"numeric\">—");
  });

  it("R24 shows countries with % and offers the days of the history, newest first", () => {
    const out = siteHtml();
    expect(out).toContain("75,0 %");
    expect(out.indexOf("28/10/2026</option>")).toBeLessThan(out.indexOf("27/10/2026</option>"));
    expect(out).toContain(`<option value="2026-10-28" selected="">`);
  });

  it("R25 shows the top traffic IPs with their last hour", () => {
    const out = siteHtml();
    expect(out).toContain("192.0.2.1");
    expect(out).toContain("10:00–11:00");
  });

  it("R26 shows the top security IPs with their action", () => {
    const out = siteHtml();
    expect(out).toContain("192.0.2.2");
    expect(out).toContain("Bloqueada");
  });

  it("R27 shows the text instead of the tables", () => {
    const out = siteHtml({ unavailableText: "Cloudflare no entrega este dato en el plan gratuito." });
    expect(out).toContain("Cloudflare no entrega este dato en el plan gratuito.");
    expect(out).not.toContain("IPs con más tráfico");
  });

  it("explains that there are no stored days yet", () => {
    const out = siteHtml({ selectedDay: null, days: [] });
    expect(out).toContain(TEXT_NO_DAYS);
    expect(out).not.toContain("<select");
  });

  it("R35 shows the notice over the history", () => {
    expect(siteHtml({ notice: "No pudimos leer los datos recientes de Cloudflare." })).toContain("No pudimos leer");
  });
});
