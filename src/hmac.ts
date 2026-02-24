/**
 * HMAC signature utilities for webhook verification.
 * Uses Node.js crypto — no external dependencies.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sign a payload with HMAC-SHA256.
 * Returns hex-encoded signature.
 */
export function signPayload(secret: string, payload: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Verify an HMAC-SHA256 signature using constant-time comparison.
 * Returns true if the signature is valid.
 */
export function verifySignature(secret: string, payload: string, signature: string): boolean {
    if (!signature || !secret) {
        return false;
    }
    const expected = signPayload(secret, payload);
    if (expected.length !== signature.length) {
        return false;
    }
    try {
        return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
    } catch {
        return false;
    }
}
