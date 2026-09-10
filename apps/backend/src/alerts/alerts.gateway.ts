import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Real-time alert fan-out (Section 3). Clients authenticate with the same JWT
 * as the REST API (handshake.auth.token) and are placed in per-role rooms.
 * Manager/Owner rooms receive cash-discrepancy + daily-summary alerts.
 */
@WebSocketGateway({
  cors: { origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()), credentials: true },
  transports: ['websocket'],
})
export class AlertsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(AlertsGateway.name);

  constructor(private jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake?.auth?.token as string) || '';
      const payload = await this.jwt.verifyAsync(token);
      const role = String(payload?.role || 'employee');
      await client.join(`role:${role}`);
      // Managers and owners share the staff room for level-50 alerts.
      if (role === 'manager' || role === 'owner') await client.join('role:staff');
      client.data.role = role;
    } catch {
      this.logger.warn('Rejected unauthenticated socket connection');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    void client;
  }

  @SubscribeMessage('ping')
  ping(client: Socket) {
    client.emit('pong', Date.now());
  }

  /** Emit to manager + owner rooms (used for level-50 alerts). */
  emitToStaff(event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to('role:staff').emit(event, payload);
  }
}
