import { useApi, type AccountUsage, type UsageData, type UsageRow } from "../api";
import { Card } from "../components/Card";
import { DataTable, type Column } from "../components/DataTable";
import { InfoTip } from "../components/InfoTip";
import { LineChart } from "../components/LineChart";
import { Meter } from "../components/Meter";
import { Loaded } from "../components/Loaded";
import { Notice } from "../components/Notice";
import { StatusBadge } from "../components/StatusBadge";
import { formatBytes, formatMs, formatNumber, formatPercent, NO_VALUE, TEXT_NO_DATA } from "../format";

export { TEXT_NO_DATA };

const isBytes = (row: UsageRow) => row.metric.endsWith("_bytes");
/** Storage and counts keep their last stored value; a daily or monthly total without the live read is incomplete. */
const isStock = (row: UsageRow) => isBytes(row) || row.metric === "database_count";

/** Without the live read, a 0 or an incomplete sum must not look like real usage. */
export function hasValue(row: UsageRow, live: boolean): boolean {
  return live || (isStock(row) && row.usage > 0);
}

const amount = (row: UsageRow, value: number | null) => (isBytes(row) ? formatBytes(value) : formatNumber(value));

/** R24: the limit comes from config/limits.json through the API. */
export function workerRequestsInfo(limit: number | null): string {
  return `Veces que se ejecutó el Worker. Es la cifra que cuenta para el límite de ${formatNumber(limit)} al día.`;
}

/** R23: only "Peticiones de Worker" carries an (i) among the usage metrics. */
function metricInfo(row: UsageRow) {
  return row.product === "workers" && row.metric === "requests" ? <InfoTip text={workerRequestsInfo(row.limit)} /> : null;
}

function columns(live: boolean): Column<UsageRow>[] {
  return [
    { header: "Producto", render: (r) => r.productLabel },
    {
      header: "Métrica",
      render: (r) => (
        <>
          {r.label}
          {metricInfo(r)}
        </>
      ),
    },
    { header: "Uso", numeric: true, render: (r) => (hasValue(r, live) ? amount(r, r.usage) : NO_VALUE) },
    { header: "Límite", numeric: true, render: (r) => amount(r, r.limit) },
    {
      header: "% usado",
      numeric: true,
      render: (r) => (r.percent === null ? r.stateText : hasValue(r, live) ? formatPercent(r.percent) : NO_VALUE),
    },
    { header: "Período", render: (r) => r.periodLabel },
    {
      header: "Estado",
      render: (r) => (hasValue(r, live) ? <StatusBadge level={r.level} text={r.stateText} /> : <StatusBadge level="normal" text={TEXT_NO_DATA} />),
    },
    { header: "Pico 7 días", numeric: true, render: (r) => (r.peak7 === null ? NO_VALUE : amount(r, r.peak7)) },
    {
      header: "Notas",
      render: (r) => [r.note, hasValue(r, live) ? r.projection : null].filter(Boolean).join(" · ") || NO_VALUE,
    },
  ];
}

function AccountTable({ account }: { account: AccountUsage }) {
  return (
    <section>
      <DataTable caption={account.name} columns={columns(account.live)} rows={account.rows} rowKey={(r) => `${r.product}:${r.metric}`} />
      <p className="note">{account.limitsCheckedText}</p>
      {account.unclassifiedText ? <p className="note">{account.unclassifiedText}</p> : null}
    </section>
  );
}

/** R17–R21: one bar per metric with a limit; without a figure the bar stays empty. */
function AccountCard({ account }: { account: AccountUsage }) {
  return (
    <Card className="usage-card">
      <h2>{account.name}</h2>
      {account.rows
        .filter((r) => r.limit !== null)
        .map((r) => (
          <Meter
            key={`${r.product}:${r.metric}`}
            // D1 and R2 both have "Almacenamiento": the product tells them apart, as the table's first column does.
            label={`${r.productLabel} · ${r.label}`}
            info={metricInfo(r)}
            usage={amount(r, r.usage)}
            limit={amount(r, r.limit)}
            percent={hasValue(r, account.live) ? r.percent : null}
            level={r.level}
            stateText={r.stateText}
          />
        ))}
    </Card>
  );
}

const chartKey = (c: { product: string; metric: string }) => `${c.product}:${c.metric}`;

const chartFormat = (metric: string) => (value: number | null) => (metric.endsWith("_bytes") ? formatBytes(value) : formatNumber(value));

function ChartsByMetric({ accounts, options }: { accounts: AccountUsage[]; options: { key: string; label: string }[] }) {
  return (
    <div className="usage-cards">
      {options.map((o) => {
        const chart = accounts[0]!.charts.find((c) => chartKey(c) === o.key)!;
        const series = accounts.map((a) => ({ name: a.name, points: a.charts.find((c) => chartKey(c) === o.key)?.points ?? [] }));
        return (
          <Card key={o.key} className="chart-card">
            <h3>{o.label}</h3>
            <LineChart series={series} format={chartFormat(chart.metric)} limit={chart.limit} label={`${o.label} por cuenta, últimos 30 días`} />
          </Card>
        );
      })}
    </div>
  );
}

