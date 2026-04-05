import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IncomingCallCard from '../components/IncomingCallCard';

describe('IncomingCallCard', () => {
  const routedCall = {
    callControlId: 'call-123',
    contactId: 42,
    contactName: 'John Smith',
    contactPhone: '+15551234567',
    contactCompany: 'Acme Insurance',
    contactNotes: 'Claim #98765',
  };

  it('renders contact name and phone', () => {
    render(<IncomingCallCard routedCall={routedCall} />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('+15551234567')).toBeInTheDocument();
  });

  it('renders company name', () => {
    render(<IncomingCallCard routedCall={routedCall} />);
    expect(screen.getByText('Acme Insurance')).toBeInTheDocument();
  });

  it('renders notes', () => {
    render(<IncomingCallCard routedCall={routedCall} />);
    expect(screen.getByText('Claim #98765')).toBeInTheDocument();
  });

  it('renders "Call Connected" label', () => {
    render(<IncomingCallCard routedCall={routedCall} />);
    expect(screen.getByText('Call Connected')).toBeInTheDocument();
  });

  it('handles missing contact name gracefully', () => {
    const call = { ...routedCall, contactName: null };
    render(<IncomingCallCard routedCall={call} />);
    expect(screen.getByText('Unknown Contact')).toBeInTheDocument();
  });

  it('handles missing company and notes', () => {
    const call = { ...routedCall, contactCompany: null, contactNotes: null };
    render(<IncomingCallCard routedCall={call} />);
    expect(screen.getByText('John Smith')).toBeInTheDocument();
    expect(screen.queryByText('Acme Insurance')).not.toBeInTheDocument();
    expect(screen.queryByText('Claim #98765')).not.toBeInTheDocument();
  });
});
