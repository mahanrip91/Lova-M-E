
# M AND E — Capacitor App Skeleton

## Goal
Wrap the existing web application in a native Android shell using Capacitor without changing chat or memory logic.

## Requirements
- Node.js LTS
- Android Studio
- Android SDK
- JDK 17

## Install
```bash
npm install
npm install -D @capacitor/cli
npm install @capacitor/core @capacitor/android @capacitor/app @capacitor/network @capacitor/status-bar @capacitor/keyboard
```

## Initialize Android
```bash
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

## Build
```bash
npm run build
npx cap sync android
```

## Web output
The configured webDir is `dist`.

## Future phases
1. Offline chat with IndexedDB and outbox
2. Media support
3. Online/offline detection
4. Codemagic CI
