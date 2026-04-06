// src/utils/fingerprint.ts
import * as crypto from "node:crypto";

export function computeFingerprint(
    fileLines: string[],
    lineStart: number, // 1-indexed
    lineEnd: number, // 1-indexed
): string {
    const CONTEXT = 2;
    const from = Math.max(0, lineStart - 1 - CONTEXT); // 0-indexed
    const to = Math.min(fileLines.length, lineEnd + CONTEXT); // exclusive
    const window = fileLines
        .slice(from, to)
        .map((l) => l.trimEnd()) // normalise trailing whitespace
        .join("\n");
    return crypto.createHash("sha1").update(window).digest("hex");
}

// Returns the new 1-indexed line number if found, or null if no match.
// Tries exact hash first, then fuzzy line-by-line diff.
export function findAnchor(
    fileLines: string[],
    storedFingerprint: string,
    anchoredCode: string,
    originalStart: number,
    originalEnd: number,
): { lineStart: number; lineEnd: number; confidence: "exact" | "fuzzy" } | null {
    const lineCount = originalEnd - originalStart + 1;

    // 1. Exact fingerprint scan — check every possible window
    for (let i = 0; i <= fileLines.length - lineCount; i++) {
        const fp = computeFingerprint(fileLines, i + 1, i + lineCount);
        if (fp === storedFingerprint) {
            return { lineStart: i + 1, lineEnd: i + lineCount, confidence: "exact" };
        }
    }

    // 2. Fuzzy scan — compare anchored_code lines against file
    const target = anchoredCode.split("\n").map((l) => l.trim());
    let best: { lineStart: number; score: number } | null = null;

    for (let i = 0; i <= fileLines.length - lineCount; i++) {
        const candidate = fileLines.slice(i, i + lineCount).map((l) => l.trim());
        const score = similarity(target, candidate);
        if (score > 0.6 && (!best || score > best.score)) {
            best = { lineStart: i + 1, score };
        }
    }

    if (best) {
        return {
            lineStart: best.lineStart,
            lineEnd: best.lineStart + lineCount - 1,
            confidence: "fuzzy",
        };
    }

    return null; // orphaned
}

// Levenshtein-based line similarity — returns 0..1
function similarity(a: string[], b: string[]): number {
    const matches = a.filter((line, i) => line === b[i]).length;
    return matches / Math.max(a.length, b.length);
}
