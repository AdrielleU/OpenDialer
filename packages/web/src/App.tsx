import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dialer from './pages/Dialer';
import Campaigns from './pages/Campaigns';
import Contacts from './pages/Contacts';
import Recordings from './pages/Recordings';
import SettingsPage from './pages/Settings';
import Analytics from './pages/Analytics';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dialer />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/recordings" element={<Recordings />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
