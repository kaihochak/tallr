import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { notificationService } from "./services/notificationService";

// Initialize notification service on app start
notificationService.initialize().catch(console.error);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
