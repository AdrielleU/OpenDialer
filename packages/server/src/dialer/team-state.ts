export type CallState =
  | 'idle'
  | 'dialing'
  | 'ringing'
  | 'amd_detecting'
  | 'voicemail_dropping'
  | 'human_answered'
  | 'opener_playing'
  | 'operator_bridged'
  | 'waiting_for_operator'
  | 'ended';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'stopped';
export type OperatorAvailability = 'available' | 'on_call' | 'wrap_up' | 'offline';

export interface OperatorState {
  userId: number;
  name: string;
  availability: OperatorAvailability;
  webrtcCallControlId: string | null;
  bridgedToCallId: string | null;
  bridgedContactId: number | null;
  availableSince: number | null; // timestamp for FIFO fairness
}

export interface InFlightCall {
  callControlId: string;
  contactId: number;
  callState: CallState;
  assignedOperatorId: number | null;
  dialedAt: string;
  bridgedAt: string | null;
}

export interface TeamSession {
  campaignId: number;
  status: SessionStatus;
  queue: number[]; // contact IDs remaining
  inFlightCalls: Map<string, InFlightCall>; // keyed by callControlId
  operators: Map<number, OperatorState>; // keyed by userId
  waitingCalls: string[]; // callControlIds waiting for an operator
  maxParallelLines: number;
  callsMade: number;
  voicemailsDropped: number;
  connects: number;
  sessionStartedAt: string | null;
}

const defaultSession: TeamSession = {
  campaignId: 0,
  status: 'idle',
  queue: [],
  inFlightCalls: new Map(),
  operators: new Map(),
  waitingCalls: [],
  maxParallelLines: 1,
  callsMade: 0,
  voicemailsDropped: 0,
  connects: 0,
  sessionStartedAt: null,
};

let session: TeamSession = { ...defaultSession, inFlightCalls: new Map(), operators: new Map(), waitingCalls: [] };

export function getTeamSession(): TeamSession {
  return session;
}

export function updateTeamSession(updates: Partial<Omit<TeamSession, 'inFlightCalls' | 'operators' | 'waitingCalls'>>): TeamSession {
  session = { ...session, ...updates };
  return session;
}

export function resetTeamSession(): TeamSession {
  session = {
    ...defaultSession,
    inFlightCalls: new Map(),
    operators: new Map(),
    waitingCalls: [],
  };
  return session;
}

// --- Operator management ---

export function addOperator(userId: number, name: string): OperatorState {
  const op: OperatorState = {
    userId,
    name,
    availability: 'available',
    webrtcCallControlId: null,
    bridgedToCallId: null,
    bridgedContactId: null,
    availableSince: Date.now(),
  };
  session.operators.set(userId, op);

  // Adjust parallel lines: 3x operators or minimum 1
  session.maxParallelLines = Math.max(session.operators.size * 3, 1);

  return op;
}

export function removeOperator(userId: number): void {
  session.operators.delete(userId);
  session.maxParallelLines = Math.max(session.operators.size * 3, 1);
}

export function getOperator(userId: number): OperatorState | undefined {
  return session.operators.get(userId);
}

export function setOperatorAvailability(userId: number, availability: OperatorAvailability): void {
  const op = session.operators.get(userId);
  if (!op) return;
  op.availability = availability;
  if (availability === 'available') {
    op.availableSince = Date.now();
    op.bridgedToCallId = null;
    op.bridgedContactId = null;
  }
}

export function setOperatorWebrtc(userId: number, callControlId: string): void {
  const op = session.operators.get(userId);
  if (op) op.webrtcCallControlId = callControlId;
}

// Find the first available operator (FIFO — longest waiting)
export function findAvailableOperator(): OperatorState | null {
  let oldest: OperatorState | null = null;
  for (const op of session.operators.values()) {
    if (op.availability !== 'available' || !op.webrtcCallControlId) continue;
    if (!oldest || (op.availableSince ?? Infinity) < (oldest.availableSince ?? Infinity)) {
      oldest = op;
    }
  }
  return oldest;
}

export function countAvailableOperators(): number {
  let count = 0;
  for (const op of session.operators.values()) {
    if (op.availability === 'available' && op.webrtcCallControlId) count++;
  }
  return count;
}

// --- In-flight call management ---

export function addInFlightCall(callControlId: string, contactId: number): InFlightCall {
  const call: InFlightCall = {
    callControlId,
    contactId,
    callState: 'dialing',
    assignedOperatorId: null,
    dialedAt: new Date().toISOString(),
    bridgedAt: null,
  };
  session.inFlightCalls.set(callControlId, call);
  return call;
}

export function getInFlightCall(callControlId: string): InFlightCall | undefined {
  return session.inFlightCalls.get(callControlId);
}

export function updateInFlightCall(callControlId: string, updates: Partial<InFlightCall>): void {
  const call = session.inFlightCalls.get(callControlId);
  if (call) Object.assign(call, updates);
}

export function removeInFlightCall(callControlId: string): void {
  session.inFlightCalls.delete(callControlId);
  // Also remove from waiting queue
  session.waitingCalls = session.waitingCalls.filter((id) => id !== callControlId);
}

// --- Waiting queue ---

export function addToWaitingQueue(callControlId: string): void {
  if (!session.waitingCalls.includes(callControlId)) {
    session.waitingCalls.push(callControlId);
  }
}

export function popWaitingCall(): string | null {
  return session.waitingCalls.shift() ?? null;
}

// --- Legacy compatibility ---
// For single-user mode, these helpers map to the team state

export function getLegacySession() {
  const firstOp = session.operators.values().next().value as OperatorState | undefined;
  const firstCall = session.inFlightCalls.values().next().value as InFlightCall | undefined;

  return {
    campaignId: session.campaignId,
    status: session.status,
    queue: session.queue,
    currentContactId: firstCall?.contactId ?? null,
    currentCallControlId: firstCall?.callControlId ?? null,
    currentCallState: firstCall?.callState ?? ('idle' as CallState),
    callsMade: session.callsMade,
    voicemailsDropped: session.voicemailsDropped,
    connects: session.connects,
    sessionStartedAt: session.sessionStartedAt,
  };
}
