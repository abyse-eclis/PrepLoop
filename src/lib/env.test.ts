import { afterEach, describe, expect, it } from "vitest";
import { serverEnv } from "@/lib/env";

const originalReviewModel = process.env.ANTHROPIC_REVIEW_MODEL;

afterEach(() => {
  if (originalReviewModel === undefined) {
    delete process.env.ANTHROPIC_REVIEW_MODEL;
  } else {
    process.env.ANTHROPIC_REVIEW_MODEL = originalReviewModel;
  }
});

describe("serverEnv", () => {
  it("uses the current Claude Haiku model for reviews by default", () => {
    delete process.env.ANTHROPIC_REVIEW_MODEL;

    expect(serverEnv().anthropicReviewModel).toBe("claude-haiku-4-5-20251001");
  });

  it("allows the review model to be configured", () => {
    process.env.ANTHROPIC_REVIEW_MODEL = "configured-review-model";

    expect(serverEnv().anthropicReviewModel).toBe("configured-review-model");
  });
});
