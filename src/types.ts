/**
 * HostAIBot SDK — Type definitions
 *
 * Provides types for the plugin, config, control plane protocol, and
 * minimal OpenClaw plugin API types (peer/runtime dependency).
 */

// ============================================================================
// Plugin Config
// ============================================================================

export interface HostAIBotConfig {
    controlPlaneUrl: string;
    instanceToken: string;
    heartbeatIntervalMs: number;
    enableBranding: boolean;
}

export interface HostAIBotRawConfig {
    controlPlaneUrl?: string;
    instanceToken?: string;
    heartbeatIntervalMs?: number;
    enableBranding?: boolean;
}

// ============================================================================
// Connection Status
// ============================================================================

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export interface HostAIBotStatus {
    state: ConnectionState;
    connectedAt: number | null;
    lastHeartbeat: number | null;
    reconnectAttempts: number;
    version: string;
}

// ============================================================================
// Control Plane Protocol
// ============================================================================

export interface ControlPlaneMessage {
    type: string;
    payload: Record<string, unknown>;
    ts: number;
}

export interface HeartbeatPayload {
    instanceToken: string;
    uptime: number;
    version: string;
    channels: string[];
}

// ============================================================================
// Pairing
// ============================================================================

export const SUPPORTED_PAIRING_CHANNELS = [
    "telegram",
    "discord",
    "slack",
    "whatsapp",
    "signal",
    "imessage",
    "matrix",
    "msteams",
    "line",
    "nostr",
    "googlechat",
    "messenger",
    "instagram",
    "twitter",
    "linkedin",
] as const;

export type SupportedChannel = (typeof SUPPORTED_PAIRING_CHANNELS)[number];

export interface PairingRequest {
    code: string;
    id?: string;
    createdAt?: string;
    meta?: Record<string, unknown>;
}

export interface PairingEvent {
    event: string;
    payload: Record<string, unknown>;
    ts: number;
}

// ============================================================================
// Minimal OpenClaw Plugin API types (peer dependency — not bundled)
// These mirror the real types from openclaw/src/plugins/types.ts
// ============================================================================

export interface PluginLogger {
    debug?: (message: string) => void;
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
}

export interface PluginServiceContext {
    config: Record<string, unknown>;
    workspaceDir?: string;
    stateDir: string;
    logger: PluginLogger;
}

export interface PluginService {
    id: string;
    start: (ctx: PluginServiceContext) => void | Promise<void>;
    stop?: (ctx: PluginServiceContext) => void | Promise<void>;
}

export interface GatewayRespondFn {
    (ok: true, payload: unknown, error?: undefined): void;
    (ok: false, payload: undefined, error: { code: number; message: string }): void;
}

export interface GatewayRequestContext {
    broadcast: (
        event: string,
        payload: Record<string, unknown>,
        opts?: { dropIfSlow?: boolean },
    ) => void;
}

export interface GatewayMethodOpts {
    req: { type: string; id: string; method: string; params: Record<string, unknown> };
    params: Record<string, unknown>;
    respond: GatewayRespondFn;
    context: GatewayRequestContext;
}

export type GatewayRequestHandler = (opts: GatewayMethodOpts) => Promise<void> | void;

export interface HttpRouteHandler {
    (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void | Promise<void>;
}

export interface PluginRuntime {
    channel: {
        pairing: {
            buildPairingReply: (...args: unknown[]) => string;
            readAllowFromStore: (channel: string) => Promise<unknown>;
            upsertPairingRequest: (...args: unknown[]) => Promise<unknown>;
        };
    };
}

export interface OpenClawPluginApi {
    id: string;
    name: string;
    version?: string;
    description?: string;
    source: string;
    config: Record<string, unknown>;
    pluginConfig?: Record<string, unknown>;
    runtime: PluginRuntime;
    logger: PluginLogger;
    registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;
    registerHttpRoute: (params: { path: string; handler: HttpRouteHandler }) => void;
    registerService: (service: PluginService) => void;
    on: (hookName: string, handler: (...args: unknown[]) => unknown, opts?: { priority?: number }) => void;
}

// ============================================================================
// Module version (synced with package.json)
// ============================================================================

export const VERSION = "0.0.1";
