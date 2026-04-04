import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../components/Layout';

describe('Layout', () => {
  it('renders all nav links', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    const expectedLinks = ['Dialer', 'Campaigns', 'Contacts', 'Recordings', 'Analytics', 'Settings'];
    for (const label of expectedLinks) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders the version number', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );
    expect(screen.getByText('OpenDialer v0.1.0')).toBeInTheDocument();
  });
});
