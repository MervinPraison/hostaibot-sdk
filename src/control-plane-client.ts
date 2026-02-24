/**
 * Control Plane WebSocket Client
 *
 * Maintains a persistent WebSocket connection to hostaibot.com.
 * Features:
 *   - Exponential backoff reconnection (1s → 30s max)
 *   - Configurable heartbeat
 *   - Event emitter pattern for status changes
 *   - Graceful shutdown with drain
 */

import WebSocket from "ws";
import type {
    HostAIBotConfig,
    HostAIBotStatus,
    ConnectionState,
    ControlPlaneMessage,
    HeartbeatPayload,
    PluginLogger,
} from "./types.js";
import { VERSION } from "./types.js";

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export type MessageHandler = (message: ControlPlaneMessage) => void;
export type StatusChangeHandler = (state: ConnectionState) => void;

export class ControlPlaneClient {
    private ws: WebSocket | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectAttempts = 0;
    private connectedAt: number | null = null;
    private lastHeartbeat: number | null = null;
    private state: ConnectionState = "disconnected";
    private shouldReconnect = true;
    private messageHandlers: MessageHandler[] = [];
    private statusHandlers: StatusChangeHandler[] = [];

    constructor(
        private readonly config: HostAIBotConfig,
        private readonly logger: PluginLogger,
    ) { }

    // ── Public API ──

    get status(): HostAIBotStatus {
        return {
            state: this.state,
            connectedAt: this.connectedAt,
            lastHeartbeat: this.lastHeartbeat,
            reconnectAttempts: this.reconnectAttempts,
            version: VERSION,
        };
    }

    onMessage(handler: MessageHandler): void {
        this.messageHandlers.push(handler);
    }

    onStatusChange(handler: StatusChangeHandler): void {
        this.statusHandlers.push(handler);
    }

    connect(): void {
        if (this.state === "connected" || this.state === "connecting") {
            return;
        }
        this.shouldReconnect = true;
        this.doConnect();
    }

    disconnect(): void {
        this.shouldReconnect = false;
        this.cleanup();
        this.setState("disconnected");
    }

    reconnect(): void {
        this.cleanup();
        this.reconnectAttempts = 0;
        this.doConnect();
    }

    // ── Internal ──

    private doConnect(): void {
        this.setState("connecting");
        try {
            const wsUrl = this.config.controlPlaneUrl.replace(/^http/, "ws");
            const url = `${wsUrl}/ws/instance?token=${encodeURIComponent(this.config.instanceToken)}`;
            this.ws = new WebSocket(url);

            this.ws.on("open", () => {
                this.reconnectAttempts = 0;
                this.connectedAt = Date.now();
                this.setState("connected");
                this.startHeartbeat();
                this.logger.info("Connected to HostAIBot control plane");
            });

            this.ws.on("message", (data) => {
                try {
                    const message = JSON.parse(data.toString()) as ControlPlaneMessage;
                    for (const handler of this.messageHandlers) {
                        handler(message);
                    }
                } catch (err) {
                    this.logger.error(`Failed to parse control plane message: ${err}`);
                }
            });

            this.ws.on("close", () => {
                this.stopHeartbeat();
                if (this.shouldReconnect) {
                    this.scheduleReconnect();
                } else {
                    this.setState("disconnected");
                }
            });

            this.ws.on("error", (err) => {
                this.logger.error(`Control plane WebSocket error: ${err.message}`);
            });
        } catch (err) {
            this.logger.error(`Failed to connect to control plane: ${err}`);
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }
        }
    }

    private scheduleReconnect(): void {
        this.setState("reconnecting");
        const delay = this.getReconnectDelay();
        this.reconnectAttempts++;
        this.logger.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.doConnect();
        }, delay);
    }

    /** Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s → 30s ... */
    getReconnectDelay(): number {
        const base = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
        return Math.min(base, MAX_RECONNECT_DELAY_MS);
    }

    private startHeartbeat(): void {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                const payload: HeartbeatPayload = {
                    instanceToken: this.config.instanceToken,
                    uptime: this.connectedAt ? Date.now() - this.connectedAt : 0,
                    version: VERSION,
                    channels: [],
                };
                this.ws.send(JSON.stringify({ type: "heartbeat", payload, ts: Date.now() }));
                this.lastHeartbeat = Date.now();
            }
        }, this.config.heartbeatIntervalMs);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private cleanup(): void {
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                this.ws.close();
            }
            this.ws = null;
        }
        this.connectedAt = null;
        this.lastHeartbeat = null;
    }

    private setState(newState: ConnectionState): void {
        if (this.state !== newState) {
            this.state = newState;
            for (const handler of this.statusHandlers) {
                handler(newState);
            }
        }
    }
}
