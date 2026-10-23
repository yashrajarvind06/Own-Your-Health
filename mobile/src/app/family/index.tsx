import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, Stack, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { colors, PERMISSIONS } from "@/lib/theme";
import { Group, Muted, Row, Segmented, ui } from "@/components/ui";

export type Member = {
  id: number; name: string; relation: string; phone: string; permissions: string[];
  is_primary_caregiver: boolean; expires_at: string | null; verified: boolean;
};
type CaringFor = Member & { patient_id: number; patient_name: string | null };

const permLabel = (k: string) => PERMISSIONS.find((p) => p.key === k)?.label ?? k;
const until = (iso: string | null) => (iso ? `Until ${new Date(iso + "Z").toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "Permanent");
const DURATIONS = [{ key: "keep", label: "Keep" }, { key: "7", label: "7 days" }, { key: "30", label: "30 days" }, { key: "perm", label: "Permanent" }] as const;
type Dur = (typeof DURATIONS)[number]["key"];

/** Family & caregivers (reached from Profile): who can help me, and whom I help. */
export default function Family() {
  const { request } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [caring, setCaring] = useState<CaringFor[]>([]);
  const [editing, setEditing] = useState<Member | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [primary, setPrimary] = useState(false);
  const [dur, setDur] = useState<Dur>("keep");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [m, c] = await Promise.all([
      request<Member[]>("/family/members").catch(() => []),
      request<CaringFor[]>("/family/caring-for").catch(() => []),
    ]);
    setMembers(m);
    setCaring(c);
  }, [request]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEdit = (m: Member) => {
    setEditing(m); setPerms(m.permissions); setPrimary(m.is_primary_caregiver); setDur("keep"); setConfirmRemove(false); setError(null);
  };

  const save = async () => {
    if (!editing) return;
    const keepDays = editing.expires_at ? Math.max(1, Math.ceil((Date.parse(editing.expires_at + "Z") - Date.now()) / 86400000)) : null;
    const days = dur === "keep" ? keepDays : dur === "perm" ? null : Number(dur);
    try {
      await request(`/family/members/${editing.id}`, { method: "PATCH", body: JSON.stringify({ permissions: perms, is_primary_caregiver: primary, duration_days: days }) });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const remove = async () => {
    if (!editing) return;
    await request(`/family/members/${editing.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    setEditing(null);
    load();
  };

  return (
    <>
      <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { maxWidth: 760 }]}>
        <Stack.Screen options={{ title: "Family & caregivers" }} />
        <Group label="Who can help me" footer="Family members act only within the permissions you choose. Everything they do is recorded in your access history.">
          {members.map((m) => (
            <Row key={m.id} title={`${m.name}${m.is_primary_caregiver ? " · Primary" : ""}`} onPress={() => openEdit(m)}
              subtitle={`${m.relation} · ${m.verified ? until(m.expires_at) : "Waiting for OTP"}\n${m.permissions.map(permLabel).join(", ")}`}
              left={<View style={styles.avatar}><Ionicons name="person" size={18} color={colors.primary} /></View>} />
          ))}
          <Row title="Add family member" onPress={() => router.push("/family-add")} last
            left={<View style={[styles.avatar, { backgroundColor: colors.primary }]}><Ionicons name="add" size={20} color="#fff" /></View>} />
        </Group>

        <Group label="People I care for" footer="When a family member adds your verified mobile number, they appear here.">
          {caring.length === 0 ? <Row title="Nobody yet" last /> : caring.map((c, i) => (
            <Row key={c.id} title={c.patient_name ?? "Family member"} last={i === caring.length - 1}
              subtitle={`You're their ${c.relation.toLowerCase()} · ${c.permissions.map(permLabel).join(", ")}`}
              left={<View style={[styles.avatar, { backgroundColor: "#fce4ec" }]}><Ionicons name="heart" size={18} color="#ad1457" /></View>}
              onPress={() => router.push({ pathname: "/family/[patientId]", params: { patientId: String(c.patient_id) } })} />
          ))}
        </Group>
      </ScrollView>

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Pressable onPress={() => setEditing(null)} hitSlop={10} accessibilityRole="button"><Text style={styles.link}>Cancel</Text></Pressable>
            <Text style={styles.sheetTitle}>{editing?.name}</Text>
            <Pressable onPress={save} disabled={perms.length === 0} hitSlop={10} accessibilityRole="button">
              <Text style={[styles.link, { fontWeight: "700", opacity: perms.length ? 1 : 0.4 }]}>Save</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
            <Group label="What can they do?" footer={perms.length === 0 ? "Choose at least one." : undefined}>
              {PERMISSIONS.map((p, i) => (
                <Row key={p.key} title={p.label} last={i === PERMISSIONS.length - 1}
                  right={<Switch value={perms.includes(p.key)} accessibilityLabel={p.label}
                    onValueChange={(on) => setPerms(on ? [...perms, p.key] : perms.filter((x) => x !== p.key))} />} />
              ))}
            </Group>
            <Group>
              <Row title="Primary caregiver" last right={<Switch value={primary} onValueChange={setPrimary} accessibilityLabel="Primary caregiver" />} />
            </Group>
            <Text style={styles.label}>Access length · now {editing ? until(editing.expires_at).toLowerCase() : ""}</Text>
            <Segmented options={[...DURATIONS]} value={dur} onChange={setDur} />
            {error && <Text style={ui.error}>{error}</Text>}
            <Group>
              {confirmRemove ? (
                <Row title={`Remove ${editing?.name}? Access stops immediately.`} destructive last
                  right={<Pressable onPress={remove} accessibilityRole="button" style={styles.removeBtn}><Text style={{ color: "#fff", fontWeight: "700" }}>Remove</Text></Pressable>} />
              ) : (
                <Row title="Remove from family" destructive onPress={() => setConfirmRemove(true)} right={<View />} last />
              )}
            </Group>
            <Muted>Changes take effect immediately.</Muted>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)" },
  sheet: { maxHeight: "88%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 560, alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#cfd6e2", alignSelf: "center", marginBottom: 8 },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginBottom: 6 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text },
  link: { color: colors.primary, fontSize: 17 },
  label: { fontWeight: "600", color: colors.muted, fontSize: 13, textTransform: "uppercase", marginLeft: 16 },
  removeBtn: { backgroundColor: colors.danger, borderRadius: 10, paddingHorizontal: 14, minHeight: 36, justifyContent: "center" },
});
