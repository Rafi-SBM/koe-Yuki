---
title: Yuki Voice Worker
emoji: 🎙️
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 8081
pinned: false
---

Yuki's worker health server listens on port 8081. This is an outbound LiveKit
worker; its browser frontend runs separately. Build from the prepared directory
produced by `scripts/package-space.sh`. Set worker credentials as Space secrets.
Use persistent paid compute for a live service; sleeping development compute
cannot meet availability requirements. Benchmark the selected hardware before
raising the admission limit.
