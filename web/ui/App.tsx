import { Layout } from "./components/Layout";
import { TokenNotice } from "./components/TokenNotice";
import { Home } from "./pages/Home";
import { Panel } from "./pages/Panel";
import { Site } from "./pages/Site";
import { Usage } from "./pages/Usage";
import { useRoute } from "./route";

export function App() {
  const route = useRoute();
  if (route.page === "home") return <Home />;
  return (
    <Layout route={route} notice={<TokenNotice />}>
      {route.page === "panel" ? <Panel /> : route.page === "usage" ? <Usage /> : <Site id={route.id} />}
    </Layout>
  );
}
