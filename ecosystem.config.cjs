module.exports = {
  apps: [
    {
      name: "aced-web",
      cwd: "/home/ubuntu/apps/aced/current",
      script: "npm",
      // The public edge is Caddy. Never expose the Next server directly.
      args: "start -- --hostname 127.0.0.1 --port 3005",
      env: {
        NODE_ENV: "production",
        HOSTNAME: "127.0.0.1",
        PORT: "3005",
      },
    },
  ],
};
