import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dialer from './pages/Dialer';
import Campaigns from './pages/Campaigns';
import Contacts from './pages/Contacts';
import Recordings from './pages/Recordings';
import Transcription from './pages/Transcription';
import SettingsPage from './pages/Settings';
import Analytics from './pages/Analytics';
import { auth } from './lib/api';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    auth.status()
      .then((res) => setAuthenticated(res.loggedIn))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!authenticated) {
    return <Login onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <Routes>
      <Route element={<Layout onLogout={() => setAuthenticated(false)} />}>
        <Route path="/" element={<Dialer />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/recordings" element={<Recordings />} />
        <Route path="/transcription" element={<Transcription />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
