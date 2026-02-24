import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { PairingWatcher } from "../pairing-watcher.js";
import type { PluginLogger, PairingEvent } from "../types.js";

const mockLogger: PluginLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};

describe("PairingWatcher", () => {
    let tmpDir: string;

    beforeEach(() => {
        vi.clearAllMocks();
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pairing-watcher-test-"));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe("extractChannel", () => {
        it("extracts channel from pairing filename", () => {
            expect(PairingWatcher.extractChannel("/data/credentials/telegram-pairing.json")).toBe("telegram");
            expect(PairingWatcher.extractChannel("/data/credentials/discord-pairing.json")).toBe("discord");
        });

        it("returns null for non-pairing files", () => {
            expect(PairingWatcher.extractChannel("/data/credentials/config.json")).toBeNull();
            expect(PairingWatcher.extractChannel("/data/credentials/telegram-allowFrom.json")).toBeNull();
        });
    });

    describe("readPairingFile", () => {
        it("reads and parses pairing requests", () => {
            const filePath = path.join(tmpDir, "telegram-pairing.json");
            fs.writeFileSync(filePath, JSON.stringify({
                requests: [{ code: "ABCD1234", id: "1", createdAt: "2026-01-01" }],
            }));
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const requests = watcher.readPairingFile(filePath);
            expect(requests).toHaveLength(1);
            expect(requests[0].code).toBe("ABCD1234");
        });

        it("returns empty array for non-existent file", () => {
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const requests = watcher.readPairingFile(path.join(tmpDir, "nonexistent.json"));
            expect(requests).toEqual([]);
        });

        it("returns empty array for invalid JSON", () => {
            const filePath = path.join(tmpDir, "bad-pairing.json");
            fs.writeFileSync(filePath, "not json");
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const requests = watcher.readPairingFile(filePath);
            expect(requests).toEqual([]);
        });

        it("returns empty array when requests field is missing", () => {
            const filePath = path.join(tmpDir, "empty-pairing.json");
            fs.writeFileSync(filePath, JSON.stringify({ other: "data" }));
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const requests = watcher.readPairingFile(filePath);
            expect(requests).toEqual([]);
        });
    });

    describe("processChanges", () => {
        it("detects new pairing requests", () => {
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const events: PairingEvent[] = [];
            watcher.onEvent((e) => events.push(e));

            watcher.processChanges(
                "telegram",
                [],
                [{ code: "ABCD1234", id: "1" }],
            );

            expect(events).toHaveLength(1);
            expect(events[0].event).toBe("channel.pair.requested");
            expect(events[0].payload.channel).toBe("telegram");
            expect(events[0].payload.code).toBe("ABCD1234");
        });

        it("detects resolved (removed) pairing requests", () => {
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const events: PairingEvent[] = [];
            watcher.onEvent((e) => events.push(e));

            watcher.processChanges(
                "discord",
                [{ code: "EFGH5678", id: "2" }],
                [],
            );

            expect(events).toHaveLength(1);
            expect(events[0].event).toBe("channel.pair.resolved");
            expect(events[0].payload.channel).toBe("discord");
            expect(events[0].payload.decision).toBe("approved");
        });

        it("detects no changes when requests are the same", () => {
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const events: PairingEvent[] = [];
            watcher.onEvent((e) => events.push(e));

            const requests = [{ code: "ABCD1234", id: "1" }];
            watcher.processChanges("telegram", requests, requests);

            expect(events).toHaveLength(0);
        });

        it("handles simultaneous adds and removes", () => {
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            const events: PairingEvent[] = [];
            watcher.onEvent((e) => events.push(e));

            watcher.processChanges(
                "slack",
                [{ code: "OLD_CODE", id: "1" }],
                [{ code: "NEW_CODE", id: "2" }],
            );

            expect(events).toHaveLength(2);
            const requested = events.find((e) => e.event === "channel.pair.requested");
            const resolved = events.find((e) => e.event === "channel.pair.resolved");
            expect(requested?.payload.code).toBe("NEW_CODE");
            expect(resolved?.payload.code).toBe("OLD_CODE");
        });
    });

    describe("start/stop lifecycle", () => {
        it("starts and stops without error", () => {
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            expect(() => {
                watcher.start();
                watcher.stop();
            }).not.toThrow();
        });

        it("stop is idempotent", () => {
            const watcher = new PairingWatcher(tmpDir, mockLogger);
            watcher.start();
            watcher.stop();
            watcher.stop(); // Second stop should not throw
        });
    });
});
