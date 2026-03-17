import type { SourceFailureClass } from "@citecheck/core";

export type PolicyMetric =
  | "not_checked_ratio"
  | "unresolved_ratio"
  | "verified_ratio"
  | "needs_review_ratio"
  | "failure_class_count";

export type PolicyOperator = "gt" | "gte" | "lt" | "lte";
export type PolicyPresetName = "default" | "strict" | "lenient";

export interface PolicyRule {
  id: string;
  metric: PolicyMetric;
  operator: PolicyOperator;
  threshold: number;
  failureClass?: SourceFailureClass;
  code: string;
  message: string;
}

export interface ExitPolicy {
  name: string;
  rules: PolicyRule[];
}

export interface PolicyViolation {
  ruleId: string;
  code: string;
  message: string;
  actual: number;
  threshold: number;
  operator: PolicyOperator;
  failureClass?: SourceFailureClass;
}

export interface PolicyEvaluationResult {
  policyName: string;
  passed: boolean;
  violations: PolicyViolation[];
}

export interface ExitDecision {
  exitCode: number;
  exitReasons: string[];
  policyResult: PolicyEvaluationResult;
}

export interface PolicyFailureSummaryItem {
  source: string;
  failureClass: string;
  failureReason?: string;
  count: number;
}

export interface PolicySourceHealthItem {
  source: string;
  matched: number;
  empty: number;
  failed: number;
  enriched: number;
  skipped: number;
}

export interface BatchPolicyInput {
  summary: {
    total: number;
    byStatus: Record<string, number>;
    duplicates: number;
  };
  sourceHealth: PolicySourceHealthItem[];
  failureSummary: PolicyFailureSummaryItem[];
}

export interface PolicyOverrides {
  failOnFailureClasses?: SourceFailureClass[];
  maxNotCheckedRatio?: number;
  maxUnresolvedRatio?: number;
  minVerifiedRatio?: number;
  maxNeedsReviewRatio?: number;
}

export function getPolicyPreset(name: PolicyPresetName): ExitPolicy {
  if (name === "strict") {
    return {
      name,
      rules: [
        failureClassRule("auth_failure", `${name}:auth_failure`, "strict policy blocks auth failures"),
        failureClassRule("rate_limit_failure", `${name}:rate_limit_failure`, "strict policy blocks rate limit failures"),
        failureClassRule("payload_shape_failure", `${name}:payload_shape_failure`, "strict policy blocks payload shape failures"),
        ratioRule("not_checked_ratio", "gt", 0.05, `${name}:not_checked_ratio`, "strict policy exceeded not_checked ratio"),
        ratioRule("unresolved_ratio", "gt", 0.1, `${name}:unresolved_ratio`, "strict policy exceeded unresolved ratio"),
        ratioRule("verified_ratio", "lt", 0.7, `${name}:verified_ratio`, "strict policy did not reach verified ratio")
      ]
    };
  }
  if (name === "lenient") {
    return {
      name,
      rules: [
        failureClassRule("auth_failure", `${name}:auth_failure`, "lenient policy blocks auth failures"),
        failureClassRule("payload_shape_failure", `${name}:payload_shape_failure`, "lenient policy blocks payload shape failures"),
        ratioRule("not_checked_ratio", "gt", 0.25, `${name}:not_checked_ratio`, "lenient policy exceeded not_checked ratio"),
        ratioRule("unresolved_ratio", "gt", 0.3, `${name}:unresolved_ratio`, "lenient policy exceeded unresolved ratio")
      ]
    };
  }
  return {
    name,
    rules: [
      failureClassRule("auth_failure", `${name}:auth_failure`, "default policy blocks auth failures"),
      failureClassRule("payload_shape_failure", `${name}:payload_shape_failure`, "default policy blocks payload shape failures"),
      ratioRule("not_checked_ratio", "gt", 0.1, `${name}:not_checked_ratio`, "default policy exceeded not_checked ratio"),
      ratioRule("unresolved_ratio", "gt", 0.15, `${name}:unresolved_ratio`, "default policy exceeded unresolved ratio")
    ]
  };
}

