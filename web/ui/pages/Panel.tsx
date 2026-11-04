import { useApi, type PanelCard, type PanelData } from "../api";
import { Card } from "../components/Card";
import { InfoTip } from "../components/InfoTip";
import { Loaded } from "../components/Loaded";
import { Notice } from "../components/Notice";
import { Sparkline } from "../components/Sparkline";
import { StatusBadge } from "../components/StatusBadge";
import { formatNumber } from "../format";
import { navigate } from "../route";
import { TEXT_NO_DATA } from "./Usage";

export const PANEL_TITLE = "Panel general";
export const TEXT_NEAR_LIMIT = "Cerca del límite";
export const TEXT_DETAIL = "Ver detalle";

/** R16: a missing figure says so instead of showing a 0 that looks real. */
const figure = (value: number | null) => (value === null ? TEXT_NO_DATA : formatNumber(value));

/** Yesterday against the site's daily average (R14). */
export function comparisonText(changePercent: number | null): string {
  if (changePercent === null) return TEXT_NO_DATA;
  if (changePercent === 0) return "Igual a su promedio diario";
  const amount = `${formatNumber(Math.abs(changePercent))} %`;
  return changePercent > 0 ? `▲ ${amount} sobre su promedio diario` : `▼ ${amount} bajo su promedio diario`;
}

export const TEXT_VISITS_SUM = "Suma de las visitas de ayer de todos los sitios mostrados en el Panel general.";
export const TEXT_TOTAL_30 = "Visitas de los últimos 30 días, incluido lo que va de hoy.";

function Stat({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <Card className="stat">
      <span className="stat-label">
        {label}
        {info ? <InfoTip text={info} /> : null}
      </span>
      <span className="stat-value">{value}</span>
    </Card>
  );
}

function SiteCard({ card }: { card: PanelCard }) {
  return (
    <Card className="site-card">
      <header>
        <div>
          <h2>{card.name}</h2>
          <p className="note">{card.domain}</p>
        </div>
        {/* R15: sites sharing an account each carry the word. */}
        {card.nearLimit ? <StatusBadge level="amber" text={TEXT_NEAR_LIMIT} /> : null}
      </header>
      <dl>
        <div>
          <dt>Visitas ayer</dt>
          <dd className="figure">{figure(card.summary.yesterday)}</dd>
          <dd className="note">{comparisonText(card.summary.changePercent)}</dd>
        </div>
        <div>
          <dt>
            Total 30 días
            <InfoTip text={TEXT_TOTAL_30} />
          </dt>
          <dd className="figure">{figure(card.summary.total)}</dd>
        </div>
      </dl>
      <Sparkline points={card.visits} label={`Visitas diarias de ${card.name}, últimos 30 días`} />
      <a className="button" href={`/sitios/${card.id}`} onClick={navigate}>
        {TEXT_DETAIL}
      </a>
    </Card>
  );
}

export function PanelView({ data }: { data: PanelData }) {
  return (
    <>
      <h1>{PANEL_TITLE}</h1>
      {data.notice ? <Notice level="amber">{data.notice}</Notice> : null}
      {/* R13: "yesterday" is the last complete day, 19:00 to 19:00 ECT. */}
      <div className="stats">
        <Stat label="Visitas ayer" value={figure(data.summary.visitsYesterday)} info={TEXT_VISITS_SUM} />
        <Stat label="Sitios" value={formatNumber(data.summary.sites)} />
        <Stat label="Con recursos cerca del límite" value={formatNumber(data.summary.nearLimit)} />
      </div>
      <div className="site-cards">
        {data.cards.map((card) => (
          <SiteCard key={card.id} card={card} />
        ))}
      </div>
    </>
  );
}

export function Panel() {
  return <Loaded state={useApi<PanelData>("/api/panel")}>{(data) => <PanelView data={data} />}</Loaded>;
}
