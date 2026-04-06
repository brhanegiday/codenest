// src/storageManager.ts
import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { ThreadStore } from "./types";

const SCHEMA_VERSION = 1;
const STORE_DIR = ".codenest";
const STORE_FILE = "threads.json";

export class StorageManager {
    private readonly storePath: string;
    private readonly repoRoot: string;

    constructor(workspaceRoot: string) {
        this.repoRoot = workspaceRoot;
        this.storePath = path.join(workspaceRoot, STORE_DIR, STORE_FILE);
    }

    // ── read ─────────────────────────────────────────────────────────
    load(): ThreadStore {
        if (!fs.existsSync(this.storePath)) {
            return this.emptyStore();
        }
        try {
            const raw = fs.readFileSync(this.storePath, "utf-8");
            const store = JSON.parse(raw) as ThreadStore;
            return this.migrate(store);
        } catch {
            // Corrupted file — show recovery prompt, return empty
            vscode.window
                .showErrorMessage(
                    "CodeNest: threads.json is corrupted. " + "Your threads may be unreadable.",
                    "Reset store",
                )
                .then((action) => {
                    if (action === "Reset store") {
                        this.save(this.emptyStore());
                    }
                });
            return this.emptyStore();
        }
    }

    // ── write (atomic) ───────────────────────────────────────────────
    save(store: ThreadStore): void {
        const dir = path.dirname(this.storePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const tmp = this.storePath + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
        fs.renameSync(tmp, this.storePath); // atomic
        this.ensureGitignore();
    }

    // ── gitignore guard ───────────────────────────────────────────────
    private ensureGitignore(): void {
        const gi = path.join(this.repoRoot, ".gitignore");
        const entry = ".codenest/";
        if (!fs.existsSync(gi) || !fs.readFileSync(gi, "utf-8").includes(entry)) {
            fs.appendFileSync(gi, "\n# CodeNest private threads\n" + entry + "\n");
            vscode.window.showInformationMessage("CodeNest: Added .codenest/ to .gitignore to keep threads private.");
        }
    }

    // ── helpers ───────────────────────────────────────────────────────
    private emptyStore(): ThreadStore {
        return {
            schema_version: SCHEMA_VERSION,
            repo_id: crypto.createHash("sha256").update(this.repoRoot).digest("hex"),
            threads: [],
        };
    }

    private migrate(store: ThreadStore): ThreadStore {
        // Future migrations go here when schema_version increments
        return store;
    }
}
