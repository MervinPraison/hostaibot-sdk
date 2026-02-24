/**
 * Pairing File Watcher — Plugin service replacement for Docker's pairing-watcher.mjs
 *
 * Monitors /data/credentials/*-pairing.json files for changes and detects
 * new/resolved pairing requests. Runs as an OpenClaw plugin service.
 *
 * Replaces: docker/pairing-watcher.mjs (311 lines) + start-with-watcher.sh (24 lines)
 */

import fs from "node:fs";
import path from "node:path";
import type { PairingRequest, PairingEvent, PluginLogger } from "./types.js";

const DEBOUNCE_MS = 500;
const RESCAN_INTERVAL_MS = 10_000;

export type PairingEventHandler = (event: PairingEvent) => void;

export class PairingWatcher {
    private pairingCache = new Map<string, PairingRequest[]>();
    private watchedFiles = new Set<string>();
    private permissionErrorFiles = new Set<string>();
    private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private rescanTimer: ReturnType<typeof setInterval> | null = null;
    private dirWatcher: fs.FSWatcher | null = null;
    private fileWatchers: fs.FSWatcher[] = [];
    private eventHandlers: PairingEventHandler[] = [];

    constructor(
        private readonly credentialsDir: string,
        private readonly logger: PluginLogger,
    ) { }

    onEvent(handler: PairingEventHandler): void {
        this.eventHandlers.push(handler);
    }

    start(): void {
        this.initializeCache();
        this.watchPairingFiles();
        this.rescanTimer = setInterval(() => this.rescanAndWatch(), RESCAN_INTERVAL_MS);
        this.logger.info(`Pairing watcher started on ${this.credentialsDir}`);
    }

    stop(): void {
        // Clear all timers
        if (this.rescanTimer) {
            clearInterval(this.rescanTimer);
            this.rescanTimer = null;
        }
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();

        // Close watchers
        if (this.dirWatcher) {
            this.dirWatcher.close();
            this.dirWatcher = null;
        }
        for (const watcher of this.fileWatchers) {
            watcher.close();
        }
        this.fileWatchers = [];
        this.watchedFiles.clear();

        this.logger.info("Pairing watcher stopped");
    }

    // ── File reading ──

    readPairingFile(filePath: string): PairingRequest[] {
        try {
            if (!fs.existsSync(filePath)) return [];
            const content = fs.readFileSync(filePath, "utf-8");
            const data = JSON.parse(content) as { requests?: PairingRequest[] };
            if (this.permissionErrorFiles.has(filePath)) {
                this.permissionErrorFiles.delete(filePath);
                this.logger.info(`Permission restored for ${filePath}`);
            }
            return Array.isArray(data.requests) ? data.requests : [];
        } catch (err: unknown) {
            const error = err as NodeJS.ErrnoException;
            if (error.code === "EACCES") {
                if (!this.permissionErrorFiles.has(filePath)) {
                    this.permissionErrorFiles.add(filePath);
                    this.logger.warn(`Permission denied for ${path.basename(filePath)} (will retry silently)`);
                }
                return [];
            }
            this.logger.error(`Error reading ${filePath}: ${error.message}`);
            return [];
        }
    }

    // ── Channel extraction ──

    static extractChannel(filePath: string): string | null {
        const basename = path.basename(filePath);
        const match = basename.match(/^(.+)-pairing\.json$/);
        return match ? match[1] : null;
    }

    // ── Change detection ──

    processChanges(channel: string, oldRequests: PairingRequest[], newRequests: PairingRequest[]): void {
        const oldCodes = new Set(oldRequests.map((r) => r.code));
        const newCodes = new Set(newRequests.map((r) => r.code));

        // New requests
        for (const req of newRequests) {
            if (!oldCodes.has(req.code)) {
                this.emit({
                    event: "channel.pair.requested",
                    payload: {
                        channel,
                        code: req.code,
                        id: req.id,
                        createdAt: req.createdAt,
                        meta: req.meta,
                    },
                    ts: Date.now(),
                });
            }
        }

        // Resolved requests (removed from pending)
        for (const req of oldRequests) {
            if (!newCodes.has(req.code)) {
                this.emit({
                    event: "channel.pair.resolved",
                    payload: {
                        channel,
                        code: req.code,
                        id: req.id,
                        decision: "approved",
                    },
                    ts: Date.now(),
                });
            }
        }
    }

