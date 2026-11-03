import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import API from "../services/api";

export default function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();
  const [messagesOpen, setMessagesOpen] = useState(false);
  const messagesMenuRef = useRef(null);
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
  const recentMessages = (messagesQuery.data || []).slice(0, 5);

  useEffect(() => {
    if (!messagesOpen) return undefined;
    function closeOnOutsideClick(event) {
      if (!messagesMenuRef.current?.contains(event.target)) setMessagesOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setMessagesOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [messagesOpen]);

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
              <div className="relative" ref={messagesMenuRef}>
                <button
                  aria-expanded={messagesOpen}
                  aria-haspopup="dialog"
                  aria-label={unreadMessages ? `Recent messages, ${unreadMessages} unread` : "Recent messages"}
                  className={`relative inline-flex items-center justify-center rounded-md p-2.5 transition ${messagesOpen ? "bg-institute-gold-light text-institute-deep ring-1 ring-institute-gold/60" : "text-institute-forest hover:bg-institute-paper hover:text-institute-deep"}`}
                  onClick={() => setMessagesOpen((open) => !open)}
                  title="Recent messages"
                  type="button"
                >
                  <Bell aria-hidden="true" size={20} />
                  {unreadMessages > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 py-0.5 text-center text-[10px] font-bold leading-tight text-white" aria-hidden="true">
                      {unreadMessages > 99 ? "99+" : unreadMessages}
                    </span>
                  )}
                </button>
                {messagesOpen && (
                  <section
                    aria-label="Recent messages"
                    className="absolute right-0 top-full z-50 mt-3 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-xl"
                    role="dialog"
                  >
                    <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <h2 className="text-sm font-bold text-slate-900">Recent messaging</h2>
                      <p className="mt-0.5 text-xs text-slate-500">Notifications and announcements</p>
                    </header>
                    {messagesQuery.isLoading ? (
                      <p className="px-4 py-6 text-center text-sm text-slate-500">Loading recent messages…</p>
                    ) : messagesQuery.error ? (
                      <div className="px-4 py-5 text-sm text-rose-700">
                        <p>{messagesQuery.error.response?.data?.message || "Recent messages could not be loaded."}</p>
                        <button className="mt-2 font-semibold underline" onClick={() => messagesQuery.refetch()} type="button">Retry</button>
                      </div>
                    ) : recentMessages.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-slate-500">No recent messages yet.</p>
                    ) : (
                      <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                        {recentMessages.map((message) => {
                          const unread = !(message.readBy || []).some((reader) => String(reader) === String(user?._id));
                          return (
                            <li key={message._id}>
                              <Link
                                className="block px-4 py-3 transition hover:bg-institute-paper focus:bg-institute-paper focus:outline-none"
                                onClick={() => setMessagesOpen(false)}
                                to="/messages"
                              >
                                <span className="flex items-start gap-2">
                                  {unread && <span aria-label="Unread" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />}
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-slate-900">{message.title}</span>
                                    <span className="mt-0.5 block line-clamp-2 text-xs leading-5 text-slate-600">{message.body}</span>
                                    <span className="mt-1 block text-[11px] text-slate-400">{new Date(message.createdAt).toLocaleString()}</span>
                                  </span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}
              </div>
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
