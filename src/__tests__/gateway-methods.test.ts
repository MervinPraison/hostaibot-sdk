import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerGatewayMethods } from "../gateway-methods.js";
import type { OpenClawPluginApi, GatewayRespondFn, GatewayRequestContext } from "../types.js";

function createMockApi(): OpenClawPluginApi & { registeredMethods: Map<string, Function> } {
    const registeredMethods = new Map<string, Function>();
    return {
        id: "hostaibot",
        name: "HostAIBot",
        version: "0.0.1",
        source: "test",
        config: {},
        pluginConfig: {},
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
        registerGatewayMethod: (method: string, handler: Function) => {
            registeredMethods.set(method, handler);
        },
        registerHttpRoute: vi.fn(),
        registerService: vi.fn(),
        on: vi.fn(),
        registeredMethods,
    };
}

function createRespondFn(): GatewayRespondFn & { calls: Array<{ ok: boolean; payload: unknown; error: unknown }> } {
    const calls: Array<{ ok: boolean; payload: unknown; error: unknown }> = [];
    const fn = ((ok: boolean, payload: unknown, error?: unknown) => {
        calls.push({ ok, payload, error });
    }) as GatewayRespondFn & { calls: typeof calls };
    fn.calls = calls;
    return fn;
}

describe("registerGatewayMethods", () => {
    let api: ReturnType<typeof createMockApi>;

    beforeEach(() => {
        api = createMockApi();
        registerGatewayMethods(api, null);
    });

    it("registers 4 gateway methods", () => {
        expect(api.registeredMethods.size).toBe(4);
        expect(api.registeredMethods.has("pairing.list")).toBe(true);
        expect(api.registeredMethods.has("pairing.approve")).toBe(true);
        expect(api.registeredMethods.has("pairing.reject")).toBe(true);
        expect(api.registeredMethods.has("hostaibot.status")).toBe(true);
    });

    describe("pairing.list", () => {
        it("queries all channels when no params given", async () => {
            const respond = createRespondFn();
            const handler = api.registeredMethods.get("pairing.list")!;
            await handler({
                req: { type: "req", id: "1", method: "pairing.list", params: {} },
                params: {},
                respond,
                context: { broadcast: vi.fn() },
            });
            expect(respond.calls[0].ok).toBe(true);
            const payload = respond.calls[0].payload as { channels: Record<string, unknown> };
            expect(Object.keys(payload.channels)).toHaveLength(15);
        });

        it("queries a single channel when specified", async () => {
            const respond = createRespondFn();
            const handler = api.registeredMethods.get("pairing.list")!;
            await handler({
                req: { type: "req", id: "1", method: "pairing.list", params: {} },
                params: { channel: "telegram" },
                respond,
                context: { broadcast: vi.fn() },
            });
            expect(respond.calls[0].ok).toBe(true);
            const payload = respond.calls[0].payload as { channels: Record<string, unknown> };
            expect(Object.keys(payload.channels)).toEqual(["telegram"]);
        });

        it("rejects invalid channels", async () => {
            const respond = createRespondFn();
            const handler = api.registeredMethods.get("pairing.list")!;
            await handler({
                req: { type: "req", id: "1", method: "pairing.list", params: {} },
                params: { channel: "invalid_channel" },
                respond,
                context: { broadcast: vi.fn() },
            });
            expect(respond.calls[0].ok).toBe(false);
        });
    });

    describe("pairing.approve", () => {
        it("approves and broadcasts event", async () => {
            const respond = createRespondFn();
            const broadcast = vi.fn();
            const handler = api.registeredMethods.get("pairing.approve")!;
            await handler({
                req: { type: "req", id: "1", method: "pairing.approve", params: {} },
                params: { channel: "telegram", code: "ABCD1234" },
                respond,
                context: { broadcast },
            });
            expect(respond.calls[0].ok).toBe(true);
            expect(broadcast).toHaveBeenCalledWith(
                "channel.pair.resolved",
                expect.objectContaining({ channel: "telegram", code: "ABCD1234", decision: "approved" }),
                { dropIfSlow: true },
            );
        });

        it("rejects missing channel param", async () => {
            const respond = createRespondFn();
            const handler = api.registeredMethods.get("pairing.approve")!;
            await handler({
                req: { type: "req", id: "1", method: "pairing.approve", params: {} },
                params: { code: "ABCD1234" },
                respond,
                context: { broadcast: vi.fn() },
            });
            expect(respond.calls[0].ok).toBe(false);
        });

        it("rejects missing code param", async () => {
            const respond = createRespondFn();
            const handler = api.registeredMethods.get("pairing.approve")!;
            await handler({
                req: { type: "req", id: "1", method: "pairing.approve", params: {} },
                params: { channel: "telegram" },
                respond,
                context: { broadcast: vi.fn() },
            });
            expect(respond.calls[0].ok).toBe(false);
        });
    });

    describe("pairing.reject", () => {
        it("returns TTL-based note", async () => {
            const respond = createRespondFn();
            const handler = api.registeredMethods.get("pairing.reject")!;
            await handler({
                req: { type: "req", id: "1", method: "pairing.reject", params: {} },
                params: { channel: "telegram", code: "ABCD1234" },
                respond,
                context: { broadcast: vi.fn() },
            });
            expect(respond.calls[0].ok).toBe(true);
            const payload = respond.calls[0].payload as { note: string };
            expect(payload.note).toContain("expire automatically");
        });
    });

    describe("hostaibot.status", () => {
        it("returns plugin status", async () => {
            const respond = createRespondFn();
            const handler = api.registeredMethods.get("hostaibot.status")!;
            await handler({
                req: { type: "req", id: "1", method: "hostaibot.status", params: {} },
                params: {},
                respond,
                context: { broadcast: vi.fn() },
            });
            expect(respond.calls[0].ok).toBe(true);
            const payload = respond.calls[0].payload as { version: string; pluginId: string };
            expect(payload.version).toBe("0.0.1");
            expect(payload.pluginId).toBe("hostaibot");
        });
    });
});
