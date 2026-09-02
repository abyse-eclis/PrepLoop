import { describe, expect, it } from "vitest";
import {
  CANONICAL_LEARNING_RESOURCES,
  resolveCanonicalResource,
} from "./canonical-resources";

describe("canonical learning resources", () => {
  it("defines canonical entries for English foundation and TGAT1 exposure", () => {
    expect(CANONICAL_LEARNING_RESOURCES["foundation_chris_core"]?.url).toBe(
      "https://youtu.be/zvvKelLMLtU"
    );
    expect(CANONICAL_LEARNING_RESOURCES["foundation_chris_core"]?.label).toBe(
      "English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง"
    );

    expect(CANONICAL_LEARNING_RESOURCES["tgat1_exposure"]?.url).toBe(
      "https://www.youtube.com/watch?v=0nXxgts-RWc"
    );
    expect(CANONICAL_LEARNING_RESOURCES["tgat1_exposure"]?.label).toBe(
      "KruP’ONE OpenDurianTCAS"
    );
  });

  it("resolves canonical resource from metadata.englishMode", () => {
    const chrisItem = {
      subject: "A_LEVEL_ENGLISH",
      metadata: { englishMode: "foundation_chris_core" },
    };
    const resolvedChris = resolveCanonicalResource(chrisItem);
    expect(resolvedChris?.url).toBe("https://youtu.be/zvvKelLMLtU");
    expect(resolvedChris?.label).toBe("English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง");

    const tgatItem = {
      subject: "TGAT1",
      metadata: { englishMode: "tgat1_exposure" },
    };
    const resolvedTgat = resolveCanonicalResource(tgatItem);
    expect(resolvedTgat?.url).toBe("https://www.youtube.com/watch?v=0nXxgts-RWc");
    expect(resolvedTgat?.label).toBe("KruP’ONE OpenDurianTCAS");
  });

  it("resolves canonical resource from metadata.resourceKey or contentKey", () => {
    const itemWithKey = {
      subject: "TGAT1",
      metadata: { resourceKey: "krupone-tgat1-exposure" },
    };
    const resolved = resolveCanonicalResource(itemWithKey);
    expect(resolved?.url).toBe("https://www.youtube.com/watch?v=0nXxgts-RWc");
    expect(resolved?.label).toBe("KruP’ONE OpenDurianTCAS");
  });

  it("returns null when metadata does not match any canonical resource", () => {
    const itemWithoutResource = {
      subject: "A_LEVEL_ENGLISH",
      metadata: { englishMode: "alevel_exposure" }, // No explicit video assigned
    };
    expect(resolveCanonicalResource(itemWithoutResource)).toBeNull();

    const normalItem = {
      subject: "MATHEMATICS",
      metadata: {},
    };
    expect(resolveCanonicalResource(normalItem)).toBeNull();
  });
});
