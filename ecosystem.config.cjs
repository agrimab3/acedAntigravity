module.exports = {
  apps: [
    {
      name: "aced-web",
      cwd: "/root/apps/aced/current",
      script: "npm",
      args: "start -- --port 3005",
      env: {
        NODE_ENV: "production",
        PORT: "3005",
      },
    },
  ],
};
