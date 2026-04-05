import { useState, useEffect, useCallback, useRef } from 'react';
import type { CallState, SessionStatus, OperatorStatus } from '../types';

interface RoutedCall {
  callControlId: string;
  contactId: number;
  contactName: string | null;
  contactPhone: string;
  contactCompany: string | null;
  contactNotes: string | null;
}

interface TranscriptLine {
  speaker: 'inbound' | 'outbound';
  content: string;
  confidence: number | null;
  timestamp: string;
}

interface EventStreamState {
  callState: CallState;
  sessionStatus: SessionStatus;
  currentContactId: number | null;
  message: string | null;
  callLogs: Array<{ contactId: number; disposition: string; timestamp: string }>;
  error: string | null;
  connected: boolean;
  operators: OperatorStatus[];
  routedCall: RoutedCall | null;
  waitingCalls: number;
  transcriptLines: TranscriptLine[];
  muted: boolean;
  activeCallControlId: string | null;
}

export function useEventStream() {
  const [state, setState] = useState<EventStreamState>({
    callState: 'idle',
    sessionStatus: 'idle',
    currentContactId: null,
    message: null,
    callLogs: [],
    error: null,
    connected: false,
    operators: [],
    routedCall: null,
    waitingCalls: 0,
    transcriptLines: [],
    muted: false,
    activeCallControlId: null,
  });

  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    const es = new EventSource('/events');

    es.addEventListener('connected', () => {
      setState((s) => ({ ...s, connected: true, error: null }));
    });

    es.addEventListener('call_status_changed', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        callState: data.callState || s.callState,
        currentContactId: data.contactId ?? s.currentContactId,
        message: data.message || null,
        muted: data.muted != null ? !!data.muted : (data.callState === 'ended' || data.callState === 'idle' ? false : s.muted),
        activeCallControlId: data.callControlId ?? s.activeCallControlId,
        // Clear routed call and transcript when call ends or goes idle
        routedCall:
          data.callState === 'ended' || data.callState === 'idle'
            ? null
            : s.routedCall,
        transcriptLines:
          data.callState === 'ended' || data.callState === 'idle'
            ? []
            : s.transcriptLines,
      }));
    });

    es.addEventListener('session_status_changed', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        sessionStatus: data.status || s.sessionStatus,
        // Clear operators and routed call when session stops
        ...(data.status === 'stopped' ? { operators: [], routedCall: null, waitingCalls: 0 } : {}),
      }));
    });

    es.addEventListener('call_log_added', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        callLogs: [
          { contactId: data.contactId, disposition: data.disposition, timestamp: new Date().toISOString() },
          ...s.callLogs,
        ].slice(0, 50),
      }));
    });

    es.addEventListener('contact_updated', () => {
      // Trigger re-fetch in consuming components if needed
    });

    es.addEventListener('operator_status_changed', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => {
        const operatorId = data.operatorId as number;
        const availability = data.availability as string;

        if (availability === 'offline') {
          return { ...s, operators: s.operators.filter((op) => op.userId !== operatorId) };
        }

        const existing = s.operators.find((op) => op.userId === operatorId);
        if (existing) {
          return {
            ...s,
            operators: s.operators.map((op) =>
              op.userId === operatorId
                ? { ...op, availability: availability as OperatorStatus['availability'], bridgedContactId: (data.contactId as number) ?? null }
                : op,
            ),
          };
        }

        return {
          ...s,
          operators: [
            ...s.operators,
            {
              userId: operatorId,
              name: (data.name as string) || `Operator ${operatorId}`,
              availability: availability as OperatorStatus['availability'],
              bridgedContactId: (data.contactId as number) ?? null,
            },
          ],
        };
      });
    });

    es.addEventListener('call_routed_to_you', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        routedCall: {
          callControlId: data.callControlId,
          contactId: data.contactId,
          contactName: data.contactName ?? null,
          contactPhone: data.contactPhone ?? '',
          contactCompany: data.contactCompany ?? null,
          contactNotes: data.contactNotes ?? null,
        },
      }));
    });

    es.addEventListener('call_waiting', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        waitingCalls: data.count ?? s.waitingCalls + 1,
      }));
    });

    es.addEventListener('transcription', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({
        ...s,
        transcriptLines: [
          ...s.transcriptLines,
          {
            speaker: (data.speaker as 'inbound' | 'outbound') || 'inbound',
            content: data.transcript,
            confidence: data.confidence ?? null,
            timestamp: new Date().toISOString(),
          },
        ].slice(-100),
      }));
    });

    es.addEventListener('error', () => {
      setState((s) => ({ ...s, connected: false }));
    });

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
    };

    esRef.current = es;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      esRef.current?.close();
    };
  }, [connect]);

  return state;
}

// Re-export with old name for compatibility
export const useWebSocket = useEventStream;
