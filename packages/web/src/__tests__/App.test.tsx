import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

function renderApp(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App Routing', () => {
  it('renders the sidebar navigation', () => {
    renderApp();
    expect(screen.getByText('OpenDialer')).toBeInTheDocument();
  });

  it('renders all nav links', () => {
    renderApp();
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(screen.getByText('Dialer')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('renders the campaigns page heading on /campaigns', () => {
    renderApp('/campaigns');
    // The page has an h1 "Campaigns" plus a nav link "Campaigns"
    const headings = screen.getAllByText('Campaigns');
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });
});
