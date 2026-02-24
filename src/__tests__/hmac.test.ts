import { describe, it, expect } from "vitest";
import { signPayload, verifySignature } from "../hmac.js";

describe("signPayload", () => {
    it("returns a hex string", () => {
        const sig = signPayload("secret", "payload");
        expect(sig).toMatch(/^[0-9a-f]+$/);
    });

    it("produces consistent signatures", () => {
        const sig1 = signPayload("secret", "hello");
        const sig2 = signPayload("secret", "hello");
        expect(sig1).toBe(sig2);
    });

    it("produces different signatures for different secrets", () => {
        const sig1 = signPayload("secret1", "payload");
        const sig2 = signPayload("secret2", "payload");
        expect(sig1).not.toBe(sig2);
    });
});

describe("verifySignature", () => {
    it("verifies a valid signature", () => {
        const sig = signPayload("secret", "payload");
        expect(verifySignature("secret", "payload", sig)).toBe(true);
    });

    it("rejects wrong secret", () => {
        const sig = signPayload("secret", "payload");
        expect(verifySignature("wrong", "payload", sig)).toBe(false);
    });

    it("rejects tampered payload", () => {
        const sig = signPayload("secret", "payload");
        expect(verifySignature("secret", "tampered", sig)).toBe(false);
    });

    it("rejects empty signature", () => {
        expect(verifySignature("secret", "payload", "")).toBe(false);
    });

    it("rejects empty secret", () => {
        expect(verifySignature("", "payload", "some-sig")).toBe(false);
    });

    it("handles empty payload", () => {
        const sig = signPayload("secret", "");
        expect(verifySignature("secret", "", sig)).toBe(true);
    });
});
