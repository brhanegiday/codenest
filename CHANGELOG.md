# Changelog

All notable changes to Brana will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-04-06

### Added

- **Inline threads** — select any lines of code and press `Ctrl+Shift+N` (`Cmd+Shift+N` on macOS) to create an anchored thread with a Markdown note.
- **Smart anchor tracking** — SHA-1 fingerprint with ±2-line context window keeps threads linked to the correct code as lines shift during editing. Threads automatically update their line numbers on file saves.
- **Orphan detection** — when anchored code changes beyond a 0.60 similarity threshold, threads transition to *orphaned* status and display an amber gutter icon so nothing is silently lost.
- **Re-attach flow** — orphaned threads can be re-linked to new code via the sidebar Re-attach button.
- **Gutter icons** — open (blue), resolved (grey), and orphaned (amber) icons appear in the editor gutter for every active thread.
- **Thread Panel webview** — full create/reply/resolve/delete UI with inline Markdown preview and `Ctrl+Enter` shortcut.
- **Sidebar view** — Activity Bar panel showing threads grouped by Open / Resolved / Orphaned with collapse, navigation, and hide-resolved toggle.
- **Search panel** — full-text search across thread body, replies, anchored code, and file paths with AND logic, case-insensitive matching, and status filter tabs.
- **Walkthrough** — three-step onboarding walkthrough accessible from the VS Code Welcome tab.
- **Local-first storage** — all data persisted in `.brana/threads.json` with atomic writes (`.tmp` + rename). No network requests, no telemetry.
