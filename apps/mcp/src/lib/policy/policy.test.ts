import { describe, expect, it } from "vitest";
import { applyPolicyOverrides, evaluatePolicy, getPolicyPreset } from "./policy.js";

const batchInput = {
  summary: {
    total: 10,
    byStatus: {
      verified: 6,
      verified_with_warnings: 1,
      needs_review: 1,
      unresolved: 1,
      not_checked: 1
    },
    duplicates: 0
  },
  sourceHealth: [],
  failureSummary: [
    {
      source: "crossref",
      failureClass: "payload_shape_failure",
      count: 1
    }
  ]
};

describe("policy presets", () => {
  it("fails default policy on payload shape failure", () => {
    const decision = evaluatePolicy(getPolicyPreset("default"), batchInput);
    expect(decision.exitCode).toBe(2);
    expect(decision.exitReasons).toContain("payload_shape_failure_violation");
  });

  it("fails strict policy on verified ratio", () => {
    const decision = evaluatePolicy(getPolicyPreset("strict"), {
      ...batchInput,
      failureSummary: [],
      summary: {
        ...batchInput.summary,
        byStatus: {
          verified: 6,
          verified_with_warnings: 1,
          needs_review: 1,
          unresolved: 1,
          not_checked: 1
        }
      }
    });
    expect(decision.exitReasons).toContain("verified_ratio_violation");
  });

  it("applies override thresholds", () => {
    const policy = applyPolicyOverrides(getPolicyPreset("lenient"), {
      maxUnresolvedRatio: 0.05,
      failOnFailureClasses: ["rate_limit_failure"]
    });
    const decision = evaluatePolicy(policy, {
      ...batchInput,
      failureSummary: [
        {
          source: "pubmed",
          failureClass: "rate_limit_failure",
          count: 2
        }
      ]
    });
    expect(decision.exitReasons).toContain("rate_limit_failure_violation");
    expect(decision.exitReasons).toContain("unresolved_ratio_violation");
  });
});
