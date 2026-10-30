import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import DateField from "@/components/DateField";
import { Segmented } from "@/components/ui";

const GENDERS = [{ key: "Female", label: "Female" }, { key: "Male", label: "Male" }, { key: "Other", label: "Other" }] as const;
type Gender = (typeof GENDERS)[number]["key"];

/** New patient: primary information, then an emailed code. The profile step follows (and can be skipped). */
export default function SignUp() {
  const { signUp } = useSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [sent, setSent] = useState<{ sent_to: string; dev_otp?: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const details = { display_name: name.trim(), phone: phone.trim(), email: email.trim(), password, date_of_birth: dob || null, gender };
  const problem = name.trim().length < 2 ? "Enter your full name."
    : phone.replace(/\D/g, "").length < 10 ? "Enter your 10-digit mobile number."
    : !/^\S+@\S+\.\S+$/.test(email.trim()) ? "Enter a valid email."
    : password.length < 8 ? "Use a password of at least 8 characters." : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };
  const sendCode = () => {
    if (problem) return setError(problem);
    run(async () => { setSent((await signUp(details)) || null); setCode(""); });
  };
  const verify = () => run(() => signUp(details, code.trim()));

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.steps} accessibilityLabel={`Step ${sent ? 2 : 1} of 3`}>
            <View style={[styles.step, styles.stepOn]} />
            <View style={[styles.step, sent && styles.stepOn]} />
            <View style={styles.step} />
          </View>

          {!sent ? (
            <>
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.sub}>Just the basics. You can add the rest later.</Text>
              <Text style={styles.label}>Full name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} autoComplete="name" textContentType="name" accessibilityLabel="Full name" />
              <Text style={styles.label}>Mobile number</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="10-digit number" placeholderTextColor="#6e7891" accessibilityLabel="Mobile number" />
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" accessibilityLabel="Email" />
              <Text style={styles.label}>Create a password</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="At least 8 characters" placeholderTextColor="#6e7891" accessibilityLabel="Create a password" />
              <Text style={styles.label}>Date of birth (optional)</Text>
              <View style={styles.input}><DateField value={dob} onChange={setDob} label="Date of birth" style={styles.inline} /></View>
              <Text style={styles.label}>Gender (optional)</Text>
              <Segmented options={[...GENDERS]} value={gender as Gender} onChange={setGender} />
            </>
          ) : (
            <>
              <Text style={styles.title}>Check your email</Text>
              <Text style={styles.sub}>We sent a 6-digit code to {sent.sent_to}.{sent.dev_otp ? ` (Demo code: ${sent.dev_otp})` : ""}</Text>
              <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoFocus
                autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="000000" placeholderTextColor="#b8c2d3" onSubmitEditing={verify} accessibilityLabel="6-digit code" />
              <Pressable onPress={sendCode} disabled={busy} style={styles.linkBtn} accessibilityRole="button"><Text style={styles.link}>Send a new code</Text></Pressable>
              <Pressable onPress={() => { setSent(null); setError(null); }} style={styles.linkBtn} accessibilityRole="button"><Text style={styles.link}>Change my details</Text></Pressable>
            </>
          )}

          {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
          <Pressable style={[styles.button, (busy || (!!sent && code.length !== 6)) && styles.disabled]} disabled={busy || (!!sent && code.length !== 6)}
            onPress={sent ? verify : sendCode} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{sent ? "Verify & continue" : "Continue"}</Text>}
          </Pressable>
          <Pressable onPress={() => router.replace("/sign-in")} style={styles.linkBtn} accessibilityRole="button"><Text style={styles.link}>I already have an account</Text></Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 20, gap: 8, width: "100%", maxWidth: 480, alignSelf: "center" },
  steps: { flexDirection: "row", gap: 6, marginBottom: 12 },
  step: { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#d5dbe5" },
  stepOn: { backgroundColor: colors.primary },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  sub: { fontSize: 15, color: colors.muted, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 6, marginLeft: 4 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: colors.text },
  inline: { fontSize: 16, color: colors.text, padding: 0 },
  code: { fontSize: 26, fontWeight: "700", letterSpacing: 8, textAlign: "center" },
  linkBtn: { minHeight: 44, justifyContent: "center", alignItems: "center" },
  link: { color: colors.primary, fontWeight: "600" },
  error: { color: colors.danger, marginTop: 4 },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 10 },
  disabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
