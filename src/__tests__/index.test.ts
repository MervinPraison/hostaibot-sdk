import { describe, it, expect, vi } from "vitest";
import register from "../index.js";
import type { OpenClawPluginApi } from "../types.js";

// Mock ws module
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

function createFullMockApi(): OpenClawPluginApi & {
    services: Array<{ id: string }>;
    gatewayMethods: string[];
    httpRoutes: string[];
    hooks: string[];
} {
    const services: Array<{ id: string }> = [];
    const gatewayMethods: string[] = [];
    const httpRoutes: string[] = [];
    const hooks: string[] = [];

    return {
        id: "hostaibot",
        name: "HostAIBot",
        version: "0.0.1",
        source: "test",
        config: {},
        pluginConfig: {
            instanceToken: "tok_integration_test",
        },
        runtime: {
            channel: {
                pairing: {
                    buildPairingReply: vi.fn(),
                    readAllowFromStore: vi.fn().mockResolvedValue([]),
                    upsertPairingRequest: vi.fn().mockResolvedValue(true),
                },
            },
        },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        registerGatewayMethod: (method: string) => { gatewayMethods.push(method); },
        registerHttpRoute: (params: { path: string }) => { httpRoutes.push(params.path); },
        registerService: (service: { id: string }) => { services.push(service); },
        on: (hookName: string) => { hooks.push(hookName); },
        services,
        gatewayMethods,
        httpRoutes,
        hooks,
    };
}

describe("register (integration)", () => {
    it("registers all expected components", () => {
        const api = createFullMockApi();
        register(api);

        // 1 service
        expect(api.services).toHaveLength(1);
        expect(api.services[0].id).toBe("hostaibot");

        // 4 gateway methods
        expect(api.gatewayMethods).toHaveLength(4);
        expect(api.gatewayMethods).toContain("pairing.list");
        expect(api.gatewayMethods).toContain("pairing.approve");
        expect(api.gatewayMethods).toContain("pairing.reject");
        expect(api.gatewayMethods).toContain("hostaibot.status");

        // 1 HTTP route
        expect(api.httpRoutes).toHaveLength(1);
        expect(api.httpRoutes[0]).toBe("/api/hostaibot/webhook");

        // 3 hooks (branding enabled by default)
        expect(api.hooks).toHaveLength(3);
        expect(api.hooks).toContain("message_sending");
        expect(api.hooks).toContain("gateway_start");
        expect(api.hooks).toContain("gateway_stop");
    });

    it("works with minimal config (only required fields)", () => {
        const api = createFullMockApi();
        api.pluginConfig = { instanceToken: "tok_min" };
        expect(() => register(api)).not.toThrow();
        expect(api.services).toHaveLength(1);
    });

    it("works with full config", () => {
        const api = createFullMockApi();
        api.pluginConfig = {
            controlPlaneUrl: "https://custom.hostaibot.com",
            instanceToken: "tok_full",
            heartbeatIntervalMs: 15000,
            enableBranding: true,
        };
        expect(() => register(api)).not.toThrow();
        expect(api.services).toHaveLength(1);
        expect(api.gatewayMethods).toHaveLength(4);
    });

    it("skips branding hook when enableBranding is false", () => {
        const api = createFullMockApi();
        api.pluginConfig = {
            instanceToken: "tok_no_brand",
            enableBranding: false,
        };
        register(api);
        expect(api.hooks).not.toContain("message_sending");
        // gateway_start and gateway_stop still registered
        expect(api.hooks).toHaveLength(2);
    });

    it("logs version on registration", () => {
        const api = createFullMockApi();
        register(api);
        expect(api.logger.info).toHaveBeenCalledWith(
            expect.stringContaining("v0.0.1"),
        );
    });
});
