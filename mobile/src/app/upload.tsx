import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { shrinkImage } from "@/lib/shrinkImage";
import { colors } from "@/lib/theme";
import DateField from "@/components/DateField";
import { Group, Muted, Row, ui } from "@/components/ui";

type Picked = { uri: string; name: string; mimeType: string; file?: File };
const today = () => new Date().toISOString().slice(0, 10);

/** Add a record (presented as a sheet): document, type, date, optional one-line summary. */
export default function Upload() {
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();
  const { request } = useSession();
  const [types, setTypes] = useState<string[]>([]);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [recordType, setRecordType] = useState<string | null>(null); // null = detect from the document
  const [typeOpen, setTypeOpen] = useState(false);
  const [recordDate, setRecordDate] = useState(today());
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { request<string[]>("/reports/types").then(setTypes).catch(() => {}); }, [request]);

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
    if (!res.canceled) {
      const a = res.assets[0];
      setPicked({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream", file: a.file });
    }
  };

  const scan = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError("Allow camera access in Settings to scan a document.");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled) {
      const a = res.assets[0];
      setPicked({ uri: a.uri, name: a.fileName ?? `scan-${Date.now()}.jpg`, mimeType: a.mimeType ?? "image/jpeg", file: a.file });
    }
  };

  const submit = async () => {
    if (!picked || busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || isNaN(Date.parse(recordDate)) || recordDate > today()) {
      return setError("Use the visit or report date (YYYY-MM-DD), not a future date.");
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      // web gives a real File; native needs the {uri, name, type} descriptor
      // shortcut: native builds send the photo full size; add expo-image-manipulator if a native build ships
      form.append("file", Platform.OS === "web" && picked.file ? await shrinkImage(picked.file) : ({ uri: picked.uri, name: picked.name, type: picked.mimeType } as any));
      form.append("record_date", recordDate);
      if (recordType) form.append("record_type", recordType);
      if (summary.trim()) form.append("summary", summary.trim());
      if (patientId) form.append("patient_id", patientId);
      await request("/reports/upload", { method: "POST", body: form });
      router.back();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={ui.screen} contentContainerStyle={[ui.content, { maxWidth: 640, paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{
        title: "Add Record",
        presentation: "modal",
        headerLeft: () => <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button"><Text style={styles.headerLink}>Cancel</Text></Pressable>,
        headerRight: () => busy ? <ActivityIndicator color={colors.primary} /> : (
          <Pressable onPress={submit} disabled={!picked} hitSlop={10} accessibilityRole="button">
            <Text style={[styles.headerLink, { fontWeight: "700", opacity: picked ? 1 : 0.4 }]}>Add</Text>
          </Pressable>
        ),
      }} />

      {picked ? (
        <Group label="Document">
          <Row title={picked.name} subtitle={picked.mimeType} last left={<Ionicons name="document-attach" size={24} color={colors.primary} />}
            right={<Pressable onPress={() => setPicked(null)} style={styles.change} accessibilityRole="button"><Text style={{ color: colors.primary, fontWeight: "600" }}>Change</Text></Pressable>} />
        </Group>
      ) : (
        <View style={styles.pickers}>
          {Platform.OS !== "web" && (
            <Pressable style={styles.bigBtn} onPress={scan} accessibilityRole="button">
              <Ionicons name="camera" size={30} color={colors.primary} />
              <Text style={styles.bigLabel}>Scan document</Text>
            </Pressable>
          )}
          <Pressable style={styles.bigBtn} onPress={pickFile} accessibilityRole="button">
            <Ionicons name="folder-open" size={30} color={colors.primary} />
            <Text style={styles.bigLabel}>{Platform.OS === "web" ? "Choose file or photo" : "Choose file"}</Text>
          </Pressable>
        </View>
      )}

      <Group label="Details" footer="We read values like BP and sugar from the document automatically.">
        <Row title="Type" onPress={() => setTypeOpen(true)} right={<Text style={styles.value}>{recordType ?? "Detect automatically"} ›</Text>} />
        <Row title="Date" last right={<DateField value={recordDate} onChange={setRecordDate} label="Visit or report date" style={styles.inline} />} />
      </Group>

      <Group label="Short summary (optional)" footer="If you leave this empty, we write a one-line summary from the document.">
        <TextInput style={styles.summary} value={summary} onChangeText={setSummary} multiline maxLength={280}
          placeholder="e.g. Treated for fever and cough" placeholderTextColor="#6e7891" accessibilityLabel="Short summary" />
      </Group>

      {error && <Text style={ui.error}>{error}</Text>}
      {!picked && <Muted>PDF or photo, up to 15 MB.</Muted>}

      <Modal visible={typeOpen} transparent animationType="slide" onRequestClose={() => setTypeOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTypeOpen(false)} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Record type</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
            <Group>
              {[null, ...types].map((t, i, all) => (
                <Row key={t ?? "auto"} title={t ?? "Detect automatically"} last={i === all.length - 1}
                  onPress={() => { setRecordType(t); setTypeOpen(false); }}
                  right={recordType === t ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : <View />} />
              ))}
            </Group>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerLink: { color: colors.primary, fontSize: 17, paddingHorizontal: 8 },
  pickers: { flexDirection: "row", gap: 12 },
  bigBtn: { flex: 1, minHeight: 120, backgroundColor: colors.card, borderRadius: 18, borderWidth: 2, borderStyle: "dashed", borderColor: "#bcd3f5", alignItems: "center", justifyContent: "center", gap: 8 },
  bigLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  change: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  value: { color: colors.muted, fontSize: 17 },
  inline: { fontSize: 17, color: colors.text, textAlign: "right", minWidth: 120 },
  summary: { minHeight: 80, padding: 16, fontSize: 17, color: colors.text, textAlignVertical: "top" },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.35)" },
  sheet: { maxHeight: "75%", backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 16, paddingTop: 8, width: "100%", maxWidth: 560, alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: "#cfd6e2", alignSelf: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, textAlign: "center", marginBottom: 10 },
});
