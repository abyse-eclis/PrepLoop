import { describe, expect, it } from "vitest";
import { classifyChanges } from "./summary";

describe("classifyChanges", () => {
  const existing = new Map<string, { sig: string }>([
    ["a", { sig: "1" }],
    ["b", { sig: "2" }],
  ]);

  it("classifies created / updated / unchanged", () => {
    const counts = classifyChanges({
      incoming: [
        { key: "a", sig: "1" }, // unchanged
        { key: "b", sig: "changed" }, // updated
        { key: "c", sig: "9" }, // created
      ],
      existing,
      keyOf: (r) => r.key,
      signatureIncoming: (r) => r.sig,
      signatureExisting: (r) => r.sig,
    });
    expect(counts).toEqual({ created: 1, updated: 1, unchanged: 1 });
  });

  it("all unchanged on identical re-import (no reset)", () => {
    const counts = classifyChanges({
      incoming: [
        { key: "a", sig: "1" },
        { key: "b", sig: "2" },
      ],
      existing,
      keyOf: (r) => r.key,
      signatureIncoming: (r) => r.sig,
      signatureExisting: (r) => r.sig,
    });
    expect(counts).toEqual({ created: 0, updated: 0, unchanged: 2 });
  });
});
