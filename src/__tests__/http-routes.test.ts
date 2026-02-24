import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerHttpRoutes } from "../http-routes.js";
import { signPayload } from "../hmac.js";
import type { OpenClawPluginApi } from "../types.js";
import type { IncomingMessage, ServerResponse } from "node:http";

function createMockApi(): OpenClawPluginApi & { registeredRoutes: Array<{ path: string; handler: Function }> } {
    const registeredRoutes: Array<{ path: string; handler: Function }> = [];
    return {
        id: "hostaibot",
        name: "HostAIBot",
        source: "test",
        config: {},
        pluginConfig: {},
        runtime: { channel: { pairing: { buildPairingReply: vi.fn(), readAllowFromStore: vi.fn(), upsertPairingRequest: vi.fn() } } },
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        registerGatewayMethod: vi.fn(),
        registerHttpRoute: (params: { path: string; handler: Function }) => {
            registeredRoutes.push(params);
        },
        registerService: vi.fn(),
        on: vi.fn(),
        registeredRoutes,
    };
}

function createMockReq(method: string, headers: Record<string, string> = {}): IncomingMessage {
    const chunks: Buffer[] = [];
    return {
        method,
        headers,
        [Symbol.asyncIterator]: async function* () {
            for (const chunk of chunks) yield chunk;
        },
        _pushBody(data: string) {
            chunks.push(Buffer.from(data));
        },
    } as unknown as IncomingMessage & { _pushBody: (data: string) => void };
}

function createMockRes(): ServerResponse & { _status: number; _body: string } {
    let status = 200;
    let body = "";
    const res = {
        writeHead: (s: number) => { status = s; },
        end: (b: string) => { body = b; },
        get _status() { return status; },
        get _body() { return body; },
    };
    return res as unknown as ServerResponse & { _status: number; _body: string };
}

describe("registerHttpRoutes", () => {
    let api: ReturnType<typeof createMockApi>;

    beforeEach(() => {
        api = createMockApi();
        registerHttpRoutes(api, null, "test-secret");
    });

    it("registers webhook route at correct path", () => {
        expect(api.registeredRoutes).toHaveLength(1);
        expect(api.registeredRoutes[0].path).toBe("/api/hostaibot/webhook");
    });

    it("rejects non-POST requests", async () => {
        const handler = api.registeredRoutes[0].handler;
        const req = createMockReq("GET");
        const res = createMockRes();
        await handler(req, res);
        expect(res._status).toBe(405);
    });

    it("rejects missing signature", async () => {
        const handler = api.registeredRoutes[0].handler;
        const body = JSON.stringify({ type: "status" });
        const req = createMockReq("POST", {}) as IncomingMessage & { _pushBody: (data: string) => void };
        (req as any)._pushBody(body);
        const res = createMockRes();
        await handler(req, res);
        expect(res._status).toBe(401);
    });

    it("rejects invalid signature", async () => {
        const handler = api.registeredRoutes[0].handler;
        const body = JSON.stringify({ type: "status" });
        const req = createMockReq("POST", { "x-hostaibot-signature": "invalid" }) as IncomingMessage & { _pushBody: (data: string) => void };
        (req as any)._pushBody(body);
        const res = createMockRes();
        await handler(req, res);
        expect(res._status).toBe(401);
    });

    it("accepts valid signature", async () => {
        const handler = api.registeredRoutes[0].handler;
        const body = JSON.stringify({ type: "status" });
        const signature = signPayload("test-secret", body);
        const req = createMockReq("POST", { "x-hostaibot-signature": signature }) as IncomingMessage & { _pushBody: (data: string) => void };
        (req as any)._pushBody(body);
        const res = createMockRes();
        await handler(req, res);
        expect(res._status).toBe(200);
    });
});
