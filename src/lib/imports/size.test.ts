import { describe, expect, it } from "vitest";
import { importTextSize, importTooLargeMessage, MAX_IMPORT_BYTES } from "./size";

describe("import payload size", () => {
  it("measures UTF-8 bytes rather than JavaScript characters", () => {
    expect(importTextSize("ก")).toBe(3);
    expect(importTextSize("abc")).toBe(3);
  });

  it("defines a bounded 4 MiB import limit and a friendly message", () => {
    expect(MAX_IMPORT_BYTES).toBe(4 * 1024 * 1024);
    expect(importTooLargeMessage()).toContain("4 MB");
  });
});
