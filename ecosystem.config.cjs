module.exports = {
  apps: [
    {
      name: "grit-learning-habits",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
        DATABASE_URL: "file:./dev.db"
      }
    }
  ]
};
