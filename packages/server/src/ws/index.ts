import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { getSessionData } from '../routes/auth.js';

// Per-user SSE client tracking
const userClients = new Map<number, Set<FastifyReply>>(); // userId -> connections
const allClients = new Set<FastifyReply>(); // all connections (for broadcast-all)
const clientUserMap = new WeakMap<FastifyReply, number>(); // reverse lookup

function registerClient(userId: number, reply: FastifyReply) {
  allClients.add(reply);
  clientUserMap.set(reply, userId);

  if (!userClients.has(userId)) {
    userClients.set(userId, new Set());
  }
  userClients.get(userId)!.add(reply);
}

function unregisterClient(reply: FastifyReply) {
  allClients.delete(reply);
  const userId = clientUserMap.get(reply);
  if (userId !== undefined) {
    userClients.get(userId)?.delete(reply);
    if (userClients.get(userId)?.size === 0) {
      userClients.delete(userId);
    }
  }
}

export const sseHandler: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Extract userId from session
    const session = getSessionData(request);
    const userId = session?.userId ?? -1;

    registerClient(userId, reply);

    // Send initial connection event
    reply.raw.write(
      `event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), userId })}\n\n`,
    );

    // Keep-alive ping every 15s
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      unregisterClient(reply);
    });

    // Don't end the response — keep the stream open
    await new Promise(() => {}); // eslint-disable-line @typescript-eslint/no-empty-function
  });
};

export interface WsEvent {
  type:
    | 'call_status_changed'
    | 'session_status_changed'
    | 'call_log_added'
    | 'contact_updated'
    | 'transcription'
    | 'call_routed_to_you'
    | 'operator_status_changed'
    | 'call_waiting'
    | 'error';
  data: Record<string, unknown>;
}

function sendToClient(client: FastifyReply, event: WsEvent) {
  try {
    client.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
  } catch {
    unregisterClient(client);
  }
}

// Broadcast to ALL connected clients
export function broadcast(event: WsEvent) {
  for (const client of allClients) {
    sendToClient(client, event);
  }
}

// Send to a specific user's connections
export function broadcastToUser(userId: number, event: WsEvent) {
  const clients = userClients.get(userId);
  if (!clients) return;
  for (const client of clients) {
    sendToClient(client, event);
  }
}

// Check if a user has any active SSE connections
export function isUserConnected(userId: number): boolean {
  return (userClients.get(userId)?.size ?? 0) > 0;
}

// Get all connected user IDs
export function getConnectedUserIds(): number[] {
  return Array.from(userClients.keys());
}
