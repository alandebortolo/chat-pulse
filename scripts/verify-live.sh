#!/bin/sh
# Real-device smoke test; requires the workspace's existing browse CLI, no npm dependency.
set -eu
channel=${1:-gaules}
case "$channel" in *[!a-zA-Z0-9_]*|'') echo 'Invalid channel' >&2; exit 1;; esac
url="https://chat-pulse.designmaster.workers.dev/overlay?channel=$channel"
browse s25 open "$url"
browse s25 wait --text 'Chat connected' 45
browse s25 js 'const panel=document.querySelector(".instrument"); const bg=getComputedStyle(document.body).backgroundColor; if(!panel || bg!=="rgba(0, 0, 0, 0)" || document.documentElement.scrollWidth>innerWidth) throw Error("Overlay layout failed"); return {channel:document.querySelector("#channel").textContent, status:document.querySelector("#status").textContent, hype:document.querySelector("#hype").textContent, transparent:bg, width:innerWidth};'
browse s25 reload
browse s25 wait --text 'Chat connected' 45
browse s25 shot /tmp/chat-pulse-live.png
curl --fail --silent --show-error "https://chat-pulse.designmaster.workers.dev/api/pulse?channel=$channel"
printf '\n'
