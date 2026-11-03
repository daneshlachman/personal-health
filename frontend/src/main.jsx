import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { startThemeWatcher } from "./utils/theme";
import { installApiKeyFetch } from "./utils/api";

startThemeWatcher();
installApiKeyFetch();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
