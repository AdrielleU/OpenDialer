import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OperatorStatusPanel from '../components/OperatorStatusPanel';

describe('OperatorStatusPanel', () => {
  it('renders empty state', () => {
    render(<OperatorStatusPanel operators={[]} waitingCalls={0} />);
    expect(screen.getByText('No operators online')).toBeInTheDocument();
    expect(screen.getByText('Operators (0)')).toBeInTheDocument();
  });

  it('renders operators with availability badges', () => {
    const operators = [
      { userId: 1, name: 'Alice', availability: 'available' as const, bridgedContactId: null },
      { userId: 2, name: 'Bob', availability: 'on_call' as const, bridgedContactId: 42 },
      { userId: 3, name: 'Charlie', availability: 'wrap_up' as const, bridgedContactId: null },
    ];
    render(<OperatorStatusPanel operators={operators} waitingCalls={0} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText(/On Call/)).toBeInTheDocument();
    expect(screen.getByText('Wrap-Up')).toBeInTheDocument();
    expect(screen.getByText('Operators (3)')).toBeInTheDocument();
  });

  it('shows waiting calls badge when > 0', () => {
    render(<OperatorStatusPanel operators={[]} waitingCalls={3} />);
    expect(screen.getByText('3 waiting')).toBeInTheDocument();
  });

  it('hides waiting calls badge when 0', () => {
    render(<OperatorStatusPanel operators={[]} waitingCalls={0} />);
    expect(screen.queryByText(/waiting/)).not.toBeInTheDocument();
  });

  it('shows bridged contact ID for on_call operators', () => {
    const operators = [
      { userId: 1, name: 'Alice', availability: 'on_call' as const, bridgedContactId: 99 },
    ];
    render(<OperatorStatusPanel operators={operators} waitingCalls={0} />);
    expect(screen.getByText(/Contact #99/)).toBeInTheDocument();
  });
});
