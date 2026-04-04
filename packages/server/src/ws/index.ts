import type { FastifyPluginAsync, FastifyReply } from 'fastify';

const clients = new Set<FastifyReply>();

export const sseHandler: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    clients.add(reply);

    // Send initial connection event
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    // Keep-alive ping every 15s
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    request.raw.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(reply);
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
    | 'error';
  data: Record<string, unknown>;
}

export function broadcast(event: WsEvent) {
  const message = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const client of clients) {
    try {
      client.raw.write(message);
    } catch {
      clients.delete(client);
    }
  }
}
