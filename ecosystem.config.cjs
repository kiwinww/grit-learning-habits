module.exports = {
  apps: [
    {
      name: process.env.APP_NAME || "family-star-coin",
      script: "node_modules/next/dist/bin/next",
      args: `start -H 127.0.0.1 -p ${process.env.PORT || "3003"}`,
      cwd: process.cwd(),
      env: {
        NODE_ENV: "production",
        DATABASE_URL: process.env.DATABASE_URL || "file:./family-star-coin.db"
      }
    }
  ]
};
