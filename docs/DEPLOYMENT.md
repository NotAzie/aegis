# Deployment & Operations Guide

## 1. Environments Supported
- Node.js LTS (v18.x, v20.x, v22.x)
- Linux (Ubuntu 20.04+, Debian 11+, RHEL 9+)
- macOS (macOS 12 Monterey or higher)
- Windows (Windows 10, Windows 11, Windows Server 2022)

## 2. Production Build Pipeline

### 2.1 Verification Gate
All automated regression tests must pass prior to artifact generation:
```bash
npm run test
```

### 2.2 Compilation
To build standalone executable packages:
```bash
# Windows
npm run dist -- --win

# macOS
npm run dist -- --mac

# Linux
npm run dist -- --linux
```

## 3. Headless Proxy Integration
To integrate Aegis as an edge gateway proxy:
```javascript
const express = require('express');
const { createShield, createHttpPrivacyProxy } = require('@aegis-protocol/core');

const app = express();
const shield = createShield({ mode: 'AUTONOMOUS' });

app.use(createHttpPrivacyProxy(shield));
app.listen(8080, () => {
  console.log('Aegis Gateway Proxy active on port 8080');
});
```
