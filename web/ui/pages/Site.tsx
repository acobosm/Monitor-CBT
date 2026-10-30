import { useEffect, useState } from "react";
import { useApi, type IpRow, type SiteData } from "../api";
import { DataTable, type Column } from "../components/DataTable";
import { Loaded } from "../components/Loaded";
import { Notice } from "../components/Notice";
import { formatBytes, formatDay, formatNumber, formatPercent, NO_VALUE } from "../format";

export const TEXT_NO_DAYS = "Aún no hay días guardados.";

type TrafficRow = SiteData["traffic"]["rows"][number];

const trafficColumns: Column<TrafficRow>[] = [
  { header: "Día", render: (r) => r.label },
  { header: "Peticiones al sitio", numeric: true, render: (r) => formatNumber(r.totals?.requests) },
  { header: "Visitas", numeric: true, render: (r) => formatNumber(r.totals?.visits) },
  { header: "Páginas vistas", numeric: true, render: (r) => formatNumber(r.totals?.pageViews) },
  { header: "Bytes", numeric: true, render: (r) => formatBytes(r.totals?.bytes) },
];

const countryColumns: Column<SiteData["countries"][number]>[] = [
  { header: "País", render: (r) => r.country },
  { header: "Peticiones al sitio", numeric: true, render: (r) => formatNumber(r.requests) },
  { header: "% del total", numeric: true, render: (r) => formatPercent(r.percent) },
];

const ipColumn: Column<IpRow> = { header: "IP", render: (r) => <span className="mono">{r.ip}</span> };
const countryColumn: Column<IpRow> = { header: "País", render: (r) => r.country ?? NO_VALUE };
const lastSeenColumn: Column<IpRow> = { header: "Última hora (ECT)", render: (r) => r.lastSeen ?? NO_VALUE };

const trafficIpColumns: Column<IpRow>[] = [
  ipColumn,
  countryColumn,
  { header: "Peticiones al sitio", numeric: true, render: (r) => formatNumber(r.requests) },
  lastSeenColumn,
];

const securityIpColumns: Column<IpRow>[] = [
  ipColumn,
  countryColumn,
  { header: "Eventos", numeric: true, render: (r) => formatNumber(r.requests) },
  { header: "Acción", render: (r) => r.actionText ?? NO_VALUE },
  lastSeenColumn,
];

function DaySelector({ days, selected, onSelect }: { days: string[]; selected: string; onSelect: (day: string) => void }) {
  return (
    <label className="day-selector">
      Día:{" "}
      <select value={selected} onChange={(event) => onSelect(event.target.value)}>
        {[...days].reverse().map((day) => (
          <option key={day} value={day}>
            {formatDay(day)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SiteView({ data, onSelectDay }: { data: SiteData; onSelectDay: (day: string) => void }) {
  return (
    <>
      <h1>{data.name}</h1>
      {data.notice ? <Notice level="amber">{data.notice}</Notice> : null}
      <p className="note">{data.traffic.note}</p>
      <DataTable caption="Tráfico diario" columns={trafficColumns} rows={data.traffic.rows} rowKey={(r) => r.day} />
      {data.pageViewsNotice ? <p className="note">Páginas vistas: {data.pageViewsNotice}</p> : null}

      {data.unavailableText ? (
        <Notice level="normal">{data.unavailableText}</Notice>
      ) : data.selectedDay ? (
        <>
          <DaySelector days={data.days} selected={data.selectedDay} onSelect={onSelectDay} />
          <DataTable caption="Países" columns={countryColumns} rows={data.countries} rowKey={(r) => r.country} />
          <DataTable caption="IPs con más tráfico" columns={trafficIpColumns} rows={data.topTrafficIps} rowKey={(r) => r.ip} />
          <DataTable caption="IPs con más eventos de seguridad" columns={securityIpColumns} rows={data.topSecurityIps} rowKey={(r) => r.ip} />
        </>
      ) : (
        <p>{TEXT_NO_DAYS}</p>
      )}
    </>
  );
}

export function Site({ id }: { id: string }) {
  const [day, setDay] = useState<string | null>(null);
  // Each site starts on its own default day (R24).
  useEffect(() => setDay(null), [id]);
  const path = `/api/sites/${encodeURIComponent(id)}${day ? `?day=${day}` : ""}`;
  return <Loaded state={useApi<SiteData>(path)}>{(data) => <SiteView data={data} onSelectDay={setDay} />}</Loaded>;
}
