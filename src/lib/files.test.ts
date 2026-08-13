import { describe, expect, it } from "vitest";
import {
  sanitizeFilename,
  parseFileName,
  safeExtension,
  buildStorageKey,
} from "./files";

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

describe("parseFileName", () => {
  it("keeps Thai display name and lowercases extension", () => {
    const r = parseFileName("แนวข้อสอบจริง A-LEVEL คณิตศาสตร์ 1 ชุดที่ 1.PDF");
    expect(r.displayName).toBe("แนวข้อสอบจริง A-LEVEL คณิตศาสตร์ 1 ชุดที่ 1");
    expect(r.extension).toBe("pdf");
    expect(r.originalFileName).toBe(
      "แนวข้อสอบจริง A-LEVEL คณิตศาสตร์ 1 ชุดที่ 1.PDF"
    );
  });
  it("handles spaces and parentheses", () => {
    const r = parseFileName("A-Level ภาษาอังกฤษ (ชุดที่ 2).pdf");
    expect(r.displayName).toBe("A-Level ภาษาอังกฤษ (ชุดที่ 2)");
    expect(r.extension).toBe("pdf");
  });
  it("strips directory components", () => {
    expect(parseFileName("a/b/c.json").displayName).toBe("c");
    expect(parseFileName("..\\..\\x.png").originalFileName).toBe("x.png");
  });
  it("handles no extension", () => {
    const r = parseFileName("README");
    expect(r.extension).toBe("");
    expect(r.displayName).toBe("README");
  });
});

describe("safeExtension", () => {
  it("prefers MIME type over filename", () => {
    expect(safeExtension("application/pdf", "weird.name")).toBe("pdf");
    expect(safeExtension("image/jpeg", "photo.JPG")).toBe("jpg");
  });
  it("falls back to filename extension", () => {
    expect(safeExtension("application/octet-stream", "data.csv")).toBe("csv");
  });
});

describe("buildStorageKey", () => {
  it("is uuid-based and never leaks the user filename or traversal", () => {
    const key = buildStorageKey(
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
      "application/pdf",
      "../../etc/ชื่อไทย (1).pdf"
    );
    expect(key).toBe(
      "workspaces/11111111-1111-1111-1111-111111111111/learning-sources/22222222-2222-2222-2222-222222222222.pdf"
    );
    expect(key).not.toContain("..");
    expect(key).not.toContain("ชื่อไทย");
  });
});
