import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import API from "../services/api";

const linksByRole = {
  consultant: [
    ["Dashboard", "/dashboard"],
    ["My Leads", "/leads"],
    ["Withdrawals", "/withdrawals"],
    ["Messages", "/messages"],
    ["Support", "/support"],
    ["Statements", "/statements"],
    ["Profile", "/profile"],
  ],
  specialist: [
    ["Dashboard", "/dashboard"],
    ["Lead Work Queue", "/leads"],
    ["Conferencing", "/conferencing"],
    ["Earnings", "/earnings"],
    ["Withdrawals", "/withdrawals"],
    ["Messages", "/messages"],
    ["Support", "/support"],
    ["Profile", "/profile"],
  ],
  admin: [
    ["Master Admin", "/admin"],
    ["Payments", "/admin/payments"],
    ["User Register", "/admin/register"],
    ["Messages", "/messages"],
    ["Audit Trail", "/admin/audit-logs"],
    ["Profile", "/profile"],
  ],
};

export default function Sidebar({ role = "consultant" }) {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messagesQuery = useQuery({
    queryKey: ["workspace-messages"],
    queryFn: async () => (await API.get("/messages")).data,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (messagesQuery.data?.some((message) => message.type === "lead_assignment")) {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    }
  }, [messagesQuery.data, queryClient]);
  const unreadMessages = (messagesQuery.data || []).filter(
    (message) => !(message.readBy || []).some((reader) => String(reader) === String(user?._id))
  ).length;
  const links = linksByRole[role] || linksByRole.consultant;
  return (
    <aside className={`w-full shrink-0 border-b border-institute-forest/15 bg-white p-3 md:border-b-0 md:border-r md:p-4 ${collapsed ? "md:w-20" : "md:w-60"}`}>
      <div className="mb-3 hidden justify-end md:flex">
        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded p-2 text-slate-500 hover:bg-institute-paper hover:text-institute-forest"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <div className={`mb-4 flex items-center ${collapsed ? "justify-center" : "justify-start"}`}>
        <NavLink
          aria-label="MyAPI Business home"
          className="flex min-h-10 items-center"
          to={role === "admin" ? "/admin" : "/dashboard"}
        >
          <img
            alt="MyAPI Business"
            className={`object-contain object-left ${collapsed ? "h-9 w-9" : "h-11 w-40"}`}
            src={collapsed ? "/brand/myapi-favicon.png" : "/brand/myapi-business-logo.png"}
          />
        </NavLink>
      </div>
      <nav aria-label="Main navigation" className="flex gap-2 overflow-auto md:flex-col">
        {links.map(([label, to]) => (
          <NavLink
            aria-label={label}
            className={({ isActive }) => `whitespace-nowrap rounded border-l-4 px-3 py-2 text-sm transition ${isActive ? "border-institute-gold bg-institute-gold-light font-semibold text-institute-deep shadow-sm" : "border-transparent text-slate-600 hover:bg-institute-paper hover:text-institute-forest"}`}
            end
            key={to}
            title={collapsed ? label : undefined}
            to={to}
          >
            <span aria-hidden={collapsed} className={`items-center gap-2 ${collapsed ? "md:hidden" : "inline-flex"}`}>{label}{label === "Messages" && unreadMessages > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold leading-none text-rose-700">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}</span>
            {collapsed && <span aria-hidden="true" className="hidden text-center md:block">{label.slice(0, 1)}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
