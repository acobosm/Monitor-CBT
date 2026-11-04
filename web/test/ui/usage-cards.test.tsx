import { renderToStaticMarkup as html } from "react-dom/server";
import { describe, expect, it } from "vitest";
import limitsJson from "../../config/limits.json";
import type { AccountUsage, SiteData, UsageRow } from "../../ui/api";
import { meterWidth } from "../../ui/components/Meter";
import { SiteView, TEXT_SITE_REQUESTS_INFO } from "../../ui/pages/Site";
import { UsageView, workerRequestsInfo } from "../../ui/pages/Usage";

const workerLimit = limitsJson.metrics.find((m) => m.product === "workers" && m.metric === "requests")!.limit;

const requests: UsageRow = {
  product: "workers",
  productLabel: "Workers",
  metric: "requests",
  label: "Peticiones de Worker",
  period: "daily",
  periodLabel: "Diario",
  usage: 92000,
  limit: workerLimit,
  percent: 92,
  state: "critical",
  stateText: "Límite crítico",
  level: "red",
  peak7: 95000,
  note: null,
  projection: null,
};

const rowsRead: UsageRow = {
  ...requests,
  product: "d1",
  productLabel: "D1",
  metric: "rows_read",
  label: "Filas leídas",
  usage: 6_000_000,
  limit: 5_000_000,
  percent: 120,
  state: "exceeded",
  stateText: "Límite superado",
};

const storage: UsageRow = {
  ...requests,
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
};

const noLimit: UsageRow = { ...storage, metric: "other", label: "Sin límite fijo", limit: null, percent: null, stateText: "Sin límite" };

const account = (change: Partial<AccountUsage> = {}): AccountUsage => ({
  id: "cobtec",
  name: "COBTEC",
  live: true,
  rows: [requests, rowsRead, storage, noLimit],
  limitsCheckedText: "Límites verificados",
  unclassifiedText: null,
  ...change,
});

const usage = (accounts: AccountUsage[] = [account()]) => html(<UsageView data={{ accounts, notice: null }} />);
const cardsOf = (out: string) => out.slice(out.indexOf(`class="usage-cards"`), out.indexOf("<table"));

describe("R17 usage cards", () => {
  it("has one card per account above the tables, with one bar per metric that has a limit", () => {
    const out = usage([account(), account({ id: "soma", name: "SOMA" })]);
    expect(out.indexOf(`class="usage-cards"`)).toBeLessThan(out.indexOf("<table"));
    expect(out.match(/class="card usage-card"/g)).toHaveLength(2);
    expect(cardsOf(out).match(/class="meter"/g)).toHaveLength(6);
    expect(cardsOf(out)).not.toContain("Sin límite fijo");
  });
});

describe("R18 R19 bars", () => {
  it("show name, usage, limit, percentage and the state in words", () => {
    const cards = cardsOf(usage());
    expect(cards).toContain("Peticiones de Worker");
    expect(cards).toContain("92.000 de 100.000 · 92,0 %");
    expect(cards).toContain(`<span class="badge level-red">Límite crítico</span>`);
    expect(cards).toContain(`<span class="badge level-normal">Normal</span>`);
  });
});

describe("R20 over the limit", () => {
  it("fills the bar to 100 % and keeps the real percentage in the text", () => {
    expect(meterWidth(120)).toBe(100);
    expect(meterWidth(92)).toBe(92);
    const cards = cardsOf(usage());
    expect(cards).toContain("6.000.000 de 5.000.000 · 120,0 %");
    expect(cards).toContain("Límite superado");
    expect(cards).toContain(`style="width:100%"`);
  });
});

describe("R21 missing figure", () => {
  it("shows Sin dato and an empty bar when the live read failed", () => {
    const cards = cardsOf(usage([account({ live: false, rows: [requests] })]));
    expect(cards).toContain("Sin dato");
    expect(cards).toContain(`style="width:0%"`);
    expect(cards).not.toContain("92.000");
    expect(meterWidth(null)).toBe(0);
  });
});

describe("R22 tables stay", () => {
  it("keeps the full table of each account below the cards, with every column", () => {
    const out = usage();
    for (const header of ["Producto", "Métrica", "Uso", "Límite", "% usado", "Período", "Estado", "Pico 7 días", "Notas"]) {
      expect(out).toContain(`>${header}</th>`);
    }
    expect(out).toContain("Sin límite fijo");
  });
});

describe("R23 R24 (i) of Peticiones de Worker", () => {
  it("says what counts for the limit, with the limit of limits.json", () => {
    expect(workerRequestsInfo(workerLimit)).toBe("Veces que se ejecutó el Worker. Es la cifra que cuenta para el límite de 100.000 al día.");
  });

  it("is next to the bar and next to the table's metric, and nowhere else", () => {
    const out = usage();
    const tip = `role="tooltip">${workerRequestsInfo(workerLimit)}<`;
    expect(cardsOf(out).split(tip)).toHaveLength(2);
    expect(out.split(tip)).toHaveLength(3);
    expect(out.match(/role="tooltip"/g)).toHaveLength(2);
  });
});

const site: SiteData = {
  id: "soma",
  name: "SOMA",
  notice: null,
  traffic: { note: "", rows: [{ day: "2026-11-03", label: "03/11/2026", partial: false, totals: { requests: 10, visits: 2, pageViews: null, bytes: 100 } }] },
  pageViewsNotice: null,
  days: ["2026-11-03"],
  selectedDay: "2026-11-03",
  unavailableText: null,
  countries: [{ country: "EC", requests: 10, percent: 100 }],
  topTrafficIps: [{ ip: "192.0.2.1", country: "EC", requests: 9, actionText: null, lastSeen: null }],
  topSecurityIps: [{ ip: "192.0.2.2", country: "US", requests: 4, actionText: "Bloqueada", lastSeen: null }],
};

describe("R23 R25 (i) of Peticiones al sitio", () => {
  it("is next to the column in the daily traffic, countries and top traffic IPs tables", () => {
    const out = html(<SiteView data={site} onSelectDay={() => {}} />);
    expect(TEXT_SITE_REQUESTS_INFO).toBe("Todas las peticiones de visitantes al sitio. No cuenta para el límite de Workers.");
    expect(out.match(new RegExp(`Peticiones al sitio<span class="info-tip">.*?role="tooltip">${TEXT_SITE_REQUESTS_INFO}<`, "g"))).toHaveLength(3);
  });
});
