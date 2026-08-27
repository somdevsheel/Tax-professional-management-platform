import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth-context";
import { Shell } from "./components/shell";
import { LoginPage } from "./pages/login";
import { RegisterPage } from "./pages/register";
import { DashboardPage } from "./pages/dashboard";
import { ClientListPage } from "./pages/client-list";
import { ClientNewPage } from "./pages/client-new";
import { ClientDetailPage } from "./pages/client-detail";
import { PortalsPage } from "./pages/portals";
import { EmployeesPage } from "./pages/employees";
import { ActivityPage } from "./pages/activity";
import { SettingsPage } from "./pages/settings";
import { TasksPage } from "./pages/tasks";
import { TaskDetailPage } from "./pages/task-detail";
import { CompliancePage } from "./pages/compliance";
import { DocumentsPage } from "./pages/documents";
import { ReportsPage } from "./pages/reports";

export function App() {
  const { status } = useAuth();

  if (status === "loading") {
    return <div className="login-shell muted">Loading…</div>;
  }

  if (status === "unauthenticated") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/clients" element={<ClientListPage />} />
        <Route path="/clients/new" element={<ClientNewPage />} />
        <Route path="/clients/:id" element={<ClientDetailPage />} />
        <Route path="/portals" element={<PortalsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailPage />} />
        <Route path="/compliance" element={<CompliancePage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Shell>
  );
}
