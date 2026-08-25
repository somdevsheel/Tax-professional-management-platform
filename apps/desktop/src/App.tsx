import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { Shell } from "./components/shell";
import { LoginPage } from "./pages/login";
import { ClientListPage } from "./pages/client-list";
import { ClientDetailPage } from "./pages/client-detail";

export function App() {
  const { status } = useAuth();

  if (status === "loading") {
    return <div className="login-shell muted">Loading…</div>;
  }

  if (status === "unauthenticated") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<ClientListPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
