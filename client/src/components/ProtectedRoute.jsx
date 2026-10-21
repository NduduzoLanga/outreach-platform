import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return <p className="p-8 text-center text-slate-500">Loading your account...</p>;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}
