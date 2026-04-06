# CodeNest

**Turn code decisions into permanent knowledge.**

CodeNest lets you attach persistent discussion threads directly to lines of code — right inside VS Code. No external tools, no accounts, no cloud. Everything lives in your repository.

---

## Features

- **Inline threads** — Select any lines of code and press `Ctrl+Shift+N` to start a thread. Notes are anchored to those exact lines.
- **Smart anchor tracking** — Threads follow your code as lines shift up or down. When the code changes too much to track, the thread is marked *orphaned* so nothing is silently lost.
- **Sidebar overview** — The CodeNest panel lists every open, resolved, and orphaned thread in your workspace, grouped by status.
- **Full-text search** — Instantly search all threads by keyword, file path, or anchored code. Filter by status.
- **Markdown preview** — Write notes in Markdown and toggle a live preview before saving.
- **Reply threads** — Add follow-up replies to any existing thread.
- **Resolve & archive** — Mark threads resolved when the work is done. Resolved threads stay searchable forever — nothing is ever deleted.
- **Re-attach** — If a thread becomes orphaned, click **Re-attach** in the sidebar, select the new code, and press `Ctrl+Shift+N` to restore the link.
- **100 % local** — Data is stored in `.codenest/threads.json` inside your workspace. Commit it to share threads with your team.

---

## Getting Started

**1. Create a thread**

Select one or more lines of code in any editor, then press:

| Platform | Shortcut        |
| -------- | --------------- |
| Windows  | `Ctrl+Shift+N`  |
| macOS    | `Cmd+Shift+N`   |

You can also right-click a selection → **CodeNest: Add thread**.

Write your note (Markdown supported), then click **Save**.

**2. Browse threads**

Click the CodeNest icon in the Activity Bar to open the sidebar. Threads are grouped into **Open**, **Resolved**, and **Orphaned** sections. Click any thread to jump to its file.

**3. Search your knowledge base**

Open the **Search** panel in the CodeNest sidebar. Type any keyword — CodeNest searches thread body text, replies, anchored code, and file paths simultaneously.

---

## Keyboard Shortcuts

| Action                         | Windows / Linux   | macOS            |
| ------------------------------ | ----------------- | ---------------- |
| Create thread / open at cursor | `Ctrl+Shift+N`    | `Cmd+Shift+N`    |
| Focus search panel             | Command Palette → *CodeNest: Search threads* | |

---

## Data & Privacy

All thread data is stored locally in `.codenest/threads.json` inside your workspace folder. CodeNest makes **no network requests** and has no telemetry. Your notes never leave your machine unless you commit and push the file yourself.

---

## Requirements

- VS Code `1.110.0` or later
- A workspace folder must be open

---

## Contributing

Found a bug or have a feature idea? Open an issue or pull request on [GitHub](https://github.com/brhanegiday/codenest).

---

## License

MIT
