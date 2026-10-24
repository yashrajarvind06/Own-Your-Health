import { useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Segmented } from "@/components/ui";

type Mode = "abha" | "phone" | "email";
const MODES: { key: Mode; label: string }[] = [
  { key: "abha", label: "ABHA" },
  { key: "phone", label: "Mobile OTP" },
  { key: "email", label: "Email" },
];

export default function SignIn() {
  const { signIn, otpSignIn } = useSession();
  const [mode, setMode] = useState<Mode>("abha");
  const [id, setId] = useState(""); // ABHA number, phone or email
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState<{ sent_to: string; dev_otp?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const who = mode === "abha" ? { abha_number: id.trim() } : { phone: id.trim() };

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (mode === "email") return signIn(id.trim(), password);
      if (!otpSent) return setOtpSent((await otpSignIn(who)) || null);
      return otpSignIn(who, otp.trim());
    });

  const switchMode = (m: Mode) => {
    setMode(m);
    setId("");
    setOtp("");
    setOtpSent(null);
    setError(null);
  };

  const canSubmit = !!id && (mode === "email" ? !!password : !otpSent || otp.length === 6);
  const placeholder = mode === "abha" ? "ABHA number (14 digits)" : mode === "phone" ? "10-digit mobile number" : "Email";

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Image source={require("../../assets/logo-mark.png")} style={styles.logo} accessibilityLabel="OwnYourHealth logo" />
          <Text style={styles.brand}>Own<Text style={{ color: colors.primary }}>Your</Text>Health</Text>
          <Text style={styles.tagline}>Your health records, your control</Text>

          <Segmented options={MODES} value={mode} onChange={switchMode} />
          {mode === "abha" && <Text style={styles.hint}>Government-verified login. We send an OTP to the mobile linked to your ABHA.</Text>}

          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor="#6e7891"
            autoCapitalize="none"
            keyboardType={mode === "email" ? "email-address" : "number-pad"}
            value={id}
            editable={!otpSent}
            onChangeText={setId}
            accessibilityLabel={placeholder}
          />
          {mode === "email" && (
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#6e7891" secureTextEntry autoComplete="password" textContentType="password" value={password}
              onChangeText={setPassword} onSubmitEditing={submit} accessibilityLabel="Password" />
          )}
          {otpSent && (
            <>
              <Text style={styles.hint}>OTP sent to {otpSent.sent_to}.{otpSent.dev_otp ? ` (Demo OTP: ${otpSent.dev_otp})` : ""}</Text>
              <TextInput style={styles.input} placeholder="6-digit OTP" placeholderTextColor="#6e7891" keyboardType="number-pad" maxLength={6}
                autoComplete="sms-otp" textContentType="oneTimeCode"
                value={otp} onChangeText={setOtp} onSubmitEditing={submit} accessibilityLabel="OTP" autoFocus />
              <Pressable onPress={() => { setOtpSent(null); setOtp(""); }}>
                <Text style={styles.link}>Change number / resend</Text>
              </Pressable>
            </>
          )}
          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={[styles.button, (busy || !canSubmit) && styles.disabled]} disabled={busy || !canSubmit}
            onPress={submit} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.buttonText}>{mode === "email" ? "Sign in" : otpSent ? "Verify & continue" : "Send OTP"}</Text>
            )}
          </Pressable>
          <Link href="/emergency" style={styles.emergency}>Emergency card (works offline)</Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, gap: 12 },
  logo: { width: 84, height: 84, alignSelf: "center", marginBottom: 4 },
  brand: { fontSize: 34, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.4 },
  tagline: { fontSize: 15, color: colors.muted, textAlign: "center", marginBottom: 16 },
  tabs: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  tabOn: { backgroundColor: colors.primarySoft },
  tabText: { color: colors.muted, fontWeight: "600" },
  tabTextOn: { color: colors.primary },
  hint: { color: colors.muted, fontSize: 13 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.text },
  link: { color: colors.primary, fontWeight: "600" },
  error: { color: colors.danger },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  emergency: { color: colors.danger, fontWeight: "600", textAlign: "center", marginTop: 16 },
});
