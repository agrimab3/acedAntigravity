module.exports = {
  apps: [{
    name: "aced-staging",
    cwd: "/home/ubuntu/apps/aced-staging/current",
    script: "npm",
    args: "start -- --port 3006",
    env: { NODE_ENV: "production", PORT: "3006", ACED_DEPLOYMENT_ENV: "staging" },
  }],
};
