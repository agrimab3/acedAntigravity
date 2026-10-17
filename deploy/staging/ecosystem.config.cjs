module.exports = {
  apps: [{
    name: "aced-staging",
    cwd: "/home/ubuntu/apps/aced-staging/current",
    script: "deploy/staging/start-staging.sh",
    interpreter: "bash",
    env: { NODE_ENV: "production", PORT: "3006", ACED_DEPLOYMENT_ENV: "staging" },
  }],
};
