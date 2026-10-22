import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-institute-forest/15 bg-white/95 shadow-[0_2px_12px_rgba(6,60,43,0.04)] backdrop-blur">
      <nav className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
        <Link className="font-bold tracking-tight text-institute-deep" to="/">
          <span className="text-institute-forest">MyAPI</span> <span className="text-institute-gold">Business</span>
        </Link>
        <div className="flex items-center gap-5 text-sm text-slate-600">
          {isAuthenticated ? (
            <>
              <span className="hidden text-slate-400 sm:inline">{user?.name} · {user?.role}</span>
              <NavLink
                className={({ isActive }) => `rounded-md px-3 py-2 font-medium transition ${isActive ? "bg-institute-gold-light text-institute-deep ring-1 ring-institute-gold/60" : "text-institute-forest hover:bg-institute-paper hover:text-institute-deep"}`}
                end
                to={user?.role === "admin" ? "/admin" : "/dashboard"}
              >
                {user?.role === "admin" ? "Admin" : "Dashboard"}
              </NavLink>
              <button className="font-medium text-institute-forest transition hover:text-institute-deep" onClick={logout} type="button">Sign out</button>
            </>
          ) : (
            <>
              <Link className="font-medium text-institute-forest transition hover:text-institute-deep" to="/login">Sign in</Link>
              <Link className="font-medium text-institute-forest transition hover:text-institute-deep" to="/register">Invited users</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
