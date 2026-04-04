import { describe, it, expect, beforeEach } from 'vitest';
import { getSession, updateSession, resetSession } from '../dialer/state.js';

describe('Dialer Session State', () => {
  beforeEach(() => {
    resetSession();
  });

  it('starts with idle defaults', () => {
    const session = getSession();
    expect(session.status).toBe('idle');
    expect(session.currentContactId).toBeNull();
    expect(session.currentCallControlId).toBeNull();
    expect(session.currentCallState).toBe('idle');
    expect(session.callsMade).toBe(0);
    expect(session.queue).toEqual([]);
  });

  it('updates session fields', () => {
    updateSession({ status: 'running', campaignId: 1, queue: [10, 20, 30] });
    const session = getSession();
    expect(session.status).toBe('running');
    expect(session.campaignId).toBe(1);
    expect(session.queue).toEqual([10, 20, 30]);
  });

  it('preserves unmodified fields on partial update', () => {
    updateSession({ status: 'running', campaignId: 5 });
    updateSession({ callsMade: 3 });
    const session = getSession();
    expect(session.status).toBe('running');
    expect(session.campaignId).toBe(5);
    expect(session.callsMade).toBe(3);
  });

  it('resets to defaults', () => {
    updateSession({ status: 'running', campaignId: 1, callsMade: 10 });
    resetSession();
    const session = getSession();
    expect(session.status).toBe('idle');
    expect(session.campaignId).toBe(0);
    expect(session.callsMade).toBe(0);
  });
});
