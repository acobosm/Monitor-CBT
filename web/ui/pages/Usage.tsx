import { useApi, type AccountUsage, type UsageData, type UsageRow } from "../api";
import { DataTable, type Column } from "../components/DataTable";
import { Loaded } from "../components/Loaded";
import { Notice } from "../components/Notice";
import { StatusBadge } from "../components/StatusBadge";
import { formatBytes, formatNumber, formatPercent, NO_VALUE } from "../format";

export const TEXT_NO_DATA = "Sin dato";

const isBytes = (row: UsageRow) => row.metric.endsWith("_bytes");
/** Storage and counts keep their last stored value; a daily or monthly total without the live read is incomplete. */
const isStock = (row: UsageRow) => isBytes(row) || row.metric === "database_count";

/** Without the live read, a 0 or an incomplete sum must not look like real usage. */
export function hasValue(row: UsageRow, live: boolean): boolean {
  return live || (isStock(row) && row.usage > 0);
}

function columns(live: boolean): Column<UsageRow>[] {
  const amount = (row: UsageRow, value: number | null) => (isBytes(row) ? formatBytes(value) : formatNumber(value));
  return [
    { header: "Producto", render: (r) => r.productLabel },
    { header: "Métrica", render: (r) => r.label },
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

export function UsageView({ data }: { data: UsageData }) {
  return (
    <>
      <h1>Consumo de planes</h1>
      {data.notice ? <Notice level="amber">{data.notice}</Notice> : null}
      {data.accounts.map((account) => (
        <AccountTable key={account.id} account={account} />
      ))}
    </>
  );
}

export function Usage() {
  return <Loaded state={useApi<UsageData>("/api/usage")}>{(data) => <UsageView data={data} />}</Loaded>;
}
