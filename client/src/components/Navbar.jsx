import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
        <Link className="font-bold text-slate-900" to="/">Outreach</Link>
        <div className="flex items-center gap-5 text-sm text-slate-600">
          {isAuthenticated ? (
            <>
              <span className="hidden text-slate-400 sm:inline">{user?.name} · {user?.role}</span>
              <Link to={user?.role === "admin" ? "/admin" : "/dashboard"}>Dashboard</Link>
              <button onClick={logout} type="button">Sign out</button>
            </>
          ) : (
            <>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Create account</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
