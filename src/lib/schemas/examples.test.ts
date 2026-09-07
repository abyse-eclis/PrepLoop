import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseJsonWithSchema } from "./index";
import { studyPlanSchema } from "./study-plan";

/**
 * The shipped example plans are the import contract. The legacy one must keep
 * parsing forever; the hybrid one proves the new resources[] block works.
 */
function readExample(name: string): string {
  return readFileSync(path.join(process.cwd(), "examples", name), "utf8");
}

describe("example study plans", () => {
  it("still imports the legacy example unchanged", () => {
    const result = parseJsonWithSchema(
      readExample("study-plan.example.json"),
      studyPlanSchema
    );
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    const item = result.data?.days[0]!.items[0]!;
    expect(item.courseCode).toBe("K001");
    expect(item.resources).toBeUndefined();
  });

  it("imports the hybrid resource example", () => {
    const result = parseJsonWithSchema(
      readExample("study-plan-hybrid-resources.example.json"),
      studyPlanSchema
    );
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);

    const physics = result.data?.days[0]!.items[0]!;
    expect(physics.topic).toBe("การเคลื่อนที่แนวตรง");
    expect(physics.resources?.map((r) => r.tier)).toEqual(["PAID", "FREE"]);
    // Legacy columns mirror the primary resource so old readers keep working.
    expect(physics.courseCode).toBe("X003");

    const legacyItem = result.data?.days[1]!.items[1]!;
    expect(legacyItem.resources).toBeUndefined();
    expect(legacyItem.resourceUrl).toContain("youtube.com");
  });
});
