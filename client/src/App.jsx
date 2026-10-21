import { Component, Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";

const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const Login = lazy(() => import("./pages/Login"));
const Profile = lazy(() => import("./pages/Profile"));
const Register = lazy(() => import("./pages/Register"));
const Statements = lazy(() => import("./pages/Statements"));
const Support = lazy(() => import("./pages/Support"));
const Withdrawals = lazy(() => import("./pages/Withdrawals"));

class PageErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-white p-8 text-center" role="alert">
          <h1 className="text-lg font-semibold text-slate-900">This page could not be loaded</h1>
          <p className="mt-2 text-sm text-slate-600">{this.state.error.message}</p>
          <button className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white" onClick={() => window.location.reload()} type="button">
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PageLoading() {
  return <p aria-live="polite" className="py-12 text-center text-sm text-slate-500">Loading workspace...</p>;
}

function Workspace() {
  const { isAuthenticated, user } = useAuth();
  return (
    <div className="mx-auto flex min-h-[calc(100vh-65px)] max-w-[1600px]">
      {isAuthenticated && <Sidebar role={user?.role} />}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageErrorBoundary>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/support" element={<Support />} />
                <Route path="/profile" element={<Profile />} />
                <Route element={<RoleRoute roles={["consultant"]} />}>
                  <Route path="/withdrawals" element={<Withdrawals />} />
                  <Route path="/statements" element={<Statements />} />
                </Route>
                <Route element={<RoleRoute roles={["admin"]} />}>
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/audit-logs" element={<AuditLogs />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </PageErrorBoundary>
      </main>
    </div>
  );
}

function AppLayout() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen bg-slate-50">
          <Navbar />
          <Workspace />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default AppLayout;
