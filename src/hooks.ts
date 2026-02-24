/**
 * Lifecycle hooks — replaces Docker's pairing-message.sh sed patches
 *
 * Hooks registered:
 *   - message_sending: Replace OpenClaw branding with HostAIBot branding
 *   - gateway_start: Log plugin activation
 *   - gateway_stop: Trigger graceful disconnect
 */

import type { OpenClawPluginApi, HostAIBotConfig } from "./types.js";
import type { ControlPlaneClient } from "./control-plane-client.js";

/**
 * Register lifecycle hooks on the plugin API.
 */
export function registerHooks(
    api: OpenClawPluginApi,
    config: HostAIBotConfig,
    client: ControlPlaneClient | null,
): void {
    // ── message_sending hook ──
    // Replaces pairing-message.sh which sed-patches 3 files:
    //   1. src/pairing/pairing-messages.ts
    //   2. src/telegram/bot-message-context.ts
    //   3. src/discord/monitor/agent-components.ts
    if (config.enableBranding) {
        api.on("message_sending", (event: unknown) => {
            const evt = event as { content?: string };
            if (evt.content) {
                // Replace "OpenClaw: access not configured." → "🤖 HostAIBot: Access pending approval."
                let modified = evt.content.replace(
                    /OpenClaw: access not configured\./g,
                    "🤖 HostAIBot: Access pending approval.",
                );

                // Replace "Ask the bot owner to approve with:" → dashboard link
                modified = modified.replace(
                    /Ask the bot owner to approve with:/g,
                    "Approve at: https://hostaibot.com/dashboard\nor in the Chat ask AI to run this command:",
                );

                // Replace Discord duplicate-request fallback
                modified = modified.replace(
                    /Pairing already requested\. Ask the bot owner to approve your code\./g,
                    "Pairing already requested. Go to https://hostaibot.com/dashboard to approve.",
                );

                if (modified !== evt.content) {
                    return { content: modified };
                }
            }
            return undefined;
        });
    }

    // ── gateway_start hook ──
    api.on("gateway_start", () => {
        api.logger.info("HostAIBot plugin activated");
    });

    // ── gateway_stop hook ──
    api.on("gateway_stop", () => {
        api.logger.info("HostAIBot plugin shutting down");
        client?.disconnect();
    });
}
