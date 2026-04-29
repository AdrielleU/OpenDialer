import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../app.js';
import { authCookie } from './setup.js';
import {
  addOperator,
  setOperatorWebrtc,
  setOperatorAvailability,
  resetTeamSession,
  getOperator,
  findAvailableOperator,
} from '../dialer/team-state.js';
import { findOperatorByWebrtcLeg } from '../dialer/disconnect.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  // Each test starts with a clean session
  resetTeamSession();
});

describe('Operator disconnect detection', () => {
  it('findOperatorByWebrtcLeg returns null when no operators exist', () => {
    expect(findOperatorByWebrtcLeg('any-id')).toBeNull();
  });

  it('findOperatorByWebrtcLeg matches an operator by their WebRTC leg id', () => {
    addOperator(42, 'Test Op');
    setOperatorWebrtc(42, 'webrtc-leg-abc');

    const found = findOperatorByWebrtcLeg('webrtc-leg-abc');
    expect(found).not.toBeNull();
    expect(found!.userId).toBe(42);
  });

  it('findOperatorByWebrtcLeg ignores operators without a WebRTC leg', () => {
    addOperator(42, 'Test Op'); // no webrtc leg yet
    expect(findOperatorByWebrtcLeg('webrtc-leg-abc')).toBeNull();
  });

  it('findOperatorByWebrtcLeg distinguishes between different operators', () => {
    addOperator(1, 'Op One');
    addOperator(2, 'Op Two');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorWebrtc(2, 'leg-2');

    expect(findOperatorByWebrtcLeg('leg-1')!.userId).toBe(1);
    expect(findOperatorByWebrtcLeg('leg-2')!.userId).toBe(2);
    expect(findOperatorByWebrtcLeg('leg-nonexistent')).toBeNull();
  });
});

describe('Operator state cleanup primitives', () => {
  it('setOperatorWebrtc(null) clears the WebRTC leg', () => {
    addOperator(1, 'Op');
    setOperatorWebrtc(1, 'leg-1');
    expect(getOperator(1)!.webrtcCallControlId).toBe('leg-1');

    setOperatorWebrtc(1, null);
    expect(getOperator(1)!.webrtcCallControlId).toBeNull();
  });
});

describe('Transfer-on-disconnect — target selection', () => {
  it('findAvailableOperator returns null when only the on-call operator exists', () => {
    addOperator(1, 'Solo');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'on_call');
    expect(findAvailableOperator()).toBeNull();
  });

  it('findAvailableOperator picks the other free operator', () => {
    // The disconnected/on-call operator
    addOperator(1, 'Disconnecting');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'on_call');

    // The standby operator
    addOperator(2, 'Standby');
    setOperatorWebrtc(2, 'leg-2');
    setOperatorAvailability(2, 'available');

    const target = findAvailableOperator();
    expect(target).not.toBeNull();
    expect(target!.userId).toBe(2);
  });

  it('findAvailableOperator skips operators without a webrtc leg', () => {
    addOperator(1, 'Has no leg yet');
    setOperatorAvailability(1, 'available');
    // No setOperatorWebrtc — they joined but never registered WebRTC
    expect(findAvailableOperator()).toBeNull();
  });

  it('findAvailableOperator picks the longest-waiting free operator (FIFO)', () => {
    addOperator(1, 'First');
    setOperatorWebrtc(1, 'leg-1');
    setOperatorAvailability(1, 'available');

    // Tiny delay so availableSince timestamps differ
    const op1 = getOperator(1)!;
    op1.availableSince = 1000;

    addOperator(2, 'Second');
    setOperatorWebrtc(2, 'leg-2');
    setOperatorAvailability(2, 'available');
    const op2 = getOperator(2)!;
    op2.availableSince = 2000;

    const target = findAvailableOperator();
    expect(target!.userId).toBe(1); // earlier availableSince wins
  });
});