    // ── Internal ──

    private emit(event: PairingEvent): void {
        for (const handler of this.eventHandlers) {
            handler(event);
        }
    }

    private handleFileChange(filePath: string): void {
        const channel = PairingWatcher.extractChannel(filePath);
        if (!channel) return;

        // Debounce rapid changes
        const existing = this.debounceTimers.get(filePath);
        if (existing) clearTimeout(existing);

        this.debounceTimers.set(
            filePath,
            setTimeout(() => {
                this.debounceTimers.delete(filePath);
                const newRequests = this.readPairingFile(filePath);
                const oldRequests = this.pairingCache.get(channel) ?? [];
                this.pairingCache.set(channel, newRequests);
                this.processChanges(channel, oldRequests, newRequests);
            }, DEBOUNCE_MS),
        );
    }

    private initializeCache(): void {
        try {
            if (!fs.existsSync(this.credentialsDir)) {
                this.logger.info(`Credentials dir not found: ${this.credentialsDir}`);
                return;
            }
            const files = fs.readdirSync(this.credentialsDir);
            for (const file of files) {
                if (file.endsWith("-pairing.json")) {
                    const filePath = path.join(this.credentialsDir, file);
                    const channel = PairingWatcher.extractChannel(filePath);
                    if (channel) {
                        const requests = this.readPairingFile(filePath);
                        this.pairingCache.set(channel, requests);
                    }
                }
            }
        } catch (err) {
            this.logger.error(`Error initializing cache: ${err}`);
        }
    }

    private watchPairingFiles(): void {
        try {
            if (!fs.existsSync(this.credentialsDir)) {
                fs.mkdirSync(this.credentialsDir, { recursive: true });
            }

            // Watch directory for new files
            this.dirWatcher = fs.watch(this.credentialsDir, { persistent: false }, (_eventType, filename) => {
                if (!filename || !filename.endsWith("-pairing.json")) return;
                const filePath = path.join(this.credentialsDir, filename);
                this.handleFileChange(filePath);
            });

            // Watch existing individual files
            const files = fs.readdirSync(this.credentialsDir);
            for (const file of files) {
                if (file.endsWith("-pairing.json")) {
                    this.watchFile(path.join(this.credentialsDir, file));
                }
            }
        } catch (err) {
            this.logger.error(`Error setting up file watch: ${err}`);
        }
    }

    private watchFile(filePath: string): void {
        if (this.watchedFiles.has(filePath)) return;
        this.watchedFiles.add(filePath);
        try {
            const watcher = fs.watch(filePath, { persistent: false }, () => {
                this.handleFileChange(filePath);
            });
            this.fileWatchers.push(watcher);
        } catch (err: unknown) {
            const error = err as NodeJS.ErrnoException;
            if (error.code !== "EACCES") {
                this.logger.error(`Error watching ${filePath}: ${error.message}`);
            }
        }
    }

    private rescanAndWatch(): void {
        try {
            if (!fs.existsSync(this.credentialsDir)) return;
            const files = fs.readdirSync(this.credentialsDir);
            for (const file of files) {
                if (file.endsWith("-pairing.json")) {
                    const filePath = path.join(this.credentialsDir, file);
                    const channel = PairingWatcher.extractChannel(filePath);
                    if (channel && !this.watchedFiles.has(filePath)) {
                        const requests = this.readPairingFile(filePath);
                        this.pairingCache.set(channel, requests);
                        this.watchFile(filePath);
                        this.logger.info(`Now watching new file: ${file}`);
                    }
                }
            }
        } catch (err) {
            this.logger.error(`Rescan error: ${err}`);
        }
    }
}
