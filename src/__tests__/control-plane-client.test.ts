import { describe, it, expect, vi, beforeEach } from "vitest";
import { ControlPlaneClient } from "../control-plane-client.js";
import type { HostAIBotConfig, PluginLogger } from "../types.js";

// Mock the ws module
vi.mock("ws", () => {
    return {
        default: vi.fn().mockImplementation(() => ({
            on: vi.fn(),
            send: vi.fn(),
            close: vi.fn(),
            removeAllListeners: vi.fn(),
            readyState: 3, // CLOSED
        })),
        __esModule: true,
    };
});

const mockConfig: HostAIBotConfig = {
    controlPlaneUrl: "https://hostaibot.com",
    instanceToken: "tok_test",
    heartbeatIntervalMs: 30_000,
    enableBranding: true,
};

const mockLogger: PluginLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};

describe("ControlPlaneClient", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("initializes with disconnected state", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        expect(client.status.state).toBe("disconnected");
        expect(client.status.connectedAt).toBeNull();
        expect(client.status.lastHeartbeat).toBeNull();
        expect(client.status.reconnectAttempts).toBe(0);
    });

    it("reports version in status", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        expect(client.status.version).toBe("0.0.1");
    });

    it("calculates exponential backoff delays", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        // Access the method via type assertion for testing
        const getDelay = (client as unknown as { getReconnectDelay: () => number }).getReconnectDelay.bind(client);

        // Initial: 1000 * 2^0 = 1000
        expect(getDelay()).toBe(1000);
    });

    it("caps reconnect delay at 30s", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        // Manually set reconnect attempts to a high value
        (client as unknown as { reconnectAttempts: number }).reconnectAttempts = 10;
        const getDelay = (client as unknown as { getReconnectDelay: () => number }).getReconnectDelay.bind(client);
        expect(getDelay()).toBe(30_000);
    });

    it("registers message handlers", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        const handler = vi.fn();
        client.onMessage(handler);
        // Handler is registered (internal test — would fire on WS message)
        expect(() => client.onMessage(handler)).not.toThrow();
    });

    it("registers status change handlers", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        const handler = vi.fn();
        client.onStatusChange(handler);
        expect(() => client.onStatusChange(handler)).not.toThrow();
    });

    it("disconnect sets state to disconnected", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        client.disconnect();
        expect(client.status.state).toBe("disconnected");
    });

    it("disconnect is idempotent", () => {
        const client = new ControlPlaneClient(mockConfig, mockLogger);
        client.disconnect();
        client.disconnect();
        expect(client.status.state).toBe("disconnected");
    });
});
