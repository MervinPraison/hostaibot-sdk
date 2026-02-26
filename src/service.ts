/**
 * Plugin service factory — creates the OpenClaw plugin service
 *
 * Replaces: start-with-watcher.sh (launches watcher + gateway)
 * The service auto-starts the control plane client and pairing watcher.
 */

import type { HostAIBotConfig, PluginService, PluginServiceContext, PluginLogger } from "./types.js";
import { ControlPlaneClient } from "./control-plane-client.js";
import { PairingWatcher } from "./pairing-watcher.js";

export interface ServiceComponents {
    client: ControlPlaneClient;
    watcher: PairingWatcher;
}

/**
 * Create the HostAIBot plugin service.
 * Returns the service definition and a reference getter for the started components.
 */
export function createService(
    config: HostAIBotConfig,
    logger: PluginLogger,
): { service: PluginService; getComponents: () => ServiceComponents | null } {
    let components: ServiceComponents | null = null;

    const service: PluginService = {
        id: "hostaibot",
        start: async (ctx: PluginServiceContext) => {
            const credentialsDir = ctx.stateDir
                ? `${ctx.stateDir}/credentials`
                : "/data/credentials";

            // Create control plane client
            const client = new ControlPlaneClient(config, ctx.logger);

            // Create pairing watcher
            const watcher = new PairingWatcher(credentialsDir, ctx.logger);
            watcher.onEvent((event) => {
                ctx.logger.info(`[EVENT] ${JSON.stringify(event)}`);
            });

            // Start both
            if (config.instanceToken) {
                client.connect();
            } else {
                ctx.logger.warn(
                    "No instance token configured — control plane connection skipped. " +
                    "Set HOSTAIBOT_INSTANCE_TOKEN or configure instanceToken in plugin config.",
                );
            }
            watcher.start();

            components = { client, watcher };
        },
        stop: async (_ctx: PluginServiceContext) => {
            if (components) {
                components.client.disconnect();
                components.watcher.stop();
                components = null;
            }
        },
    };

    return {
        service,
        getComponents: () => components,
    };
}
