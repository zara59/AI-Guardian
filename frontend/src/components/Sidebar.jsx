import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Compass, ShieldCheck, Radar, Activity, Settings, Shield, ChevronLeft, Menu } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/opportunities", icon: Compass, label: "Opportunities" },
  { to: "/discovery", icon: Radar, label: "Discovery" },
  { to: "/guardian", icon: ShieldCheck, label: "Guardian" },
  { to: "/activity", icon: Activity, label: "Activity" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white border border-slate-200 rounded-lg p-2 shadow-sm"
        aria-label="Open navigation"
      >
        <Menu size={20} className="text-slate-600" />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-white border-r border-slate-200 z-50
          flex flex-col transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-6 pb-4">
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden absolute top-4 right-4 p-1 rounded-md hover:bg-slate-100"
            aria-label="Close navigation"
          >
            <ChevronLeft size={18} className="text-slate-500" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-slate-900 leading-tight">AI Guardian</h1>
              <p className="text-[11px] text-slate-500 leading-tight">Web3 Intelligence & Protection</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-brand-50 text-brand-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 mx-3 mb-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Guardian Status</span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              <span className="text-sm font-medium text-slate-800">Protection Active</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Monitoring your connected wallet
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
