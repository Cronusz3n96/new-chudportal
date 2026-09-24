#!/bin/bash
set -e
# Oracle Cloud / any Ubuntu VPS one-shot setup for the chudportal
cd /srv/chudportal

export DEBIAN_FRONTEND=noninteractive
echo "==> installing Node 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
apt-get install -y nodejs >/dev/null 2>&1

echo "==> installing deps..."
npm ci --omit=dev

echo "==> enabling PM2 so it stays alive after reboot..."
npm i -g pm2 >/dev/null 2>&1
pm2 start server.js --name chudportal
pm2 save >/dev/null 2>&1
pm2 startup >/dev/null 2>&1

echo "==> done. Your site is on port 3030."
echo "Public IP: $(hostname -I | awk '{print $1}')"
