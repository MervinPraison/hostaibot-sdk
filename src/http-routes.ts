/**
 * HTTP route registration — webhook endpoint for push commands from hostaibot.com
 *
 * Registers: POST /api/hostaibot/webhook
 * Authentication: HMAC-SHA256 signature in X-HostAIBot-Signature header
 */

import type { OpenClawPluginApi, PluginLogger } from "./types.js";
import type { ControlPlaneClient } from "./control-plane-client.js";
import { verifySignature } from "./hmac.js";

/**
 * Register HTTP routes on the plugin API.
 */
export function registerHttpRoutes(
    api: OpenClawPluginApi,
    client: ControlPlaneClient | null,
    webhookSecret: string,
): void {
    api.registerHttpRoute({
        path: "/api/hostaibot/webhook",
        handler: async (req, res) => {
            // Only accept POST
            if (req.method !== "POST") {
                res.writeHead(405, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Method not allowed" }));
                return;
            }

            // Read body
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
                chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
            const body = Buffer.concat(chunks).toString("utf-8");

            // Verify HMAC signature
            const signature = req.headers["x-hostaibot-signature"] as string | undefined;
            if (!signature || !verifySignature(webhookSecret, body, signature)) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid signature" }));
                return;
            }

            // Parse and process command
            try {
                const command = JSON.parse(body) as { type: string; payload?: Record<string, unknown> };
                api.logger.info(`Webhook received: ${command.type}`);

                // Handle known command types
                switch (command.type) {
                    case "reconnect":
                        client?.reconnect();
                        break;
                    case "status":
                        // Status is returned in the response
                        break;
                    default:
                        api.logger.warn(`Unknown webhook command: ${command.type}`);
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        ok: true,
                        status: client?.status ?? { state: "disconnected" },
                    }),
                );
            } catch {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid JSON body" }));
            }
        },
    });
}
