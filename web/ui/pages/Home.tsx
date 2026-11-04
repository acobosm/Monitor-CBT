import logoInverse from "../assets/cbt_logo_inverse.svg";
import { Footer } from "../components/Layout";
import { NodeNetwork } from "../components/NodeNetwork";
import { navigate } from "../route";

export const MODULE_NAME = "Cloudflare - Consumo y Tráfico";
export const LANDING_TITLE = "Consumo de tus planes y visitas de tus clientes, en un solo panel";
export const LANDING_TEXT = "Mira cuánto usas de cada plan gratuito, cuántas visitas recibe cada cliente y desde qué países llegan.";

/** R8–R11: dark landing, in either theme, with the module selector (a single option). */
export function Home() {
  return (
    <div className="landing">
      <NodeNetwork />
      <main>
        <img className="landing-logo" src={logoInverse} alt="CBT" />
        <h1>{LANDING_TITLE}</h1>
        <p>{LANDING_TEXT}</p>
        <ul className="modules">
          <li>
            <a className="button cta" href="/panel" onClick={navigate}>
              {MODULE_NAME}
            </a>
          </li>
        </ul>
      </main>
      <Footer />
    </div>
  );
}
