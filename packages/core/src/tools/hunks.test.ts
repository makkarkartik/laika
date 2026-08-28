import { describe, expect, it } from "vitest";
import {
  GAP,
  MAX_HUNK_LINES,
  countHunks,
  diffLines,
  hunksFromDelete,
  hunksFromReplace,
  hunksFromWrite,
  splitLines,
} from "./hunks.js";

describe("splitLines", () => {
  it("treats empty text as zero lines and ignores one trailing newline", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines("a")).toEqual(["a"]);
    expect(splitLines("a\r\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\n\n")).toEqual(["a", ""]);
  });
});

describe("diffLines", () => {
  it("keeps unchanged lines as context and only marks the real change", () => {
    expect(hunksFromReplace("a\nb", "a\nc")).toEqual([
      { type: "ctx", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "c" },
    ]);
  });

  it("elides far-apart unchanged lines with a gap marker", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].join("\n");
    const after = ["1", "2x", "3", "4", "5", "6", "7", "8", "9x", "10"].join("\n");
    const hunks = diffLines(before, after);
    expect(hunks).toEqual([
      { type: "ctx", text: "1" },
      { type: "del", text: "2" },
      { type: "add", text: "2x" },
      { type: "ctx", text: "3" },
      { type: "ctx", text: "4" },
      GAP,
      { type: "ctx", text: "7" },
      { type: "ctx", text: "8" },
      { type: "del", text: "9" },
      { type: "add", text: "9x" },
      { type: "ctx", text: "10" },
    ]);
    expect(countHunks(hunks)).toEqual({ plus: 2, minus: 2 });
  });

  it("returns nothing for identical text", () => {
    expect(diffLines("same\n", "same\n")).toEqual([]);
  });

  it("does not truncate a large change to a preview", () => {
    const before = Array.from({ length: 600 }, (_, i) => `line ${i}`).join("\n");
    expect(hunksFromDelete(before)).toHaveLength(600);
    expect(hunksFromWrite(before)).toHaveLength(600);
    expect(diffLines(before, "")).toHaveLength(600);
    expect(countHunks(diffLines(before, ""))).toEqual({ plus: 0, minus: 600 });
  });

  it("bounds pathological changes at MAX_HUNK_LINES", () => {
    const huge = Array.from({ length: MAX_HUNK_LINES + 50 }, (_, i) => String(i)).join("\n");
    expect(hunksFromDelete(huge)).toHaveLength(MAX_HUNK_LINES);
  });
});

describe("hunksFromWrite", () => {
  it("treats a new file as added lines", () => {
    expect(hunksFromWrite("one\ntwo")).toEqual([
      { type: "add", text: "one" },
      { type: "add", text: "two" },
    ]);
  });

  it("diffs an overwrite against the previous contents", () => {
    expect(hunksFromWrite("one\nthree\n", "one\ntwo\n")).toEqual([
      { type: "ctx", text: "one" },
      { type: "del", text: "two" },
      { type: "add", text: "three" },
    ]);
  });
});

describe("hunksFromDelete", () => {
  it("treats a delete as removed lines", () => {
    expect(hunksFromDelete("one\ntwo")).toEqual([
      { type: "del", text: "one" },
      { type: "del", text: "two" },
    ]);
  });
});
