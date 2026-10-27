import AccountGate from "./account/AccountGate";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/vazirmatn";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccountGate>
      <App />
    </AccountGate>
  </React.StrictMode>,
);
