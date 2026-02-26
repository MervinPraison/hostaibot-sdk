/**
 * Config resolution — merges OpenClaw pluginConfig with process.env fallbacks.
 */

import type { HostAIBotConfig, HostAIBotRawConfig } from "./types.js";

const DEFAULTS: HostAIBotConfig = {
    controlPlaneUrl: "https://hostaibot.com",
    instanceToken: "",
    heartbeatIntervalMs: 30_000,
    enableBranding: true,
};

export interface ConfigValidationError {
    field: string;
    message: string;
}

export interface ConfigResult {
    ok: true;
    config: HostAIBotConfig;
}

export interface ConfigError {
    ok: false;
    errors: ConfigValidationError[];
}

/**
 * Resolve config by merging:
 *   1. Explicit pluginConfig values (highest priority)
 *   2. Environment variables (fallback)
 *   3. Default values (lowest priority)
 */
export function resolveConfig(
    pluginConfig: HostAIBotRawConfig | undefined,
    env: Record<string, string | undefined> = process.env,
): HostAIBotConfig {
    return {
        controlPlaneUrl:
            pluginConfig?.controlPlaneUrl ??
            env.HOSTAIBOT_CONTROL_PLANE_URL ??
            DEFAULTS.controlPlaneUrl,
        instanceToken:
            pluginConfig?.instanceToken ??
            env.HOSTAIBOT_INSTANCE_TOKEN ??
            DEFAULTS.instanceToken,
        heartbeatIntervalMs:
            pluginConfig?.heartbeatIntervalMs ??
            (env.HOSTAIBOT_HEARTBEAT_INTERVAL_MS
                ? Number(env.HOSTAIBOT_HEARTBEAT_INTERVAL_MS)
                : DEFAULTS.heartbeatIntervalMs),
        enableBranding: pluginConfig?.enableBranding ?? DEFAULTS.enableBranding,
    };
}

/**
 * Validate a resolved config. Returns errors for missing required fields.
 */
export function validateConfig(config: HostAIBotConfig): ConfigResult | ConfigError {
    const errors: ConfigValidationError[] = [];

    if (!config.instanceToken) {
        errors.push({
            field: "instanceToken",
            message: "Instance token is required. Set via pluginConfig or HOSTAIBOT_INSTANCE_TOKEN env var.",
        });
    }

    if (!config.controlPlaneUrl) {
        errors.push({
            field: "controlPlaneUrl",
            message: "Control plane URL is required.",
        });
    }

    if (config.heartbeatIntervalMs < 1000) {
        errors.push({
            field: "heartbeatIntervalMs",
            message: "Heartbeat interval must be at least 1000ms.",
        });
    }

    if (errors.length > 0) {
        return { ok: false, errors };
    }

    return { ok: true, config };
}
