import { Component, type ReactNode } from "react";

interface State { error: Error | null }

/** 兜底错误边界：避免任何运行时异常导致整页空白 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // 静默记录，不打断页面呈现
    void error;
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "#070b14", color: "#d7e6f5" }}>
          <div style={{ border: "1px solid #1e3557", background: "#0d1526", padding: "24px 28px", maxWidth: 560, textAlign: "center" }}>
            <div style={{ fontFamily: "Orbitron, monospace", color: "#ff2ed9", letterSpacing: 4, fontSize: 13 }}>◉ SYSTEM FAULT</div>
            <p style={{ fontSize: 13, lineHeight: 1.7, marginTop: 12, wordBreak: "break-all", color: "#7d93b3" }}>
              {String(this.state.error.message || this.state.error)}
            </p>
            <button
              onClick={() => {
                try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
                window.location.reload();
              }}
              style={{ marginTop: 16, padding: "8px 22px", border: "1px solid #00e5ff", color: "#00e5ff", background: "transparent", cursor: "pointer", fontSize: 13 }}
            >
              重置数据并刷新
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
