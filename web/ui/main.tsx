import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyRememberedTheme } from "./theme";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Before the first paint, so a remembered theme does not flash the other one.
applyRememberedTheme();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
