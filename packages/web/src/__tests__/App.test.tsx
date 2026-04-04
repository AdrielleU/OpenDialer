import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

// Mock the auth API to return logged-in state
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual('../lib/api');
  return {
    ...actual,
    auth: {
      status: vi.fn().mockResolvedValue({ isSetUp: true, loggedIn: true }),
      logout: vi.fn().mockResolvedValue({}),
    },
  };
});

function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App Routing', () => {
  it('renders the sidebar navigation when authenticated', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText('OpenDialer')).toBeInTheDocument();
    });
  });

  it('renders all nav links when authenticated', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText('Dialer')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('renders the campaigns page heading on /campaigns', async () => {
    renderApp('/campaigns');
    await waitFor(() => {
      const headings = screen.getAllByText('Campaigns');
      expect(headings.length).toBeGreaterThanOrEqual(2);
    });
  });
});
