import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.mande.chat",
  appName: "M AND E",
  webDir: "www",
  server: {
    url: "https://chat-vault-on-cue.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
    },
  },
};

export default config;
