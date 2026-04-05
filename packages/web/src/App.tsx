import { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dialer from './pages/Dialer';
import Campaigns from './pages/Campaigns';
import Contacts from './pages/Contacts';
import Recordings from './pages/Recordings';
import Transcription from './pages/Transcription';
import Team from './pages/Team';
import SettingsPage from './pages/Settings';
import Analytics from './pages/Analytics';
import { auth } from './lib/api';

interface UserContext {
  userId: number;
  name: string;
  email: string;
  role: 'admin' | 'operator';
}

const UserCtx = createContext<UserContext | null>(null);
export function useUser() {
  return useContext(UserCtx);
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserContext | null>(null);

  useEffect(() => {
    auth.status()
      .then((res) => {
        if (res.loggedIn && res.user) {
          if (res.user.mustChangePassword || res.user.mustSetupMfa) {
            setAuthenticated(false);
          } else {
            setUser({
              userId: res.user.id,
              name: res.user.name,
              email: res.user.email,
              role: res.user.role,
            });
            setAuthenticated(true);
          }
        } else {
          setAuthenticated(false);
        }
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const handleAuthenticated = () => {
    // Re-fetch user info after login
    auth.status().then((res) => {
      if (res.user) {
        setUser({
          userId: res.user.id,
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
        });
      }
      setAuthenticated(true);
    });
  };

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <Login onAuthenticated={handleAuthenticated} />;
  }

  return (
    <UserCtx.Provider value={user}>
      <Routes>
        <Route
          element={
            <Layout
              onLogout={() => {
                setAuthenticated(false);
                setUser(null);
              }}
            />
          }
        >
          <Route path="/" element={<Dialer />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/recordings" element={<Recordings />} />
          <Route path="/transcription" element={<Transcription />} />
          {user?.role === 'admin' && <Route path="/team" element={<Team />} />}
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </UserCtx.Provider>
  );
}
