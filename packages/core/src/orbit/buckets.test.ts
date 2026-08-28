import { describe, expect, it } from "vitest";
import { inferBuckets } from "./buckets.js";

const REPO = [
  "apps/web/main.ts",
  "apps/web/session.ts",
  "apps/api/server.ts",
  "src/index.ts",
  "src/auth.ts",
  "src/http/client.ts",
  "src/http/retry.ts",
  "src/http/headers.ts",
  "src/auth.test.ts",
  "package.json",
  "docs/auth.md",
];

describe("inferBuckets", () => {
  it("expands namespace folders one level and splits thick children", () => {
    const { of, order } = inferBuckets(REPO);
    expect(of.get("apps/web/main.ts")).toBe("apps/web");
    expect(of.get("src/index.ts")).toBe("src");
    expect(of.get("src/http/client.ts")).toBe("src/http");
    expect(of.get("src/auth.test.ts")).toBe("tests");
    expect(of.get("package.json")).toBe("config");
    expect(of.get("docs/auth.md")).toBe("docs");
    expect(order.map((b) => b.id)).toContain("apps/web");
    expect(order.map((b) => b.id).indexOf("tests")).toBeGreaterThan(order.map((b) => b.id).indexOf("src"));
  });
});
