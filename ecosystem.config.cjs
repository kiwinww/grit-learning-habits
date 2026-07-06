module.exports = {
  apps: [
    {
      name: "grit-learning-habits",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || "3001",
        HOSTNAME: "0.0.0.0",
        DATABASE_URL: "file:./dev.db"
      }
    }
  ]
};
