export function isAuthorizedMockReleaseCron(
  configuredSecret: string | undefined,
  authorizationHeader: string | null
) {
  return Boolean(
    configuredSecret && authorizationHeader === `Bearer ${configuredSecret}`
  );
}
