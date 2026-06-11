import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setBaseUrl } from "@workspace/api-client-react";
import { setApiBaseUrl } from "@workspace/auth-web";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:8080" : null);

setBaseUrl(apiBaseUrl);
setApiBaseUrl(apiBaseUrl);

createRoot(document.getElementById("root")!).render(<App />);