/** R28–R34: one chart per metric, with a line per account (owner's choice A, 2026-11-04). */
function UsageCharts({ accounts }: { accounts: AccountUsage[] }) {
  const options = (accounts[0]?.charts ?? []).map((c) => {
    const product = accounts[0]!.rows.find((r) => r.product === c.product)?.productLabel ?? c.product;
    return { key: chartKey(c), label: `${product} · ${c.label}` };
  });
  if (!options.length) return null;

  return (
    <section>
      <h2>Uso diario</h2>
      <ChartsByMetric accounts={accounts} options={options} />
    </section>
  );
}

export const TEXT_CPU_SECTION = "Workers · CPU";
export const TEXT_P50_TITLE = "Workers · CPU típica por petición, p50 (ms)";
export const TEXT_P99_TITLE = "Workers · CPU de las peticiones más pesadas, p99 (ms)";
export const TEXT_CUT_TITLE = "Workers · Peticiones cortadas por límite de recursos";
export const TEXT_CPU_LIMIT = "Límite por petición (Free)";
/** CPU time per request of Workers Free: a reference line, not a state (spec 004 P1). */
export const CPU_LIMIT_MS = 10;
export const TEXT_P50_INFO =
  "La mitad de las peticiones usa menos CPU que esta cifra: es la petición típica. Si se acerca a 10 ms, la mayoría de las visitas ya no cabe en Workers Free.";
export const TEXT_P99_INFO =
  "El 99 % de las peticiones usa menos CPU que esta cifra: muestra las más pesadas. Cloudflare tolera peticiones sueltas sobre 10 ms; la señal de peligro son las peticiones cortadas.";

/**
 * Spec 004 R10–R13: per account, three cards in a row: p50, p99 and requests cut, each with its own scale so the
 * p50 is not flattened by the p99. Only the p50 card carries the 10 ms line (owner's choice, 2026-11-27). Each script keeps one color in the three cards and the legend names it.
 */
function CpuCharts({ account }: { account: AccountUsage }) {
  const series = (pick: (s: AccountUsage["cpu"][number]) => AccountUsage["cpu"][number]["p50"]) =>
    account.cpu.map((s, i) => ({ name: s.label, points: pick(s), slot: i + 1 }));
  const chartLabel = (title: string) => `${title} de ${account.name}, últimos 30 días`;
  return (
    <section className="cpu-account">
      <h3>{account.name}</h3>
      <div className="usage-cards cpu-cards">
        <Card className="chart-card">
          <h4>
            {TEXT_P50_TITLE}
            <InfoTip text={TEXT_P50_INFO} />
          </h4>
          <LineChart series={series((s) => s.p50)} format={formatMs} limit={CPU_LIMIT_MS} limitLabel={TEXT_CPU_LIMIT} label={chartLabel(TEXT_P50_TITLE)} />
        </Card>
        <Card className="chart-card">
          <h4>
            {TEXT_P99_TITLE}
            <InfoTip text={TEXT_P99_INFO} />
          </h4>
          {/* No 10 ms line: Cloudflare tolerates single requests above it, so on the p99 it would only look alarming. */}
          <LineChart series={series((s) => s.p99)} format={formatMs} label={chartLabel(TEXT_P99_TITLE)} />
        </Card>
        <Card className="chart-card">
          <h4>{TEXT_CUT_TITLE}</h4>
          <LineChart series={series((s) => s.cut)} format={formatNumber} label={chartLabel(TEXT_CUT_TITLE)} />
        </Card>
      </div>
    </section>
  );
}

/** Only accounts with a Worker seen in the chart days; nothing while no CPU day is stored yet. */
function CpuSection({ accounts }: { accounts: AccountUsage[] }) {
  const withCpu = accounts.filter((a) => a.cpu.length);
  if (!withCpu.length) return null;
  return (
    <section>
      <h2>{TEXT_CPU_SECTION}</h2>
      {withCpu.map((account) => (
        <CpuCharts key={account.id} account={account} />
      ))}
    </section>
  );
}

export function UsageView({ data }: { data: UsageData }) {
  return (
    <>
      <h1>Consumo de planes</h1>
      {data.notice ? <Notice level="amber">{data.notice}</Notice> : null}
      <div className="usage-cards">
        {data.accounts.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
      <UsageCharts accounts={data.accounts} />
      <CpuSection accounts={data.accounts} />
      {/* R22: the full tables stay below the cards. */}
      {data.accounts.map((account) => (
        <AccountTable key={account.id} account={account} />
      ))}
    </>
  );
}

export function Usage() {
  return <Loaded state={useApi<UsageData>("/api/usage")}>{(data) => <UsageView data={data} />}</Loaded>;
}
