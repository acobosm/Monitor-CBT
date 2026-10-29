// Discovery (T3): which GraphQL Analytics datasets and fields the token can read per account and zone.
// Read-only. Usage, from web/: node scripts/discover.mjs <output.json>
// The token is read from .dev.vars and never printed. IP values are always redacted.
import { readFileSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

const ACCOUNTS = {
  COBTEC: "212a78d4cea6e1047658a98ba757cd2b",
  SOMA: "b74a9056b9ae179a543449713d41020d",
  BORAEI: "31767db4f7f58a6651b7a284e211be81",
};

const ZONES = {
  "somabwc.com": "e0fb73db5802715db5c839304a86c43e",
  "boraei.com": "a7f66e658dcc12ce1622705bd9661249",
  "mohamedboraei.com": "e0c79dafe8154cd45164ffa50501bf70",
};

const ACCOUNT_DATASETS = [
  "workersInvocationsAdaptive",
  "d1AnalyticsAdaptiveGroups",
  "d1StorageAdaptiveGroups",
  "r2OperationsAdaptiveGroups",
  "r2StorageAdaptiveGroups",
];

const ZONE_DATASETS = [
  "httpRequests1dGroups",
  "httpRequestsAdaptiveGroups",
  "firewallEventsAdaptive",
  "firewallEventsAdaptiveGroups",
];

const SETTINGS_FIELDS = "enabled availableFields maxDuration maxNumberOfFields maxPageSize notOlderThan";

function readToken() {
  const line = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .find((l) => l.startsWith("CLOUDFLARE_ANALYTICS_TOKEN="));
  const token = line?.slice("CLOUDFLARE_ANALYTICS_TOKEN=".length).trim();
  if (!token) throw new Error("CLOUDFLARE_ANALYTICS_TOKEN missing in .dev.vars");
  return token;
}

// Replaces the value of any key that holds an IP address.
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, /ip$/i.test(k) && typeof v === "string" ? (v ? "<redacted>" : "") : redact(v)]),
    );
  }
  return value;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({ errors: [{ message: `HTTP ${res.status}, non-JSON body` }] }));
  return { status: res.status, data: body.data ?? null, errors: (body.errors ?? []).map((e) => e.message) };
}

function days(seconds) {
  return typeof seconds === "number" ? Math.round((seconds / 86400) * 10) / 10 : null;
}

const token = readToken();
const out = process.argv[2];
if (!out) throw new Error("Usage: node scripts/discover.mjs <output.json>");

const now = new Date();
const today = now.toISOString().slice(0, 10);
const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
const range = { start: `${yesterday}T00:00:00Z`, end: `${today}T00:00:00Z` };

const report = { generatedAt: now.toISOString(), day: yesterday, schema: {}, accounts: {}, zones: {} };

// 1. Which datasets exist in the settings schema.
const intro = await gql(
  token,
  `{ a: __type(name: "AccountSettings") { fields { name } } z: __type(name: "ZoneSettings") { fields { name } } }`,
);
const accountSettingNames = intro.data?.a?.fields?.map((f) => f.name) ?? [];
const zoneSettingNames = intro.data?.z?.fields?.map((f) => f.name) ?? [];
report.schema = { errors: intro.errors, accountSettings: accountSettingNames, zoneSettings: zoneSettingNames };

const accountDatasets = accountSettingNames.length ? ACCOUNT_DATASETS.filter((d) => accountSettingNames.includes(d)) : ACCOUNT_DATASETS;
const zoneDatasets = zoneSettingNames.length ? ZONE_DATASETS.filter((d) => zoneSettingNames.includes(d)) : ZONE_DATASETS;

const accountReads = {
  workersInvocationsAdaptive: `sum { requests errors subrequests }`,
  d1AnalyticsAdaptiveGroups: `sum { readQueries writeQueries rowsRead rowsWritten }`,
  d1StorageAdaptiveGroups: `max { databaseSizeBytes } dimensions { databaseId }`,
  r2OperationsAdaptiveGroups: `sum { requests } dimensions { actionType }`,
  r2StorageAdaptiveGroups: `max { payloadSize metadataSize objectCount } dimensions { bucketName }`,
};

