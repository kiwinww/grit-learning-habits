@echo off
cd /d H:\codex\GRIT
set ALIYUN_NGINX=1
set ALIYUN_PROMPT_PASSWORD=1
set SSH2_NODE_ROOT=%TEMP%\grit-ssh-deploy-node
set ALIYUN_LOG=%TEMP%\grit-nginx-node.log
node scripts\deploy-aliyun-password.mjs
echo.
echo Done. Test URL: http://grit.47.99.236.88.sslip.io/
pause
