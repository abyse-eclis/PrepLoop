import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "./files";

describe("sanitizeFilename", () => {
  it("strips path traversal segments", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("a/b/c.pdf")).toBe("c.pdf");
    expect(sanitizeFilename("..\\..\\win.txt")).toBe("win.txt");
  });
  it("replaces unsafe characters", () => {
    expect(sanitizeFilename("my file (1).pdf")).toBe("my_file_1_.pdf");
  });
  it("removes leading dots", () => {
    expect(sanitizeFilename(".hidden")).toBe("hidden");
  });
  it("falls back for empty", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("///")).toBe("file");
  });
});
