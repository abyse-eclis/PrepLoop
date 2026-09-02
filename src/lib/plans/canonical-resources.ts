/**
 * Canonical Learning Resource Catalog.
 * Defines immutable, verified learning resource mappings for core curriculum
 * and exposure tracks (e.g. English Foundation, TGAT1 Exposure, etc.).
 */

export interface CanonicalResource {
  id: string;
  url: string;
  label: string;
  description?: string;
}

export const CANONICAL_LEARNING_RESOURCES: Record<string, CanonicalResource> = {
  "foundation_chris_core": {
    id: "foundation_chris_core",
    url: "https://youtu.be/zvvKelLMLtU",
    label: "English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง",
    description: "คอร์สภาษาอังกฤษพื้นฐาน 20 ชั่วโมง โดย English by Chris",
  },
  "english-by-chris-foundation-20h": {
    id: "english-by-chris-foundation-20h",
    url: "https://youtu.be/zvvKelLMLtU",
    label: "English by Chris — คอร์สพื้นฐาน 20 ชั่วโมง",
    description: "คอร์สภาษาอังกฤษพื้นฐาน 20 ชั่วโมง โดย English by Chris",
  },
  "tgat1_exposure": {
    id: "tgat1_exposure",
    url: "https://www.youtube.com/watch?v=0nXxgts-RWc",
    label: "KruP’ONE OpenDurianTCAS",
    description: "TGAT1 English Exposure โดย KruP'ONE OpenDurianTCAS",
  },
  "krupone-tgat1-exposure": {
    id: "krupone-tgat1-exposure",
    url: "https://www.youtube.com/watch?v=0nXxgts-RWc",
    label: "KruP’ONE OpenDurianTCAS",
    description: "TGAT1 English Exposure โดย KruP'ONE OpenDurianTCAS",
  },
  "TGAT1_EXPOSURE": {
    id: "TGAT1_EXPOSURE",
    url: "https://www.youtube.com/watch?v=0nXxgts-RWc",
    label: "KruP’ONE OpenDurianTCAS",
    description: "TGAT1 English Exposure โดย KruP'ONE OpenDurianTCAS",
  },
};

/**
 * Resolve a canonical resource from an item's metadata or attributes.
 * Looks for keys: `resourceKey`, `contentKey`, `learningResourceId`, or `englishMode`.
 */
export function resolveCanonicalResource(item: {
  subject?: string | null;
  activity_type?: string | null;
  activityType?: string | null;
  metadata?: Record<string, unknown> | null;
}): CanonicalResource | null {
  const meta = item.metadata;
  if (!meta) return null;

  // 1. Direct key matches
  const keysToCheck = [
    meta.resourceKey,
    meta.contentKey,
    meta.learningResourceId,
    meta.canonicalResourceId,
    meta.englishMode,
  ];

  for (const key of keysToCheck) {
    if (typeof key === "string" && CANONICAL_LEARNING_RESOURCES[key]) {
      return CANONICAL_LEARNING_RESOURCES[key]!;
    }
  }

  // 2. Specific mode fallbacks
  if (meta.englishMode === "foundation_chris_core") {
    return CANONICAL_LEARNING_RESOURCES["foundation_chris_core"]!;
  }
  if (meta.englishMode === "tgat1_exposure") {
    return CANONICAL_LEARNING_RESOURCES["tgat1_exposure"]!;
  }

  return null;
}
