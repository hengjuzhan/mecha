import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/widgets/ErrorBoundary";
import { initCloud } from "./lib/cloud";
import { getSettings } from "./lib/dataService";

// 注入数据库配置提供器：每次 RPC 调用时动态读取，保存新连接后立即生效
initCloud(() => getSettings().supabase);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
