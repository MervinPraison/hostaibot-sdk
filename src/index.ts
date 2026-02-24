/**
 * HostAIBot — OpenClaw Plugin Entry Point
 *
 * This is the main plugin module. When OpenClaw loads this plugin via JITI,
 * it calls the default export with the plugin API. This function registers
 * all components:
 *
 *   - Service: control plane WS client + pairing file watcher
 *   - Gateway methods: pairing.list, pairing.approve, pairing.reject, hostaibot.status
 *   - HTTP routes: webhook endpoint for push commands
 *   - Hooks: branding replacement, lifecycle logging
 *
 * Replaces all Docker patches and sidecar scripts with zero upstream touch points.
 */

import type { OpenClawPluginApi, HostAIBotRawConfig } from "./types.js";
import { VERSION } from "./types.js";
import { resolveConfig, validateConfig } from "./config.js";
import { createService } from "./service.js";
import { registerGatewayMethods } from "./gateway-methods.js";
import { registerHttpRoutes } from "./http-routes.js";
import { registerHooks } from "./hooks.js";

export { VERSION } from "./types.js";
export { resolveConfig, validateConfig } from "./config.js";
export { ControlPlaneClient } from "./control-plane-client.js";
export { PairingWatcher } from "./pairing-watcher.js";

/**
 * Plugin registration function.
 * Called by OpenClaw's JITI loader with the plugin API.
 */
export default function register(api: OpenClawPluginApi): void {
    // Resolve config: pluginConfig > env vars > defaults
    const rawConfig = api.pluginConfig as HostAIBotRawConfig | undefined;
    const config = resolveConfig(rawConfig, process.env);

    // Validate config
    const validation = validateConfig(config);
    if (!validation.ok) {
        for (const err of validation.errors) {
            api.logger.warn(`Config: ${err.field} — ${err.message}`);
        }
        // Continue with defaults — service will skip connection if no token
    }

    // Create service (control plane client + pairing watcher)
    const { service, getComponents } = createService(config, api.logger);

    // Register service
    api.registerService(service);

    // Register gateway methods (deferred client access via getComponents)
    // The client is only available after start(), so methods use getComponents()
    registerGatewayMethods(api, null);

    // Register HTTP routes (webhook)
    const webhookSecret = config.instanceToken; // Use instance token as webhook HMAC secret
    registerHttpRoutes(api, null, webhookSecret);

    // Register hooks (branding, lifecycle)
    registerHooks(api, config, null);

    api.logger.info(`HostAIBot plugin v${VERSION} registered`);
}
