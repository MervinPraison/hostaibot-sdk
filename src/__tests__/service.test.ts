import { describe, it, expect, vi, beforeEach } from "vitest";
import { createService } from "../service.js";
import type { HostAIBotConfig, PluginLogger, PluginServiceContext } from "../types.js";

// Mock the ws module before any imports that use it
vi.mock("ws", () => ({
    default: vi.fn().mockImplementation(() => ({
        on: vi.fn(),
        send: vi.fn(),
        close: vi.fn(),
        removeAllListeners: vi.fn(),
        readyState: 3,
    })),
    __esModule: true,
}));

const mockConfig: HostAIBotConfig = {
    controlPlaneUrl: "https://api.hostaibot.com",
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

describe("createService", () => {
    let tmpDir: string;

    beforeEach(() => {
        vi.clearAllMocks();
        tmpDir = "/tmp/hostaibot-test-service";
    });

    it("returns service with correct id", () => {
        const { service } = createService(mockConfig, mockLogger);
        expect(service.id).toBe("hostaibot");
    });

    it("returns service with start and stop methods", () => {
        const { service } = createService(mockConfig, mockLogger);
        expect(typeof service.start).toBe("function");
        expect(typeof service.stop).toBe("function");
    });

    it("getComponents returns null before start", () => {
        const { getComponents } = createService(mockConfig, mockLogger);
        expect(getComponents()).toBeNull();
    });

    it("start creates components", async () => {
        const { service, getComponents } = createService(mockConfig, mockLogger);
        const ctx: PluginServiceContext = {
            config: {},
            stateDir: tmpDir,
            logger: mockLogger,
        };
        await service.start(ctx);

        const components = getComponents();
        expect(components).not.toBeNull();
        expect(components!.client).toBeDefined();
        expect(components!.watcher).toBeDefined();

        // Cleanup
        await service.stop?.(ctx);
    });

    it("stop cleans up components", async () => {
        const { service, getComponents } = createService(mockConfig, mockLogger);
        const ctx: PluginServiceContext = {
            config: {},
            stateDir: tmpDir,
            logger: mockLogger,
        };
        await service.start(ctx);
        expect(getComponents()).not.toBeNull();

        await service.stop?.(ctx);
        expect(getComponents()).toBeNull();
    });

    it("skips connection when no instance token", async () => {
        const noTokenConfig = { ...mockConfig, instanceToken: "" };
        const { service } = createService(noTokenConfig, mockLogger);
        const ctx: PluginServiceContext = {
            config: {},
            stateDir: tmpDir,
            logger: mockLogger,
        };
        await service.start(ctx);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining("No instance token"),
        );
        await service.stop?.(ctx);
    });
});
