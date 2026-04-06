import * as assert from 'assert';
import { computeFingerprint, findAnchor } from '../utils/fingerprint';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Build a file from an array of line strings (no trailing newlines). */
function lines(...ls: string[]): string[] { return ls; }

/** Fingerprint a single-line selection inside a file. */
function fp(fileLines: string[], lineStart: number, lineEnd = lineStart): string {
  return computeFingerprint(fileLines, lineStart, lineEnd);
}

// ─── computeFingerprint() ─────────────────────────────────────────────────────

suite('computeFingerprint()', () => {

  test('same lines always produce the same hash', () => {
    const file = lines('a', 'b', 'const x = 1;', 'd', 'e');
    const h1 = fp(file, 3);
    const h2 = fp(file, 3);
    assert.strictEqual(h1, h2);
  });

  test('different lines produce different hashes', () => {
    const file1 = lines('a', 'b', 'const x = 1;', 'd', 'e');
    const file2 = lines('a', 'b', 'const x = 999;', 'd', 'e');
    assert.notStrictEqual(fp(file1, 3), fp(file2, 3));
  });

  test('context window includes ±2 lines around selection', () => {
    const file = lines('L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7');
    // anchor = line 4 (L4).  Window should be L2..L6 (indices 1-5)
    const withContext    = fp(file, 4);          // uses L2,L3,L4,L5,L6
    const noContextAbove = fp(lines('L3', 'L4', 'L5', 'L6'), 1);  // only 1 line above
    // The two must differ because the context content differs
    assert.notStrictEqual(withContext, noContextAbove);
  });

  test('context window is clamped at file boundaries (start)', () => {
    // Line 1 — only 0 lines above, 2 lines below
    const file = lines('TARGET', 'B', 'C', 'D', 'E');
    // Should not throw — clamping must handle from=0
    assert.doesNotThrow(() => fp(file, 1));
  });

  test('context window is clamped at file boundaries (end)', () => {
    const file = lines('A', 'B', 'C', 'TARGET');
    // Should not throw — clamping must handle to=fileLines.length
    assert.doesNotThrow(() => fp(file, 4));
  });

  test('trailing whitespace is normalised (same hash)', () => {
    const clean  = lines('a', 'const x = 1;', 'b');
    const padded = lines('a', 'const x = 1;   ', 'b');  // trailing spaces
    assert.strictEqual(fp(clean, 2), fp(padded, 2));
  });
});

// ─── findAnchor() ─────────────────────────────────────────────────────────────

