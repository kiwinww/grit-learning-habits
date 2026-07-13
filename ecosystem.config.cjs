module.exports = {
  apps: [
    {
      name: "grit-learning-habits",
      script: "npm",
      args: "start -- --hostname 127.0.0.1",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3001",
        HOSTNAME: process.env.HOSTNAME || "127.0.0.1",
        DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db"
      }
    }
  ]
};
