import { useState, useEffect, useRef, useCallback } from 'react';

// TelnyxRTC types — the SDK is loaded dynamically
interface TelnyxRTCClient {
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  newCall(params: { destinationNumber: string; callerName?: string; callerNumber?: string }): any;
}

interface UseTelnyxClientOptions {
  login: string; // SIP username or JWT
  password?: string;
  loginToken?: string;
}

export function useTelnyxClient(options?: UseTelnyxClientOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<TelnyxRTCClient | null>(null);

  const connect = useCallback(async () => {
    if (!options?.login) {
      setError('No credentials configured');
      return;
    }

    try {
      // Dynamic import of @telnyx/webrtc
      const { TelnyxRTC } = await import('@telnyx/webrtc');

      const client = new TelnyxRTC({
        login: options.login,
        password: options.password || '',
        ...(options.loginToken ? { login_token: options.loginToken } : {}),
      }) as unknown as TelnyxRTCClient;

      client.on('telnyx.ready', () => setIsConnected(true));
      client.on('telnyx.error', (err: any) => setError(err.message || 'WebRTC error'));
      client.on('telnyx.socket.close', () => setIsConnected(false));

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
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  return {
    client: clientRef.current,
    isConnected,
    error,
    connect,
    disconnect,
  };
}