const zoneReads = {
  daily: `httpRequests1dGroups(limit: 1, filter: { date: $day }) { sum { requests bytes pageViews threats countryMap { clientCountryName requests } } uniq { uniques } }`,
  eyeball: `httpRequestsAdaptiveGroups(limit: 1, filter: { datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball" }) { count sum { visits edgeResponseBytes } }`,
  topIps: `httpRequestsAdaptiveGroups(limit: 20, filter: { datetime_geq: $start, datetime_lt: $end, requestSource: "eyeball" }, orderBy: [count_DESC]) { count dimensions { clientIP clientCountryName } }`,
  // firewallEventsAdaptiveGroups is disabled on Free; grouped requests carry the security action.
  security: `httpRequestsAdaptiveGroups(limit: 20, filter: { datetime_geq: $start, datetime_lt: $end, securityAction_in: ["block", "challenge", "managedChallenge", "jschallenge"] }, orderBy: [count_DESC]) { count dimensions { clientIP securityAction clientCountryName } }`,
};

// 2 and 3. Settings and a test read per account.
for (const [name, tag] of Object.entries(ACCOUNTS)) {
  const settings = await gql(
    token,
    `query ($tag: string!) { viewer { accounts(filter: { accountTag: $tag }) { settings { ${accountDatasets.map((d) => `${d} { ${SETTINGS_FIELDS} }`).join(" ")} } } } }`,
    { tag },
  );
  const reads = {};
  for (const [dataset, fields] of Object.entries(accountReads)) {
    const r = await gql(
      token,
      `query ($tag: string!, $day: Date!) { viewer { accounts(filter: { accountTag: $tag }) { ${dataset}(limit: 50, filter: { date_geq: $day, date_leq: $day }) { ${fields} } } } }`,
      { tag, day: yesterday },
    );
    reads[dataset] = { errors: r.errors, rows: r.data?.viewer?.accounts?.[0]?.[dataset] ?? null };
  }
  report.accounts[name] = { tag, settingsErrors: settings.errors, settings: settings.data?.viewer?.accounts?.[0]?.settings ?? null, reads };
}

// 2 and 3. Settings and test reads per zone.
for (const [name, tag] of Object.entries(ZONES)) {
  const settings = await gql(
    token,
    `query ($tag: string!) { viewer { zones(filter: { zoneTag: $tag }) { settings { ${zoneDatasets.map((d) => `${d} { ${SETTINGS_FIELDS} }`).join(" ")} } } } }`,
    { tag },
  );
  const reads = {};
  for (const [key, body] of Object.entries(zoneReads)) {
    const r = await gql(
      token,
      `query ($tag: string!, $day: Date!, $start: Time!, $end: Time!) { viewer { zones(filter: { zoneTag: $tag }) { ${body} } } }`,
      { tag, day: yesterday, ...range },
    );
    const zone = r.data?.viewer?.zones?.[0];
    reads[key] = { errors: r.errors, rows: zone ? Object.values(zone)[0] : null };
  }
  report.zones[name] = { tag, settingsErrors: settings.errors, settings: settings.data?.viewer?.zones?.[0]?.settings ?? null, reads };
}

const safe = redact(report);
writeFileSync(out, JSON.stringify(safe, null, 2));

// Short summary: availability, history and whether IPs exist (never their values).
console.log(`Day read: ${yesterday} (UTC). Full report: ${out}`);
console.log(`Schema: ${accountSettingNames.length} account datasets, ${zoneSettingNames.length} zone datasets${intro.errors.length ? `, errors: ${intro.errors.join("; ")}` : ""}`);
for (const [scope, entries] of [["Account", safe.accounts], ["Zone", safe.zones]]) {
  for (const [name, entry] of Object.entries(entries)) {
    console.log(`\n${scope} ${name}${entry.settingsErrors.length ? ` — settings errors: ${entry.settingsErrors.join("; ")}` : ""}`);
    for (const [dataset, s] of Object.entries(entry.settings ?? {})) {
      const ipField = (s.availableFields ?? []).some((f) => /clientIP/i.test(f));
      console.log(`  ${dataset}: enabled=${s.enabled} history=${days(s.notOlderThan)}d maxRange=${days(s.maxDuration)}d pageSize=${s.maxPageSize} fields=${(s.availableFields ?? []).length} clientIP=${ipField ? "yes" : "no"}`);
    }
    for (const [key, r] of Object.entries(entry.reads)) {
      const rows = Array.isArray(r.rows) ? r.rows : [];
      const ipRows = rows.filter((row) => row?.dimensions?.clientIP === "<redacted>").length;
      const status = r.errors.length ? `ERROR ${r.errors.join("; ")}` : `rows=${rows.length}${ipRows ? ` withIP=${ipRows}` : ""}`;
      console.log(`  read ${key}: ${status}`);
    }
  }
}
