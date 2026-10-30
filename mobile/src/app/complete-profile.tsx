import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import { Chip } from "@/components/ui";

const BLOOD = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
type Profile = { blood_group: string | null; allergies: string | null; chronic_diseases: string | null; medications: string | null; emergency_contact: string | null };

/** Everything here is optional: shown right after sign-up, and reachable from Home and Profile until it's done. */
export default function CompleteProfile() {
  const { request } = useSession();
  const [p, setP] = useState<Profile>({ blood_group: null, allergies: null, chronic_diseases: null, medications: null, emergency_contact: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { request<Profile>("/auth/me/profile").then(setP).catch(() => {}); }, [request]);

  const field = (key: keyof Profile, label: string, placeholder: string, maxLength?: number) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={p[key] ?? ""} onChangeText={(v) => setP({ ...p, [key]: v })} placeholder={placeholder}
        placeholderTextColor="#6e7891" maxLength={maxLength} accessibilityLabel={label} />
    </>
  );
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await request("/auth/me/profile", { method: "PUT", body: JSON.stringify(p) });
      leave();
    } catch (e: any) {
      setError(e.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Complete your profile" }} />
      <Text style={styles.sub}>Helps doctors in an emergency. Takes a minute, and you can change it any time.</Text>
      <Text style={styles.label}>Blood group</Text>
      <View style={styles.chips}>
        {BLOOD.map((b) => <Chip key={b} label={b} on={p.blood_group === b} onPress={() => setP({ ...p, blood_group: p.blood_group === b ? null : b })} />)}
      </View>
      {field("allergies", "Allergies", "e.g. Penicillin, peanuts")}
      {field("chronic_diseases", "Ongoing conditions", "e.g. Diabetes")}
      {field("medications", "Current medicines", "e.g. Metformin 500 mg")}
      {field("emergency_contact", "Emergency contact", "Name and mobile", 100)}
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, busy && { opacity: 0.5 }]} disabled={busy} onPress={save} accessibilityRole="button">
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save & finish</Text>}
      </Pressable>
      <Pressable style={styles.skip} onPress={leave} accessibilityRole="button"><Text style={styles.skipText}>Skip for now</Text></Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  form: { padding: 24, gap: 8, width: "100%", maxWidth: 480, alignSelf: "center" },
  sub: { fontSize: 15, color: colors.muted, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: "600", color: colors.muted, marginTop: 8, marginLeft: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, color: colors.text },
  error: { color: colors.danger },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 14 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  skip: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  skipText: { color: colors.primary, fontWeight: "600" },
});
