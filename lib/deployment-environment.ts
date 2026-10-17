export type AcedDeploymentEnvironment = "production" | "staging" | "development";

export const ACED_PRODUCTION_ORIGIN = "https://aceditprep.com";
export const ACED_STAGING_ORIGIN = "https://staging.aceditprep.com";

export function getAcedDeploymentEnvironment(input = process.env.ACED_DEPLOYMENT_ENV): AcedDeploymentEnvironment {
  if (input === "staging") return "staging";
  if (input === "production") return "production";
  return "development";
}

export function isAcedStaging(input = process.env.ACED_DEPLOYMENT_ENV) {
  return getAcedDeploymentEnvironment(input) === "staging";
}
