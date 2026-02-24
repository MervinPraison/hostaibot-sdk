/**
 * Gateway RPC method registration
 *
 * Registers 4 gateway methods via api.registerGatewayMethod():
 *   - pairing.list    — list pending pairing requests (replaces Docker pairing-handlers.ts)
 *   - pairing.approve — approve a pairing request (replaces Docker pairing-handlers.ts)
 *   - pairing.reject  — reject/note TTL expiry (replaces Docker pairing-handlers.ts)
 *   - hostaibot.status — plugin connection status
 */

import type { OpenClawPluginApi } from "./types.js";
import { SUPPORTED_PAIRING_CHANNELS, VERSION } from "./types.js";
import type { ControlPlaneClient } from "./control-plane-client.js";

/**
 * Register all gateway RPC methods on the plugin API.
 */
export function registerGatewayMethods(api: OpenClawPluginApi, client: ControlPlaneClient | null): void {
    // ── pairing.list ──
    // Exact parity with Docker's pairing-handlers.ts (216 lines → registerGatewayMethod)
    api.registerGatewayMethod("pairing.list", async ({ params, respond }) => {
        const p = params as { channel?: string; channels?: string[] } | undefined;

        let channelsToQuery: string[];
        if (p?.channel && typeof p.channel === "string") {
            channelsToQuery = [p.channel.toLowerCase()];
        } else if (p?.channels && Array.isArray(p.channels)) {
            channelsToQuery = p.channels.map((c) => String(c).toLowerCase());
        } else {
            channelsToQuery = [...SUPPORTED_PAIRING_CHANNELS];
        }

        // Validate channels
        const invalid = channelsToQuery.filter(
            (c) => !(SUPPORTED_PAIRING_CHANNELS as readonly string[]).includes(c),
        );
        if (invalid.length > 0) {
            respond(false, undefined, {
                code: -32600,
                message: `invalid channels: ${invalid.join(", ")}`,
            });
            return;
        }

        // Query pairing requests via runtime API
        const results: Record<string, { requests: unknown[]; error?: string }> = {};
        await Promise.all(
            channelsToQuery.map(async (channel) => {
                try {
                    const requests = await api.runtime.channel.pairing.readAllowFromStore(channel);
                    results[channel] = { requests: Array.isArray(requests) ? requests : [] };
                } catch (err) {
                    results[channel] = {
                        requests: [],
                        error: err instanceof Error ? err.message : String(err),
                    };
                }
            }),
        );

        respond(true, { channels: results });
    });

    // ── pairing.approve ──
    api.registerGatewayMethod("pairing.approve", async ({ params, respond, context }) => {
        const p = params as { channel?: string; code?: string } | undefined;

        if (!p?.channel || typeof p.channel !== "string") {
            respond(false, undefined, { code: -32600, message: "missing required param: channel" });
            return;
        }
        if (!p?.code || typeof p.code !== "string") {
            respond(false, undefined, { code: -32600, message: "missing required param: code" });
            return;
        }

        const channel = p.channel.toLowerCase();
        const code = p.code.toUpperCase();

        if (!(SUPPORTED_PAIRING_CHANNELS as readonly string[]).includes(channel)) {
            respond(false, undefined, { code: -32600, message: `invalid channel: ${channel}` });
            return;
        }

        try {
            const result = await api.runtime.channel.pairing.upsertPairingRequest(channel, code, "approve");

            if (!result) {
                respond(false, undefined, { code: -32600, message: "unknown pairing code" });
                return;
            }

            // Broadcast event for real-time updates
            context.broadcast(
                "channel.pair.resolved",
                { channel, code, decision: "approved", ts: Date.now() },
                { dropIfSlow: true },
            );

            respond(true, { approved: true, channel, code });
        } catch (err) {
            respond(false, undefined, {
                code: -32603,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    });

    // ── pairing.reject ──
    api.registerGatewayMethod("pairing.reject", async ({ params, respond }) => {
        const p = params as { channel?: string; code?: string } | undefined;

        if (!p?.channel || !p?.code) {
            respond(false, undefined, {
                code: -32600,
                message: "missing required params: channel, code",
            });
            return;
        }

        // OpenClaw doesn't have a reject function — requests expire after TTL
        respond(true, {
            rejected: false,
            channel: p.channel,
            code: p.code,
            note: "Pairing requests expire automatically after 1 hour. Manual rejection not supported.",
        });
    });

    // ── hostaibot.status ──
    api.registerGatewayMethod("hostaibot.status", async ({ respond }) => {
        respond(true, {
            version: VERSION,
            pluginId: "hostaibot",
            controlPlane: client?.status ?? { state: "disconnected" },
        });
    });
}
