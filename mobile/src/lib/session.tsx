import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api, ApiError } from "./api";

const KEY = "session_token";

// SecureStore is native-only; the web build (dev/testing) falls back to localStorage.
const store = Platform.OS === "web"
  ? {
      get: async () => localStorage.getItem(KEY),
      set: async (v: string) => localStorage.setItem(KEY, v),
      del: async () => localStorage.removeItem(KEY),
    }
  : {
      get: () => SecureStore.getItemAsync(KEY),
      set: (v: string) => SecureStore.setItemAsync(KEY, v),
      del: () => SecureStore.deleteItemAsync(KEY),
    };

type Session = {
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** ABHA or mobile login. Without `code` it sends the OTP and returns { sent_to, dev_otp? }. */
  otpSignIn: (who: { abha_number?: string; phone?: string }, code?: string) => Promise<{ sent_to: string; dev_otp?: string } | void>;
  /** New patient. Without `code` it emails a code and returns { sent_to, dev_otp? }; with it the account is created. */
  signUp: (details: object, code?: string) => Promise<{ sent_to: string; dev_otp?: string } | void>;
  /** True right after sign-up, so the app can offer the profile step once. */
  newUser: boolean;
  clearNewUser: () => void;
  signOut: () => void;
  /** Authenticated API call; signs out on 401. */
  request: <T = any>(path: string, init?: RequestInit) => Promise<T>;
};

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [newUser, setNewUser] = useState(false);
  const clearNewUser = useCallback(() => setNewUser(false), []);

  useEffect(() => {
    store.get().then(setToken).finally(() => setLoading(false));
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    store.del();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await api<{ access_token: string; role: string }>("/auth/login", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (res.role !== "patient") throw new Error("This app is for patients. Doctors and labs use the web portal.");
    await store.set(res.access_token);
    setToken(res.access_token);
  }, []);

  const otpSignIn = useCallback(async (who: { abha_number?: string; phone?: string }, code?: string) => {
    if (!code) return api<{ sent_to: string; dev_otp?: string }>("/auth/otp/request", null, { method: "POST", body: JSON.stringify(who) });
    const res = await api<{ access_token: string }>("/auth/otp/verify", null, { method: "POST", body: JSON.stringify({ ...who, code }) });
    await store.set(res.access_token);
    setToken(res.access_token);
  }, []);

  const signUp = useCallback(async (details: object, code?: string) => {
    if (!code) return api<{ sent_to: string; dev_otp?: string }>("/auth/signup", null, { method: "POST", body: JSON.stringify(details) });
    const res = await api<{ access_token: string }>("/auth/signup", null, { method: "POST", body: JSON.stringify({ ...details, code }) });
    await store.set(res.access_token);
    setNewUser(true);
    setToken(res.access_token);
  }, []);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit) => {
      try {
        return await api<T>(path, token, init);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) signOut();
        throw e;
      }
    },
    [token, signOut],
  );

  return (
    <SessionContext.Provider value={{ token, isLoading, signIn, otpSignIn, signUp, newUser, clearNewUser, signOut, request }}>
      {children}
    </SessionContext.Provider>
  );
}
