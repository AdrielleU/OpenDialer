import { NavLink, Outlet } from 'react-router-dom';
import { Phone, Users, FileAudio, Settings, LayoutList, BarChart3, MessageSquareText } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dialer', icon: Phone },
  { to: '/campaigns', label: 'Campaigns', icon: LayoutList },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/recordings', label: 'Recordings', icon: FileAudio },
  { to: '/transcription', label: 'Transcription', icon: MessageSquareText },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      {/* Sidebar */}
      <nav className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
            <Phone size={20} />
            OpenDialer
          </h1>
        </div>
        <div className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
        <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
          OpenDialer v0.1.0
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
