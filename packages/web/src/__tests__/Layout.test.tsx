import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../components/Layout';

const noop = () => {};

describe('Layout', () => {
  it('renders all nav links', () => {
    render(
      <MemoryRouter>
        <Layout onLogout={noop} />
      </MemoryRouter>,
    );

    const expectedLinks = ['Dialer', 'Campaigns', 'Contacts', 'Recordings', 'Transcription', 'Analytics', 'Settings'];
    for (const label of expectedLinks) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders the version number and sign out button', () => {
    render(
      <MemoryRouter>
        <Layout onLogout={noop} />
      </MemoryRouter>,
    );
    expect(screen.getByText('OpenDialer v0.1.0')).toBeInTheDocument();
    expect(screen.getByText('Sign Out')).toBeInTheDocument();
  });
});
