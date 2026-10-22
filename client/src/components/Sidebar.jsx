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
            <span aria-hidden={collapsed} className={collapsed ? "md:hidden" : ""}>{label}</span>
            {collapsed && <span aria-hidden="true" className="hidden text-center md:block">{label.slice(0, 1)}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