export function applyPolicyOverrides(base: ExitPolicy, overrides: PolicyOverrides): ExitPolicy {
  let rules = [...base.rules];
  if (overrides.failOnFailureClasses && overrides.failOnFailureClasses.length > 0) {
    for (const failureClass of overrides.failOnFailureClasses) {
      const ruleId = `override:fail_on:${failureClass}`;
      rules = rules.filter((rule) => rule.id !== ruleId);
      rules.push(failureClassRule(failureClass, ruleId, `override blocks ${failureClass}`));
    }
  }
  rules = replaceRatioRule(rules, "not_checked_ratio", overrides.maxNotCheckedRatio, "gt", "override:not_checked_ratio", "override exceeded not_checked ratio");
  rules = replaceRatioRule(rules, "unresolved_ratio", overrides.maxUnresolvedRatio, "gt", "override:unresolved_ratio", "override exceeded unresolved ratio");
  rules = replaceRatioRule(rules, "verified_ratio", overrides.minVerifiedRatio, "lt", "override:verified_ratio", "override did not reach verified ratio");
  rules = replaceRatioRule(rules, "needs_review_ratio", overrides.maxNeedsReviewRatio, "gt", "override:needs_review_ratio", "override exceeded needs_review ratio");
  return {
    name: base.name,
    rules
  };
}

export function evaluatePolicy(policy: ExitPolicy, input: BatchPolicyInput): ExitDecision {
  const violations = policy.rules
    .map((rule) => evaluateRule(rule, input))
    .filter((violation): violation is PolicyViolation => violation !== undefined);
  const policyResult: PolicyEvaluationResult = {
    policyName: policy.name,
    passed: violations.length === 0,
    violations
  };
  return {
    exitCode: violations.length === 0 ? 0 : 2,
    exitReasons: violations.map((violation) => violation.code),
    policyResult
  };
}

function evaluateRule(rule: PolicyRule, input: BatchPolicyInput): PolicyViolation | undefined {
  const actual = readMetric(rule, input);
  if (!compare(actual, rule.operator, rule.threshold)) {
    return undefined;
  }
  return {
    ruleId: rule.id,
    code: rule.code,
    message: rule.message,
    actual,
    threshold: rule.threshold,
    operator: rule.operator,
    failureClass: rule.failureClass
  };
}

function readMetric(rule: PolicyRule, input: BatchPolicyInput): number {
  const total = Math.max(1, input.summary.total);
  if (rule.metric === "failure_class_count") {
    return input.failureSummary
      .filter((item) => item.failureClass === rule.failureClass)
      .reduce((sum, item) => sum + item.count, 0);
  }
  if (rule.metric === "not_checked_ratio") {
    return (input.summary.byStatus.not_checked ?? 0) / total;
  }
  if (rule.metric === "unresolved_ratio") {
    return (input.summary.byStatus.unresolved ?? 0) / total;
  }
  if (rule.metric === "verified_ratio") {
    return (input.summary.byStatus.verified ?? 0) / total;
  }
  return (input.summary.byStatus.needs_review ?? 0) / total;
}

function compare(actual: number, operator: PolicyOperator, threshold: number): boolean {
  if (operator === "gt") {
    return actual > threshold;
  }
  if (operator === "gte") {
    return actual >= threshold;
  }
  if (operator === "lt") {
    return actual < threshold;
  }
  return actual <= threshold;
}

function failureClassRule(failureClass: SourceFailureClass, id: string, message: string): PolicyRule {
  return {
    id,
    metric: "failure_class_count",
    operator: "gt",
    threshold: 0,
    failureClass,
    code: `${failureClass}_violation`,
    message
  };
}

function ratioRule(
  metric: Exclude<PolicyMetric, "failure_class_count">,
  operator: PolicyOperator,
  threshold: number,
  id: string,
  message: string
): PolicyRule {
  return {
    id,
    metric,
    operator,
    threshold,
    code: `${metric}_violation`,
    message
  };
}

function replaceRatioRule(
  rules: PolicyRule[],
  metric: Exclude<PolicyMetric, "failure_class_count">,
  threshold: number | undefined,
  operator: PolicyOperator,
  id: string,
  message: string
): PolicyRule[] {
  if (threshold === undefined) {
    return rules;
  }
  return [...rules.filter((rule) => rule.id !== id && rule.metric !== metric), ratioRule(metric, operator, threshold, id, message)];
}
