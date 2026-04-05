import { useState, useEffect, useRef, useCallback } from 'react';

// TelnyxRTC types — the SDK is loaded dynamically
interface TelnyxRTCClient {
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  newCall(params: { destinationNumber: string; callerName?: string; callerNumber?: string }): any;
  calls?: Map<string, any>;
}

interface UseTelnyxClientOptions {
  login: string; // SIP username
  password?: string;
  loginToken?: string;
}

export function useTelnyxClient(options?: UseTelnyxClientOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [callControlId, setCallControlId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<TelnyxRTCClient | null>(null);

  const connect = useCallback(async () => {
    if (!options?.login) {
      setError('No credentials configured');
      return;
    }

    try {
      const { TelnyxRTC } = await import('@telnyx/webrtc');

      const client = new TelnyxRTC({
        login: options.login,
        password: options.password || '',
        ...(options.loginToken ? { login_token: options.loginToken } : {}),
      }) as unknown as TelnyxRTCClient;

      client.on('telnyx.ready', (session: any) => {
        setIsConnected(true);
        // Extract the call control ID from the registered session
        const ccId = session?.call_control_id || session?.callControlId;
        if (ccId) setCallControlId(ccId);
      });

      client.on('telnyx.notification', (notification: any) => {
        // Capture callControlId from incoming call notifications
        const ccId =
          notification?.call?.callControlId ||
          notification?.call?.call_control_id;
        if (ccId) setCallControlId(ccId);
      });

      client.on('telnyx.error', (err: any) => setError(err.message || 'WebRTC error'));
      client.on('telnyx.socket.close', () => {
        setIsConnected(false);
        setCallControlId(null);
      });

      client.connect();
      clientRef.current = client;
    } catch (err: any) {
      setError(err.message || 'Failed to initialize WebRTC');
    }
  }, [options?.login, options?.password, options?.loginToken]);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    setIsConnected(false);
    setCallControlId(null);
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    client: clientRef.current,
    isConnected,
    callControlId,
    error,
    connect,
    disconnect,
  };
}
