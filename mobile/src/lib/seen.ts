import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** A per-device "already shown" flag for first-run help. Same split as lib/session: SecureStore is native-only. */
export const seenFlag = (key: string) => Platform.OS === "web"
  ? { get: async () => { try { return localStorage.getItem(key); } catch { return "1"; } }, set: async () => { try { localStorage.setItem(key, "1"); } catch {} } }
  : { get: () => SecureStore.getItemAsync(key), set: () => SecureStore.setItemAsync(key, "1") };
