import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTeamSession,
  updateTeamSession,
  resetTeamSession,
  addOperator,
  removeOperator,
  getOperator,
  setOperatorAvailability,
  setOperatorWebrtc,
  findAvailableOperator,
  countAvailableOperators,
  addInFlightCall,
  getInFlightCall,
  updateInFlightCall,
  removeInFlightCall,
  addToWaitingQueue,
  popWaitingCall,
  getLegacySession,
} from '../dialer/team-state.js';

describe('Team Session State', () => {
  beforeEach(() => {
    resetTeamSession();
  });

  it('starts with idle defaults', () => {
    const session = getTeamSession();
    expect(session.status).toBe('idle');
    expect(session.campaignId).toBe(0);
    expect(session.queue).toEqual([]);
    expect(session.inFlightCalls.size).toBe(0);
    expect(session.operators.size).toBe(0);
    expect(session.waitingCalls).toEqual([]);
    expect(session.callsMade).toBe(0);
  });

  it('updates session fields', () => {
    updateTeamSession({ status: 'running', campaignId: 1, queue: [10, 20, 30] });
    const session = getTeamSession();
    expect(session.status).toBe('running');
    expect(session.campaignId).toBe(1);
    expect(session.queue).toEqual([10, 20, 30]);
  });

  it('preserves unmodified fields on partial update', () => {
    updateTeamSession({ status: 'running', campaignId: 5 });
    updateTeamSession({ callsMade: 3 });
    const session = getTeamSession();
    expect(session.status).toBe('running');
    expect(session.campaignId).toBe(5);
    expect(session.callsMade).toBe(3);
  });

  it('resets to defaults', () => {
    updateTeamSession({ status: 'running', campaignId: 1, callsMade: 10 });
    addOperator(1, 'Alice');
    addInFlightCall('call-1', 100);
    resetTeamSession();
    const session = getTeamSession();
    expect(session.status).toBe('idle');
    expect(session.operators.size).toBe(0);
    expect(session.inFlightCalls.size).toBe(0);
  });
});

describe('Operator Management', () => {
  beforeEach(() => {
    resetTeamSession();
  });

  it('adds an operator with available status', () => {
    const op = addOperator(1, 'Alice');
    expect(op.userId).toBe(1);
    expect(op.name).toBe('Alice');
    expect(op.availability).toBe('available');
    expect(op.webrtcCallControlId).toBeNull();
  });

  it('adjusts maxParallelLines based on operator count', () => {
    addOperator(1, 'Alice');
    expect(getTeamSession().maxParallelLines).toBe(3); // 1 * 3

    addOperator(2, 'Bob');
    expect(getTeamSession().maxParallelLines).toBe(6); // 2 * 3

    addOperator(3, 'Charlie');
    expect(getTeamSession().maxParallelLines).toBe(9); // 3 * 3
  });

  it('removes an operator and adjusts lines', () => {
    addOperator(1, 'Alice');
    addOperator(2, 'Bob');
    expect(getTeamSession().maxParallelLines).toBe(6);

    removeOperator(1);
    expect(getTeamSession().operators.size).toBe(1);
    expect(getTeamSession().maxParallelLines).toBe(3);
  });

  it('gets an operator by id', () => {
    addOperator(42, 'Alice');
    const op = getOperator(42);
    expect(op).toBeDefined();
    expect(op!.name).toBe('Alice');
    expect(getOperator(999)).toBeUndefined();
  });

  it('sets operator availability', () => {
    addOperator(1, 'Alice');
    setOperatorAvailability(1, 'on_call');
    expect(getOperator(1)!.availability).toBe('on_call');

    setOperatorAvailability(1, 'available');
    expect(getOperator(1)!.availability).toBe('available');
    expect(getOperator(1)!.bridgedToCallId).toBeNull();
  });

  it('sets operator WebRTC call control ID', () => {
    addOperator(1, 'Alice');
    setOperatorWebrtc(1, 'webrtc-leg-123');
    expect(getOperator(1)!.webrtcCallControlId).toBe('webrtc-leg-123');
  });
});

describe('Find Available Operator (FIFO)', () => {
  beforeEach(() => {
    resetTeamSession();
  });

  it('returns null when no operators exist', () => {
    expect(findAvailableOperator()).toBeNull();
  });

  it('returns null when no operators have WebRTC connected', () => {
    addOperator(1, 'Alice');
    // No WebRTC set — should not be routable
    expect(findAvailableOperator()).toBeNull();
  });

  it('returns the only available operator', () => {
    addOperator(1, 'Alice');
    setOperatorWebrtc(1, 'webrtc-1');
    const op = findAvailableOperator();
    expect(op).not.toBeNull();
    expect(op!.userId).toBe(1);
  });

  it('skips busy operators', () => {
    addOperator(1, 'Alice');
    setOperatorWebrtc(1, 'webrtc-1');
    setOperatorAvailability(1, 'on_call');

    addOperator(2, 'Bob');
    setOperatorWebrtc(2, 'webrtc-2');

    const op = findAvailableOperator();
    expect(op!.userId).toBe(2);
  });

  it('picks the longest-waiting operator (FIFO fairness)', () => {
    // Alice joins first
    addOperator(1, 'Alice');
    setOperatorWebrtc(1, 'webrtc-1');
    const aliceOp = getOperator(1)!;
    aliceOp.availableSince = 1000; // earlier timestamp

    // Bob joins later
    addOperator(2, 'Bob');
    setOperatorWebrtc(2, 'webrtc-2');
    const bobOp = getOperator(2)!;
    bobOp.availableSince = 2000; // later timestamp

    const op = findAvailableOperator();
    expect(op!.userId).toBe(1); // Alice waited longer
  });

  it('counts available operators correctly', () => {
    expect(countAvailableOperators()).toBe(0);

    addOperator(1, 'Alice');
    setOperatorWebrtc(1, 'webrtc-1');
    expect(countAvailableOperators()).toBe(1);

    addOperator(2, 'Bob');
    setOperatorWebrtc(2, 'webrtc-2');
    expect(countAvailableOperators()).toBe(2);

    setOperatorAvailability(1, 'on_call');
    expect(countAvailableOperators()).toBe(1);
  });
});

