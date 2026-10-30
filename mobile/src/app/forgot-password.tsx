import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { router, Stack } from "expo-router";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";

/** Email a reset code, then set a new password with it. */
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ dev_otp?: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const post = async (path: string, body: object) => {
    setBusy(true);
    setError(null);
    try {
      return await api<any>(path, null, { method: "POST", body: JSON.stringify(body) });
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      return null;
    } finally {
      setBusy(false);
    }
  };
  const request = async () => { const r = await post("/auth/password/forgot", { email: email.trim() }); if (r) setSent(r); };
  const reset = async () => { if (await post("/auth/password/reset", { email: email.trim(), code: code.trim(), new_password: password })) setDone(true); };

  const can = sent ? code.length === 6 && password.length >= 8 : /^\S+@\S+\.\S+$/.test(email.trim());
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Reset password" }} />
      {done ? (
        <>
          <Text style={styles.title}>Password changed</Text>
          <Text style={styles.sub}>Sign in with your new password.</Text>
          <Pressable style={styles.button} onPress={() => router.replace("/sign-in")} accessibilityRole="button"><Text style={styles.buttonText}>Back to sign in</Text></Pressable>
        </>
      ) : (
        <>
          <Text style={styles.sub}>{sent ? `If ${email.trim()} has an account, we've emailed it a 6-digit code.${sent.dev_otp ? ` (Demo code: ${sent.dev_otp})` : ""}` : "Enter your account's email and we'll send you a code."}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} editable={!sent} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="Email" placeholderTextColor="#6e7891" accessibilityLabel="Email" />
          {sent && (
            <>
              <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="6-digit code" placeholderTextColor="#6e7891" accessibilityLabel="6-digit code" />
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="New password (at least 8 characters)" placeholderTextColor="#6e7891" accessibilityLabel="New password" />
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable style={[styles.button, (busy || !can) && styles.disabled]} disabled={busy || !can} onPress={sent ? reset : request} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{sent ? "Change password" : "Send code"}</Text>}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: { padding: 24, gap: 12, width: "100%", maxWidth: 480, alignSelf: "center" },
  title: { fontSize: 24, fontWeight: "800", color: colors.text },
  sub: { fontSize: 15, color: colors.muted },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  error: { color: colors.danger },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
