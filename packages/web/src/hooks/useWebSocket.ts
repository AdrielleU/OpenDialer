import { useState, useEffect, useCallback, useRef } from 'react';
import type { CallState, SessionStatus } from '../types';

interface EventStreamState {
  callState: CallState;
  sessionStatus: SessionStatus;
  currentContactId: number | null;
  message: string | null;
  callLogs: Array<{ contactId: number; disposition: string; timestamp: string }>;
  error: string | null;
  connected: boolean;
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
      }));
    });

    es.addEventListener('session_status_changed', (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({ ...s, sessionStatus: data.status || s.sessionStatus }));
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

    es.addEventListener('error', () => {
      setState((s) => ({ ...s, connected: false }));
    });

    es.onerror = () => {
      setState((s) => ({ ...s, connected: false }));
      // EventSource auto-reconnects by default
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
