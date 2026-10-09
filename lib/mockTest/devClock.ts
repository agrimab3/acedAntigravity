export function getMockTestServerNow() {
  const override = process.env.MOCK_TEST_DEV_NOW?.trim();

  if (!override) return new Date();

  if (process.env.NODE_ENV === "production") {
    throw new Error("MOCK_TEST_DEV_NOW is forbidden in production.");
  }

  const parsed = new Date(override);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("MOCK_TEST_DEV_NOW must be a valid ISO date/time.");
  }

  return parsed;
}