suite('findAnchor()', () => {

  // Build a canonical file and fingerprint once, then re-use in each test.
  const BASE_FILE = lines(
    'import foo from "foo";',       // 1
    'import bar from "bar";',       // 2
    '',                             // 3
    'function greet(name: string) {', // 4
    '  console.log("Hello", name);', // 5
    '}',                            // 6
    '',                             // 7
    'export default greet;',        // 8
  );

  // Thread anchored to lines 4-6 (the greet function body)
  const ANCHOR_START  = 4;
  const ANCHOR_END    = 6;
  const STORED_FP     = computeFingerprint(BASE_FILE, ANCHOR_START, ANCHOR_END);
  const ANCHORED_CODE = BASE_FILE.slice(ANCHOR_START - 1, ANCHOR_END).join('\n');

  function find(
    fileLines: string[],
    overrideCode = ANCHORED_CODE,
    overrideFp   = STORED_FP,
  ) {
    return findAnchor(fileLines, overrideFp, overrideCode, ANCHOR_START, ANCHOR_END);
  }

  // ── exact match ───────────────────────────────────────────────────

  test('exact match when nothing has changed', () => {
    const result = find(BASE_FILE);
    assert.ok(result, 'should find the anchor');
    assert.strictEqual(result.lineStart,  ANCHOR_START);
    assert.strictEqual(result.lineEnd,    ANCHOR_END);
    assert.strictEqual(result.confidence, 'exact');
  });

  // ── lines shifted down ────────────────────────────────────────────

  test('exact match after lines shift DOWN (line inserted above)', () => {
    // Insert a comment at the top — anchor moves from 4-6 to 5-7
    const shifted = [
      '// top-level comment',       // new line 1
      ...BASE_FILE,                 // original lines now 2-9
    ];
    const result = find(shifted);
    assert.ok(result);
    assert.strictEqual(result.lineStart,  ANCHOR_START + 1);
    assert.strictEqual(result.lineEnd,    ANCHOR_END   + 1);
    assert.strictEqual(result.confidence, 'exact');
  });

  test('exact match after lines shift DOWN by 5', () => {
    const fiveLines = ['// a', '// b', '// c', '// d', '// e'];
    const shifted   = [...fiveLines, ...BASE_FILE];
    const result    = find(shifted);
    assert.ok(result);
    assert.strictEqual(result.lineStart,  ANCHOR_START + 5);
    assert.strictEqual(result.confidence, 'exact');
  });

  // ── lines shifted up ──────────────────────────────────────────────

  test('exact match after lines shift UP (line removed above)', () => {
    // Remove line 1 — anchor moves from 4-6 to 3-5
    const shifted = BASE_FILE.slice(1);   // drop line 1
    const result  = find(shifted);
    assert.ok(result);
    assert.strictEqual(result.lineStart,  ANCHOR_START - 1);
    assert.strictEqual(result.lineEnd,    ANCHOR_END   - 1);
    assert.strictEqual(result.confidence, 'exact');
  });

  test('exact match after lines shift UP by 2', () => {
    // The anchor must be deep enough that removing 2 lines from the top
    // does NOT touch the ±2 context window. Build a 12-line file with the
    // anchor at lines 8-10, then drop lines 1-2 → anchor moves to 6-8.
    // Context window for 8-10: from = max(0, 8-1-2)=5 → "ctx-line-6"
    // Context window for 6-8 in shifted: from = max(0, 6-1-2)=3 → also "ctx-line-6" ✓
    const deepFile = lines(
      'remove-1',         // 1  ← dropped
      'remove-2',         // 2  ← dropped
      'ctx-line-3',       // 3
      'ctx-line-4',       // 4
      'ctx-line-5',       // 5
      'ctx-line-6',       // 6  ← context window starts here (anchor at 8)
      'ctx-line-7',       // 7
      'function deep() {',// 8  ← anchor start
      '  return 42;',     // 9
      '}',                // 10 ← anchor end
      'ctx-line-11',      // 11
      'ctx-line-12',      // 12
    );
    const deepStart = 8;
    const deepEnd   = 10;
    const deepFp    = computeFingerprint(deepFile, deepStart, deepEnd);
    const deepCode  = deepFile.slice(deepStart - 1, deepEnd).join('\n');

    const shifted = deepFile.slice(2);   // drop first 2 lines → anchor now at 6-8
    const result  = findAnchor(shifted, deepFp, deepCode, deepStart, deepEnd);

    assert.ok(result, 'should find the anchor');
    assert.strictEqual(result.lineStart,  deepStart - 2);
    assert.strictEqual(result.lineEnd,    deepEnd   - 2);
    assert.strictEqual(result.confidence, 'exact');
  });

  // ── fuzzy match ───────────────────────────────────────────────────

  test('fuzzy match when anchored code changes < 40% (1 of 3 lines changed)', () => {
    // Change 1 of 3 anchored lines (33% change → 67% similarity > 0.60 threshold)
    const fuzzyFile = [
      ...BASE_FILE.slice(0, 3),            // lines 1-3 unchanged
      'function greet(name: string) {',    // line 4 unchanged
      '  console.log("Hi", name);',        // line 5 CHANGED (was "Hello")
      '}',                                 // line 6 unchanged
      ...BASE_FILE.slice(6),               // lines 7-8 unchanged
    ];
    // The fingerprint will NOT match (code changed), so exact scan fails.
    // Fuzzy scan should pick it up at lines 4-6.
    const result = findAnchor(
      fuzzyFile,
      STORED_FP,      // old fingerprint — won't match
      ANCHORED_CODE,  // old anchored code used for fuzzy comparison
      ANCHOR_START,
      ANCHOR_END,
    );
    assert.ok(result, 'fuzzy match should be found');
    assert.strictEqual(result.lineStart,  ANCHOR_START);
    assert.strictEqual(result.lineEnd,    ANCHOR_END);
    assert.strictEqual(result.confidence, 'fuzzy');
  });

  test('returns null (orphaned) when anchored code is completely deleted', () => {
    // Replace the anchored lines 4-6 with totally different content
    const orphanFile = [
      'import foo from "foo";',
      'import bar from "bar";',
      '',
      'const TOTALLY = "different";',
      'const CODE    = "here";',
      'const NOTHING = "matches";',
      '',
      'export default greet;',
    ];
    const result = findAnchor(
      orphanFile,
      STORED_FP,
      ANCHORED_CODE,
      ANCHOR_START,
      ANCHOR_END,
    );
    assert.strictEqual(result, null);
  });

  test('returns null when the file is too short to contain the anchor', () => {
    const tinyFile = lines('one line only');
    // ANCHOR_START=4, ANCHOR_END=6 → lineCount=3, file has 1 line → loop never runs
    const result = findAnchor(tinyFile, STORED_FP, ANCHORED_CODE, ANCHOR_START, ANCHOR_END);
    assert.strictEqual(result, null);
  });

  // ── confidence flag ───────────────────────────────────────────────

  test('confidence is "exact" for an unchanged file', () => {
    const result = find(BASE_FILE);
    assert.strictEqual(result?.confidence, 'exact');
  });

  test('confidence is "fuzzy" for a partially-changed file', () => {
    const fuzzyFile = [
      ...BASE_FILE.slice(0, 3),
      'function greet(name: string) {',
      '  console.log("Hi", name);',   // 1 line changed
      '}',
      ...BASE_FILE.slice(6),
    ];
    const result = findAnchor(fuzzyFile, STORED_FP, ANCHORED_CODE, ANCHOR_START, ANCHOR_END);
    assert.strictEqual(result?.confidence, 'fuzzy');
  });
});
