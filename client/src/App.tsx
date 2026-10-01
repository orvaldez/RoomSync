import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthProvider";
import { RequireAuth } from "./auth/RequireAuth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { JoinPage } from "./pages/JoinPage";
import { AddExpensePage } from "./pages/AddExpensePage";
import { ChoresPage } from "./pages/ChoresPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <AppShell>
                  <DashboardPage />
                </AppShell>
              </RequireAuth>
            }
          />

          {/* Invitation links (UC-04). RequireAuth sends a signed-out
              visitor to log in or register and back here afterwards. */}
          <Route
            path="/join/:token"
            element={
              <RequireAuth>
                <AppShell>
                  <JoinPage />
                </AppShell>
              </RequireAuth>
            }
          />

          <Route
            path="/expenses/new"
            element={
              <RequireAuth>
                <AppShell>
                  <AddExpensePage />
                </AppShell>
              </RequireAuth>
            }
          />

          <Route
            path="/chores"
            element={
              <RequireAuth>
                <AppShell>
                  <ChoresPage />
                </AppShell>
              </RequireAuth>
            }
          />

          {/* Unknown paths go to the dashboard, which sends anonymous
              visitors on to login via RequireAuth. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
