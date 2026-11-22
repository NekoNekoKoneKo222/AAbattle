@echo off
chcp 65001 >nul
echo Disabling SPRA Tailscale Funnel HTTPS :443...
tailscale funnel --https=443 off
tailscale funnel status
echo If the SPRA Node window is still running, close it as well.
pause
