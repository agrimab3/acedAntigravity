export const MOCK_TEST_DEV_PROVIDER_ID = "local-dev-test-user";

export const MOCK_TEST_STUDENTS = [
  { id: "mock-test-maya", name: "Maya Test", email: "maya@aced.test" },
  { id: "mock-test-leo", name: "Leo Test", email: "leo@aced.test" },
  { id: "mock-test-sam", name: "Sam Test", email: "sam@aced.test" },
] as const;

export type MockTestStudentEmail = (typeof MOCK_TEST_STUDENTS)[number]["email"];
