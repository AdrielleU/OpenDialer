import { NavLink, Outlet } from 'react-router-dom';
import {
  Phone,
  Users,
  FileAudio,
  Settings,
  LayoutList,
  BarChart3,
  MessageSquareText,
  LogOut,
  UsersRound,
} from 'lucide-react';
import { auth } from '../lib/api';
import { useUser } from '../App';

interface Props {
  onLogout: () => void;
}

export default function Layout({ onLogout }: Props) {
  const user = useUser();

  const navItems = [
    { to: '/', label: 'Dialer', icon: Phone },
    { to: '/campaigns', label: 'Campaigns', icon: LayoutList },
    { to: '/contacts', label: 'Contacts', icon: Users },
    { to: '/recordings', label: 'Recordings', icon: FileAudio },
    { to: '/transcription', label: 'Transcription', icon: MessageSquareText },
    ...(user?.role === 'admin' ? [{ to: '/team', label: 'Team', icon: UsersRound }] : []),
    { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  const handleLogout = async () => {
    await auth.logout();
    onLogout();
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
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
        <div className="p-2 border-t border-gray-800">
          {user && (
            <div className="px-3 py-2 text-xs text-gray-500 truncate">
              {user.name}
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                user.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
              }`}>
                {user.role}
              </span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors w-full"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
        <div className="px-4 py-3 text-xs text-gray-600">
          OpenDialer v0.1.0
        </div>
      </nav>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
