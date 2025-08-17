import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Request notification permission on app start
if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