describe('In-Flight Call Management', () => {
  beforeEach(() => {
    resetTeamSession();
  });

  it('adds an in-flight call', () => {
    const call = addInFlightCall('call-abc', 42);
    expect(call.callControlId).toBe('call-abc');
    expect(call.contactId).toBe(42);
    expect(call.callState).toBe('dialing');
    expect(call.assignedOperatorId).toBeNull();
    expect(getTeamSession().inFlightCalls.size).toBe(1);
  });

  it('gets an in-flight call by ID', () => {
    addInFlightCall('call-abc', 42);
    expect(getInFlightCall('call-abc')).toBeDefined();
    expect(getInFlightCall('call-abc')!.contactId).toBe(42);
    expect(getInFlightCall('nonexistent')).toBeUndefined();
  });

  it('updates an in-flight call', () => {
    addInFlightCall('call-abc', 42);
    updateInFlightCall('call-abc', { callState: 'ringing', assignedOperatorId: 1 });
    const call = getInFlightCall('call-abc')!;
    expect(call.callState).toBe('ringing');
    expect(call.assignedOperatorId).toBe(1);
    expect(call.contactId).toBe(42); // unchanged
  });

  it('removes an in-flight call', () => {
    addInFlightCall('call-abc', 42);
    removeInFlightCall('call-abc');
    expect(getTeamSession().inFlightCalls.size).toBe(0);
  });

  it('tracks multiple in-flight calls', () => {
    addInFlightCall('call-1', 10);
    addInFlightCall('call-2', 20);
    addInFlightCall('call-3', 30);
    expect(getTeamSession().inFlightCalls.size).toBe(3);

    removeInFlightCall('call-2');
    expect(getTeamSession().inFlightCalls.size).toBe(2);
    expect(getInFlightCall('call-2')).toBeUndefined();
    expect(getInFlightCall('call-1')).toBeDefined();
    expect(getInFlightCall('call-3')).toBeDefined();
  });
});

describe('Waiting Call Queue', () => {
  beforeEach(() => {
    resetTeamSession();
  });

  it('adds calls to waiting queue', () => {
    addToWaitingQueue('call-1');
    addToWaitingQueue('call-2');
    expect(getTeamSession().waitingCalls).toEqual(['call-1', 'call-2']);
  });

  it('does not add duplicates', () => {
    addToWaitingQueue('call-1');
    addToWaitingQueue('call-1');
    expect(getTeamSession().waitingCalls).toEqual(['call-1']);
  });

  it('pops calls in FIFO order', () => {
    addToWaitingQueue('call-1');
    addToWaitingQueue('call-2');
    addToWaitingQueue('call-3');

    expect(popWaitingCall()).toBe('call-1');
    expect(popWaitingCall()).toBe('call-2');
    expect(popWaitingCall()).toBe('call-3');
    expect(popWaitingCall()).toBeNull();
  });

  it('removes from waiting queue when call is removed from in-flight', () => {
    addInFlightCall('call-1', 10);
    addToWaitingQueue('call-1');
    removeInFlightCall('call-1');
    expect(getTeamSession().waitingCalls).toEqual([]);
  });
});

describe('Legacy Compatibility', () => {
  beforeEach(() => {
    resetTeamSession();
  });

  it('returns legacy-shaped session for single-operator mode', () => {
    updateTeamSession({ campaignId: 1, status: 'running' });
    addOperator(1, 'Alice');
    addInFlightCall('call-abc', 42);
    updateInFlightCall('call-abc', { callState: 'ringing' });

    const legacy = getLegacySession();
    expect(legacy.campaignId).toBe(1);
    expect(legacy.status).toBe('running');
    expect(legacy.currentContactId).toBe(42);
    expect(legacy.currentCallControlId).toBe('call-abc');
    expect(legacy.currentCallState).toBe('ringing');
  });

  it('returns idle defaults when no calls are in-flight', () => {
    const legacy = getLegacySession();
    expect(legacy.currentContactId).toBeNull();
    expect(legacy.currentCallControlId).toBeNull();
    expect(legacy.currentCallState).toBe('idle');
  });
});
