import { Link, NavLink } from "react-router-dom";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import API from "../services/api";

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const messagesQuery = useQuery({
    queryKey: ["workspace-messages"],
    queryFn: async () => (await API.get("/messages")).data,
    enabled: isAuthenticated,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  const unreadMessages = (messagesQuery.data || []).filter(
    (message) => !(message.readBy || []).some((reader) => String(reader) === String(user?._id))
  ).length;

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
                aria-label={unreadMessages ? `Messages, ${unreadMessages} unread` : "Messages"}
                className={({ isActive }) => `relative inline-flex items-center justify-center rounded-md p-2.5 transition ${isActive ? "bg-institute-gold-light text-institute-deep ring-1 ring-institute-gold/60" : "text-institute-forest hover:bg-institute-paper hover:text-institute-deep"}`}
                title={unreadMessages ? `Messages (${unreadMessages} unread)` : "Messages"}
                to="/messages"
              >
                <Bell aria-hidden="true" size={20} />
                {unreadMessages > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-white" aria-hidden="true">
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
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
