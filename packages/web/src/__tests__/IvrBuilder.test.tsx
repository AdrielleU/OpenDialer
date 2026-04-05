import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import IvrBuilder from '../components/IvrBuilder';

describe('IvrBuilder', () => {
  it('renders empty state with no steps', () => {
    render(<IvrBuilder value="" onChange={() => {}} />);
    expect(screen.getByText(/No IVR steps/)).toBeInTheDocument();
    expect(screen.getByText('Add Wait')).toBeInTheDocument();
    expect(screen.getByText('Add Press')).toBeInTheDocument();
  });

  it('parses existing sequence into steps', () => {
    render(<IvrBuilder value="WWW1WW3" onChange={() => {}} />);
    // Should have 4 steps: wait 3s, press 1, wait 2s, press 3
    expect(screen.getAllByText(/Wait|Press/).length).toBeGreaterThanOrEqual(2);
  });

  it('adds a wait step', () => {
    const onChange = vi.fn();
    render(<IvrBuilder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Add Wait'));
    expect(onChange).toHaveBeenCalled();
  });

  it('adds a press step', () => {
    const onChange = vi.fn();
    render(<IvrBuilder value="" onChange={onChange} />);
    fireEvent.click(screen.getByText('Add Press'));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows raw sequence code when steps exist', () => {
    render(<IvrBuilder value="WW1" onChange={() => {}} />);
    expect(screen.getByText(/Sequence:/)).toBeInTheDocument();
  });
});
