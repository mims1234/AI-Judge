module.exports = {
  apps: [
    {
      name: "ai-judge",
      cwd: "/root/mims/AI-Judge",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3017",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      restart_delay: 3000,
      kill_timeout: 8000,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3017",
        HOSTNAME: "127.0.0.1",
        DATABASE_PATH: "./data/ai-judge.sqlite",
      },
    },
  ],
};
