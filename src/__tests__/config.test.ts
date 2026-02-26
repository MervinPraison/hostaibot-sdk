import { describe, it, expect } from "vitest";
import { resolveConfig, validateConfig } from "../config.js";

describe("resolveConfig", () => {
    it("uses explicit pluginConfig values", () => {
        const config = resolveConfig(
            { controlPlaneUrl: "https://custom.com", instanceToken: "tok_123" },
            {},
        );
        expect(config.controlPlaneUrl).toBe("https://custom.com");
        expect(config.instanceToken).toBe("tok_123");
    });

    it("falls back to env vars when pluginConfig is absent", () => {
        const config = resolveConfig(undefined, {
            HOSTAIBOT_CONTROL_PLANE_URL: "https://env.com",
            HOSTAIBOT_INSTANCE_TOKEN: "tok_env",
        });
        expect(config.controlPlaneUrl).toBe("https://env.com");
        expect(config.instanceToken).toBe("tok_env");
    });

    it("pluginConfig takes precedence over env vars", () => {
        const config = resolveConfig(
            { controlPlaneUrl: "https://explicit.com" },
            { HOSTAIBOT_CONTROL_PLANE_URL: "https://env.com" },
        );
        expect(config.controlPlaneUrl).toBe("https://explicit.com");
    });

    it("uses defaults when both pluginConfig and env are absent", () => {
        const config = resolveConfig(undefined, {});
        expect(config.controlPlaneUrl).toBe("https://hostaibot.com");
        expect(config.instanceToken).toBe("");
        expect(config.heartbeatIntervalMs).toBe(30_000);
        expect(config.enableBranding).toBe(true);
    });

    it("parses heartbeatIntervalMs from env var", () => {
        const config = resolveConfig(undefined, {
            HOSTAIBOT_HEARTBEAT_INTERVAL_MS: "15000",
        });
        expect(config.heartbeatIntervalMs).toBe(15000);
    });

    it("uses pluginConfig heartbeatIntervalMs over env var", () => {
        const config = resolveConfig(
            { heartbeatIntervalMs: 5000 },
            { HOSTAIBOT_HEARTBEAT_INTERVAL_MS: "15000" },
        );
        expect(config.heartbeatIntervalMs).toBe(5000);
    });
});

describe("validateConfig", () => {
    it("returns ok for valid config", () => {
        const result = validateConfig({
            controlPlaneUrl: "https://hostaibot.com",
            instanceToken: "tok_123",
            heartbeatIntervalMs: 30_000,
            enableBranding: true,
        });
        expect(result.ok).toBe(true);
    });

    it("returns error for missing instanceToken", () => {
        const result = validateConfig({
            controlPlaneUrl: "https://hostaibot.com",
            instanceToken: "",
            heartbeatIntervalMs: 30_000,
            enableBranding: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].field).toBe("instanceToken");
        }
    });

    it("returns error for heartbeatIntervalMs below minimum", () => {
        const result = validateConfig({
            controlPlaneUrl: "https://hostaibot.com",
            instanceToken: "tok_123",
            heartbeatIntervalMs: 500,
            enableBranding: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.some((e) => e.field === "heartbeatIntervalMs")).toBe(true);
        }
    });

    it("returns multiple errors for multiple invalid fields", () => {
        const result = validateConfig({
            controlPlaneUrl: "",
            instanceToken: "",
            heartbeatIntervalMs: 100,
            enableBranding: true,
        });
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.errors.length).toBeGreaterThanOrEqual(3);
        }
    });
});
