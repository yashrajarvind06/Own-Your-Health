import { useCallback, useEffect, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { File, Paths } from "expo-file-system";
import { useSession } from "@/lib/session";
import { API_BASE } from "@/lib/api";
import { colors } from "@/lib/theme";
import { Button, Card, Chip, Muted, ui } from "@/components/ui";
import NearbyHelp from "@/components/NearbyHelp";

type Profile = Record<string, any> & { exists?: boolean; card_token?: string };

const FIELDS: { key: string; label: string; multiline?: boolean }[] = [
  { key: "name", label: "Full name" },
  { key: "date_of_birth", label: "Date of birth (YYYY-MM-DD)" },
  { key: "phone", label: "Phone" },
  { key: "emergency_contact", label: "Emergency contact (name & number)" },
  { key: "allergies", label: "Allergies", multiline: true },
  { key: "chronic_conditions", label: "Chronic conditions", multiline: true },
  { key: "medications", label: "Current medications", multiline: true },
  { key: "surgeries", label: "Past surgeries", multiline: true },
];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const GENDERS = [{ key: "male", label: "Male" }, { key: "female", label: "Female" }, { key: "other", label: "Other" }];

// Offline copy (docx: works without internet, read-only). Web has no app file system, so it uses localStorage.
const cache = Platform.OS === "web"
  ? { save: async (p: Profile) => localStorage.setItem("emergency_card", JSON.stringify(p)),
      load: async (): Promise<Profile | null> => JSON.parse(localStorage.getItem("emergency_card") || "null"),
      qrUri: (token: string) => `${API_BASE}/api/emergency-qr/qr/${token}` }
  : { save: async (p: Profile) => {
        const f = new File(Paths.document, "emergency_card.json");
        f.write(JSON.stringify(p));
        if (p.card_token) await File.downloadFileAsync(`${API_BASE}/api/emergency-qr/qr/${p.card_token}`, new File(Paths.document, "emergency_qr.png"), { idempotent: true });
      },
      load: async (): Promise<Profile | null> => {
        const f = new File(Paths.document, "emergency_card.json");
        return f.exists ? JSON.parse(await f.text()) : null;
      },
      qrUri: () => new File(Paths.document, "emergency_qr.png").uri };

export default function EmergencyCard() {
  const { token, request } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Profile>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (!token) throw new Error("signed out");
      const p = await request<Profile>("/api/emergency-qr/me");
      setProfile(p.exists ? p : null);
      setOffline(false);
      if (p.exists) await cache.save(p).catch(() => {});
      if (!p.exists) setEditing(true);
    } catch {
      setProfile(await cache.load().catch(() => null));
      setOffline(true);
    }
  }, [token, request]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { exists, card_token, patient_id, ...fields } = { ...profile, ...draft };
      await request("/api/emergency-qr/save", { method: "POST", body: JSON.stringify(fields) });
      setEditing(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const v = { ...profile, ...draft };
    const set = (k: string, val: string) => setDraft({ ...draft, [k]: val });
    return (
      <ScrollView style={ui.screen} contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: "Edit emergency card" }} />
        <NearbyHelp />
        <Muted>Shown to anyone who scans your emergency QR, without logging in. Keep it to what saves your life.</Muted>
        <Card>
          <Text style={ui.label}>Blood group</Text>
          <View style={ui.wrap}>{BLOOD.map((b) => <Chip key={b} label={b} on={v.blood_group === b} onPress={() => set("blood_group", b)} />)}</View>
          <Text style={ui.label}>Gender</Text>
          <View style={ui.wrap}>{GENDERS.map((g) => <Chip key={g.key} label={g.label} on={v.gender === g.key} onPress={() => set("gender", g.key)} />)}</View>
          {FIELDS.map((f) => (
            <View key={f.key} style={{ gap: 4 }}>
              <Text style={ui.label}>{f.label}</Text>
              <TextInput style={[ui.input, f.multiline && { minHeight: 60, textAlignVertical: "top" }]} value={v[f.key] ?? ""}
                onChangeText={(t) => set(f.key, t)} multiline={f.multiline} accessibilityLabel={f.label} />
            </View>
          ))}
        </Card>
        {error && <Text style={ui.error}>{error}</Text>}
        <View style={ui.row}>
          {profile && <Button label="Cancel" kind="ghost" onPress={() => { setEditing(false); setDraft({}); }} />}
          <View style={{ flex: 1 }}><Button label="Save card" onPress={save} busy={busy} /></View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Stack.Screen options={{ title: "Emergency card" }} />
      <NearbyHelp />
      {offline && <Text style={styles.offline}>Offline copy · read-only</Text>}
      {!profile ? (
        <Muted>No emergency card saved on this phone yet. Sign in once with internet to download it.</Muted>
      ) : (
        <>
          <Card style={styles.card}>
            <Text style={styles.name}>{profile.name ?? "—"}</Text>
            <Text style={styles.blood}>Blood group {profile.blood_group ?? "—"}</Text>
            <Line label="Allergies" value={profile.allergies} danger />
            <Line label="Conditions" value={profile.chronic_conditions} />
            <Line label="Medications" value={profile.medications} />
            <Line label="Surgeries" value={profile.surgeries} />
            <Line label="Emergency contact" value={profile.emergency_contact} />
          </Card>
          {profile.card_token && (
            <Card style={{ alignItems: "center" }}>
              <Image source={{ uri: cache.qrUri(profile.card_token) }} style={styles.qr} accessibilityLabel="Emergency QR code" />
              <Muted>Doctors and paramedics scan this to see the card above.</Muted>
            </Card>
          )}
          {!offline && <Button label="Edit card" kind="ghost" onPress={() => setEditing(true)} />}
        </>
      )}
    </ScrollView>
  );
}

function Line({ label, value, danger }: { label: string; value?: string | null; danger?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, danger && { color: colors.danger, fontWeight: "700" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  offline: { color: colors.warn, fontWeight: "700", textAlign: "center" },
  card: { borderColor: colors.danger, borderWidth: 2 },
  name: { fontSize: 22, fontWeight: "800", color: colors.text },
  blood: { fontSize: 18, fontWeight: "700", color: colors.danger },
  line: { gap: 2 },
  lineLabel: { color: colors.muted, fontWeight: "600" },
  lineValue: { color: colors.text, fontSize: 16 },
  qr: { width: 220, height: 220 },
});
