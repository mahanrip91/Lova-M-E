import { registerPlugin } from "@capacitor/core";

export type OtaUpdater = {
  getOtaStatus(): Promise<{
    activeBundle: string;
    previousBundle: string;
    storageReady: boolean;
  }>;
  confirmBundleReady(): Promise<void>;
  downloadAndVerifyBundle(options: {
    manifestUrl: string;
    signatureUrl: string;
  }): Promise<{
    status: string;
    bundleId: string;
    totalSize: number;
    downloadedBytes: number;
    reusedBytes: number;
    fileCount: number;
    releaseNotes: string;
  }>;
  activateBundle(options: { bundleId: string }): Promise<void>;
  rollbackOta(): Promise<void>;
  resetToBuiltIn(): Promise<void>;
};

export const Ota = registerPlugin<OtaUpdater>("OtaUpdater");
