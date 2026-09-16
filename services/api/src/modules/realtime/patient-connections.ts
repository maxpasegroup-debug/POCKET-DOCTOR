import type { WebSocket } from 'ws';
import type { Principal, SessionVerifier } from '../auth/contracts.js';
import type { ReturnTypeOfDoctorEvent } from './types.js';

export const patientOnly = (p: Principal | null): p is Principal => !!p && p.roles.length === 1 && p.roles[0] === 'USER';
type Connection = { token: string; principal: Principal; alive: boolean };

export class PatientConnections {
  private readonly clients = new Map<WebSocket, Connection>();
  private checking = false;
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(private verifier: SessionVerifier, heartbeatMs = 30000) {
    this.timer = setInterval(() => { void this.heartbeat(); }, heartbeatMs);
    this.timer.unref();
  }
  get size() { return this.clients.size; }
  hasCapacity(userId: string) {
    return this.size < 1000 && [...this.clients.values()].filter(c => c.principal.userId === userId).length < 3;
  }
  add(socket: WebSocket, token: string, principal: Principal) {
    socket.on('error', () => this.remove(socket));
    socket.on('close', () => this.clients.delete(socket));
    socket.on('message', () => this.remove(socket)); // No client-selected roles/topics or commands.
    if (!this.hasCapacity(principal.userId)) { socket.close(1013, 'Connection limit'); return; }
    const connection = { token, principal, alive: true };
    this.clients.set(socket, connection);
    socket.on('pong', () => { connection.alive = true; });
    socket.send(JSON.stringify({ type: 'READY' }));
  }
  private remove(socket: WebSocket) { this.clients.delete(socket); socket.terminate(); }
  private async valid(socket: WebSocket, connection: Connection) {
    try {
      const current = await this.verifier.verify(connection.token);
      if (patientOnly(current) && current.sessionId === connection.principal.sessionId && this.clients.get(socket) === connection && socket.readyState === 1) return true;
    } catch { /* Database failures fail closed; REST/reconnect recover later. */ }
    this.remove(socket); return false;
  }
  disconnectToken(token: string) {
    for (const [socket, connection] of this.clients) if (connection.token === token) this.remove(socket);
  }
  async publish(event: ReturnTypeOfDoctorEvent) {
    const payload = JSON.stringify(event);
    // Bound database concurrency; slow consumers are disconnected, never queued indefinitely.
    const entries = [...this.clients];
    for (let i = 0; i < entries.length; i += 10) await Promise.all(entries.slice(i, i + 10).map(async ([socket, connection]) => {
      if (await this.valid(socket, connection)) {
        if (socket.bufferedAmount > 65536) { this.remove(socket); return; }
        socket.send(payload, error => { if (error) this.remove(socket); });
      }
    }));
  }
  async heartbeat() {
    if (this.checking) return;
    this.checking = true;
    try {
      for (const [socket, connection] of this.clients) {
        if (!connection.alive) { this.remove(socket); continue; }
        if (await this.valid(socket, connection)) { connection.alive = false; socket.ping(); }
      }
    } finally { this.checking = false; }
  }
  close() { clearInterval(this.timer); for (const socket of this.clients.keys()) this.remove(socket); }
}
