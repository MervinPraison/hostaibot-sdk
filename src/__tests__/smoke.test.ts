import { describe, it, expect, vi } from "vitest";
import register from "../index.js";
import type { OpenClawPluginApi, PluginService, PluginServiceContext } from "../types.js";

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

/**
 * Smoke test — verifies the plugin can be bootstrapped end-to-end
 * with a fully mocked OpenClaw API, including service start/stop.
 */
describe("smoke test", () => {
    function createSmokeApi() {
        const services: PluginService[] = [];
        const gatewayMethods: Map<string, Function> = new Map();
        const httpRoutes: Array<{ path: string; handler: Function }> = [];
        const hooks: Map<string, Function> = new Map();

        const api: OpenClawPluginApi & {
            services: PluginService[];
            gatewayMethods: Map<string, Function>;
            httpRoutes: typeof httpRoutes;
            hooks: Map<string, Function>;
        } = {
            id: "hostaibot",
            name: "HostAIBot",
            version: "0.0.1",
            source: "smoke-test",
            config: {},
            pluginConfig: {
                instanceToken: "tok_smoke",
                controlPlaneUrl: "https://smoke.hostaibot.com",
            },
            runtime: {
                channel: {
                    pairing: {
                        buildPairingReply: vi.fn().mockReturnValue("pairing reply"),
                        readAllowFromStore: vi.fn().mockResolvedValue([
                            { code: "ABCD1234", id: "1", createdAt: "2026-01-01" },
                        ]),
                        upsertPairingRequest: vi.fn().mockResolvedValue(true),
                    },
                },
            },
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
            registerGatewayMethod: (method: string, handler: Function) => { gatewayMethods.set(method, handler); },
            registerHttpRoute: (params: { path: string; handler: Function }) => { httpRoutes.push(params); },
            registerService: (service: PluginService) => { services.push(service); },
            on: (hookName: string, handler: Function) => { hooks.set(hookName, handler); },
            services,
            gatewayMethods,
            httpRoutes,
            hooks,
        };
        return api;
    }

    it("registers without errors", () => {
        const api = createSmokeApi();
        expect(() => register(api)).not.toThrow();
    });

    it("registers expected number of components", () => {
        const api = createSmokeApi();
        register(api);
        expect(api.services).toHaveLength(1);
        expect(api.gatewayMethods.size).toBe(4);
        expect(api.httpRoutes).toHaveLength(1);
        expect(api.hooks.size).toBe(3);
    });

    it("service can start and stop", async () => {
        const api = createSmokeApi();
        register(api);

        const service = api.services[0];
        const ctx: PluginServiceContext = {
            config: {},
            stateDir: "/tmp/smoke-test",
            logger: api.logger,
        };

        // Start
        await service.start(ctx);
        // Stop
        await service.stop?.(ctx);
        // No errors thrown
    });

    it("hostaibot.status returns expected shape", async () => {
        const api = createSmokeApi();
        register(api);

        const handler = api.gatewayMethods.get("hostaibot.status")!;
        let result: { ok: boolean; payload: unknown } | null = null;
        await handler({
            req: { type: "req", id: "1", method: "hostaibot.status", params: {} },
            params: {},
            respond: (ok: boolean, payload: unknown) => { result = { ok, payload }; },
            context: { broadcast: vi.fn() },
        });

        expect(result).not.toBeNull();
        expect(result!.ok).toBe(true);
        const payload = result!.payload as { version: string; pluginId: string };
        expect(payload.version).toBe("0.0.1");
        expect(payload.pluginId).toBe("hostaibot");
    });

    it("pairing.list returns data from runtime API", async () => {
        const api = createSmokeApi();
        register(api);

        const handler = api.gatewayMethods.get("pairing.list")!;
        let result: { ok: boolean; payload: unknown } | null = null;
        await handler({
            req: { type: "req", id: "1", method: "pairing.list", params: {} },
            params: { channel: "telegram" },
            respond: (ok: boolean, payload: unknown) => { result = { ok, payload }; },
            context: { broadcast: vi.fn() },
        });

        expect(result).not.toBeNull();
        expect(result!.ok).toBe(true);
    });
});
