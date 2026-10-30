import { Footer } from "../components/Layout";
import { navigate } from "../route";

export const MODULE_NAME = "Cloudflare - Consumo y Tráfico";

/** R36: module selector with a single option. */
export function Home() {
  return (
    <>
      <main>
        <h1>Monitor CBT</h1>
        <ul className="modules">
          <li>
            <a href="/consumo" onClick={navigate}>
              {MODULE_NAME}
            </a>
          </li>
        </ul>
      </main>
      <Footer />
    </>
  );
}
