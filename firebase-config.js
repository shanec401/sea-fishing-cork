// ============================================================================
// CORK SHORE ANGLER — FIREBASE CONFIGURATION
// ============================================================================
// Pre-configured with your Firebase project so Authentication, Admin access,
// and the Members-Only Anglers Forum work out of the box. You can also update
// this anytime via the "Firebase Connected / Setup DB" button in the top bar.

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCmUSdT1dQgmPlnvdmW9VnhH0wJJ582vR0",
  authDomain: "sports-results-dcfb6.firebaseapp.com",
  projectId: "sports-results-dcfb6",
  storageBucket: "sports-results-dcfb6.firebasestorage.app",
  messagingSenderId: "427084615882",
  appId: "1:427084615882:web:c52cbdfc4aa6b5074ee433",
  measurementId: "G-3B1YPBHVRT"
};

const STORAGE_KEY = "cork_shore_angler_fb_config_v1";

export function getActiveFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Could not read custom Firebase config:", e);
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveCustomFirebaseConfig(configObj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(configObj));
}

export function clearCustomFirebaseConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isFirebaseConfigured(config = getActiveFirebaseConfig()) {
  return Boolean(
    config &&
      config.apiKey &&
      !config.apiKey.includes("YOUR_") &&
      config.projectId &&
      !config.projectId.includes("YOUR_")
  );
}
