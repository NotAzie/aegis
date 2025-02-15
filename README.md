# PrivacyBrowser (Prototype v0.1)

A lightweight experimental desktop browser built with Electron that stops web trackers before they load.

## Features (v0.1)
- Custom Electron BrowserWindow with dark mode styling
- In-memory tracker blocking via `webRequest.onBeforeRequest`
- Basic omnibox navigation and DuckDuckGo query fallback
- Minimal in-memory tracker request counter

## Quick Start
```bash
npm install
npm start
```

### Tracker Blocking Rationale
Eliminating third-party tracking cookies, pixels, and beacons directly at the network interception layer.
