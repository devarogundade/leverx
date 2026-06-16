import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import {
  JarvisEventRecordSchema,
  JarvisSubscribePayloadSchema,
  JarvisSubscribeResponseSchema,
  JarvisUnreadPayloadSchema,
  type JarvisEventRecord,
} from './jarvis.schemas';

function roomKey(owner: string, accountId: string): string {
  return `jarvis:${owner.toLowerCase()}:${accountId.toLowerCase()}`;
}

@WebSocketGateway({
  namespace: '/jarvis',
  cors: { origin: true },
})
export class JarvisGateway implements OnGatewayConnection {
  private readonly logger = new Logger(JarvisGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket): void {
    this.logger.debug(`jarvis ws connected ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): { ok: boolean } {
    const parsed = JarvisSubscribePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return JarvisSubscribeResponseSchema.parse({ ok: false });
    }
    const owner = parsed.data.owner.trim().toLowerCase();
    const accountId = parsed.data.account_id.trim().toLowerCase();
    const room = roomKey(owner, accountId);
    void client.join(room);
    this.logger.debug(`jarvis ws subscribe ${client.id} -> ${room}`);
    return JarvisSubscribeResponseSchema.parse({ ok: true });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): { ok: boolean } {
    const parsed = JarvisSubscribePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return JarvisSubscribeResponseSchema.parse({ ok: false });
    }
    const owner = parsed.data.owner.trim().toLowerCase();
    const accountId = parsed.data.account_id.trim().toLowerCase();
    void client.leave(roomKey(owner, accountId));
    return JarvisSubscribeResponseSchema.parse({ ok: true });
  }

  broadcastEvent(record: JarvisEventRecord): void {
    const payload = JarvisEventRecordSchema.parse(record);
    this.server
      .to(roomKey(payload.user_address, payload.account_id))
      .emit('jarvis.event', payload);
  }

  broadcastUnread(
    owner: string,
    accountId: string,
    unreadCount: number,
  ): void {
    const payload = JarvisUnreadPayloadSchema.parse({ unread_count: unreadCount });
    this.server.to(roomKey(owner, accountId)).emit('jarvis.unread', payload);
  }
}
