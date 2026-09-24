import Decimal from "decimal.js";
import testRules from "../rules/r76-1-2006-test-rules.json" with { type: "json" };

const valueOf = (instrument, field) => {
  if (field === "maxKg")
    return new Decimal(instrument.max.toString())
      .times({ kg: 1, g: 0.001, mg: 0.000001, t: 1000 }[instrument.unit] ?? 1)
      .toNumber();
  if (field === "tareDevice") return instrument.tareDevice === "Yes";
  if (field === "technology")
    return String(instrument.technology).toUpperCase();
  return instrument[field];
};

const matches = (instrument, condition) => {
  const actual = valueOf(instrument, condition.field);
  switch (condition.operator) {
    case "EQ":
      return actual === condition.value;
    case "IN":
      return condition.value.includes(actual);
    case "LTE":
      return Number(actual) <= Number(condition.value);
    case "LT":
      return Number(actual) < Number(condition.value);
    case "GTE":
      return Number(actual) >= Number(condition.value);
    case "GT":
      return Number(actual) > Number(condition.value);
    default:
      throw new Error(`Unsupported test-plan operator: ${condition.operator}`);
  }
};
export const generateTestPlan = (instrument) =>
  testRules.tests
    .filter(
      (rule) =>
        rule.selection?.always ||
        rule.selection?.all?.every((condition) =>
          matches(instrument, condition),
        ),
    )
    .map((rule, index) => ({
      sequence: index + 1,
      code: rule.code,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      clause: rule.clause,
      status: "PENDING",
    }));
export default generateTestPlan;
