import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerHooks } from "../hooks.js";
import type { OpenClawPluginApi, HostAIBotConfig } from "../types.js";

function createMockApi(): OpenClawPluginApi & { registeredHooks: Map<string, Function> } {
    const registeredHooks = new Map<string, Function>();
    return {
        id: "hostaibot",
        name: "HostAIBot",
        source: "test",
        config: {},
        pluginConfig: {},
        runtime: { channel: { pairing: { buildPairingReply: vi.fn(), readAllowFromStore: vi.fn(), upsertPairingRequest: vi.fn() } } },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        registerGatewayMethod: vi.fn(),
        registerHttpRoute: vi.fn(),
        registerService: vi.fn(),
        on: (hookName: string, handler: Function) => {
            registeredHooks.set(hookName, handler);
        },
        registeredHooks,
    };
}

const defaultConfig: HostAIBotConfig = {
    controlPlaneUrl: "https://hostaibot.com",
    instanceToken: "tok_test",
    heartbeatIntervalMs: 30_000,
    enableBranding: true,
};

describe("registerHooks", () => {
    let api: ReturnType<typeof createMockApi>;

    beforeEach(() => {
        api = createMockApi();
    });

    it("registers 3 hooks when branding is enabled", () => {
        registerHooks(api, defaultConfig, null);
        expect(api.registeredHooks.has("message_sending")).toBe(true);
        expect(api.registeredHooks.has("gateway_start")).toBe(true);
        expect(api.registeredHooks.has("gateway_stop")).toBe(true);
    });

    it("does not register message_sending hook when branding is disabled", () => {
        registerHooks(api, { ...defaultConfig, enableBranding: false }, null);
        expect(api.registeredHooks.has("message_sending")).toBe(false);
        expect(api.registeredHooks.has("gateway_start")).toBe(true);
        expect(api.registeredHooks.has("gateway_stop")).toBe(true);
    });

    describe("message_sending hook", () => {
        it("replaces OpenClaw branding with HostAIBot branding", () => {
            registerHooks(api, defaultConfig, null);
            const handler = api.registeredHooks.get("message_sending")!;
            const result = handler({ content: "OpenClaw: access not configured." });
            expect(result).toEqual({
                content: "🤖 HostAIBot: Access pending approval.",
            });
        });

        it("replaces 'Ask the bot owner' instruction", () => {
            registerHooks(api, defaultConfig, null);
            const handler = api.registeredHooks.get("message_sending")!;
            const result = handler({ content: "Ask the bot owner to approve with:" });
            expect(result).toEqual({
                content: expect.stringContaining("https://hostaibot.com/dashboard"),
            });
        });

        it("replaces Discord duplicate-request fallback", () => {
            registerHooks(api, defaultConfig, null);
            const handler = api.registeredHooks.get("message_sending")!;
            const result = handler({
                content: "Pairing already requested. Ask the bot owner to approve your code.",
            });
            expect(result).toEqual({
                content: "Pairing already requested. Go to https://hostaibot.com/dashboard to approve.",
            });
        });

        it("passes through non-matching messages unchanged", () => {
            registerHooks(api, defaultConfig, null);
            const handler = api.registeredHooks.get("message_sending")!;
            const result = handler({ content: "Hello, world!" });
            expect(result).toBeUndefined();
        });

        it("handles messages without content", () => {
            registerHooks(api, defaultConfig, null);
            const handler = api.registeredHooks.get("message_sending")!;
            const result = handler({});
            expect(result).toBeUndefined();
        });
    });

    describe("gateway hooks", () => {
        it("gateway_start logs activation", () => {
            registerHooks(api, defaultConfig, null);
            const handler = api.registeredHooks.get("gateway_start")!;
            handler();
            expect(api.logger.info).toHaveBeenCalledWith("HostAIBot plugin activated");
        });

        it("gateway_stop logs shutdown and disconnects client", () => {
            const mockClient = { disconnect: vi.fn() };
            registerHooks(api, defaultConfig, mockClient as any);
            const handler = api.registeredHooks.get("gateway_stop")!;
            handler();
            expect(api.logger.info).toHaveBeenCalledWith("HostAIBot plugin shutting down");
            expect(mockClient.disconnect).toHaveBeenCalled();
        });
    });
});
