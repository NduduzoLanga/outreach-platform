import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NavLink } from "react-router-dom";

const linksByRole = {
  consultant: [
    ["Dashboard", "/dashboard"],
    ["My Leads", "/leads"],
    ["Withdrawals", "/withdrawals"],
    ["Support", "/support"],
    ["Statements", "/statements"],
    ["Profile", "/profile"],
  ],
  specialist: [
    ["Dashboard", "/dashboard"],
    ["Lead Work Queue", "/leads"],
    ["Support", "/support"],
    ["Profile", "/profile"],
  ],
  admin: [
    ["Master Admin", "/admin"],
    ["Audit Trail", "/admin/audit-logs"],
    ["Profile", "/profile"],
  ],
};

export default function Sidebar({ role = "consultant" }) {
  const [collapsed, setCollapsed] = useState(false);
  const links = linksByRole[role] || linksByRole.consultant;
  return (
    <aside className={`w-full shrink-0 border-b border-slate-200 bg-white p-3 md:border-b-0 md:border-r md:p-4 ${collapsed ? "md:w-20" : "md:w-60"}`}>
      <div className="mb-3 hidden justify-end md:flex">
        <button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded p-2 text-slate-500 hover:bg-slate-100"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav aria-label="Main navigation" className="flex gap-2 overflow-auto md:flex-col">
        {links.map(([label, to]) => (
          <NavLink
            aria-label={label}
            className={({ isActive }) => `whitespace-nowrap rounded px-3 py-2 text-sm ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            end
            key={to}
            title={collapsed ? label : undefined}
            to={to}
          >
            <span aria-hidden={collapsed} className={collapsed ? "md:hidden" : ""}>{label}</span>
            {collapsed && <span aria-hidden="true" className="hidden text-center md:block">{label.slice(0, 1)}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
