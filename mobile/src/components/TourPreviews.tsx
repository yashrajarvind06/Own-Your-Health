import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

// Example screens for the welcome tour: what each feature looks like in the app, with sample data.
type Icon = keyof typeof Ionicons.glyphMap;

function Panel({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={s.panel}>
      {title && (
        <View style={s.panelHead}>
          <Text style={s.panelTitle}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

const Pill = ({ label, fg, bg, icon }: { label: string; fg: string; bg: string; icon?: Icon }) => (
  <View style={[s.pill, { backgroundColor: bg }]}>
    {icon && <Ionicons name={icon} size={12} color={fg} />}
    <Text style={[s.pillText, { color: fg }]}>{label}</Text>
  </View>
);

const Avatar = ({ text, bg, fg }: { text: string; bg: string; fg: string }) => (
  <View style={[s.avatar, { backgroundColor: bg }]}><Text style={[s.avatarText, { color: fg }]}>{text}</Text></View>
);

const IconTile = ({ name, fg, bg }: { name: Icon; fg: string; bg: string }) => (
  <View style={[s.iconTile, { backgroundColor: bg }]}><Ionicons name={name} size={18} color={fg} /></View>
);

export function ConsentPreview() {
  return (
    <Panel title="Access request" right={<Pill label="QR expires 4:52" icon="time-outline" fg={colors.primary} bg={colors.primarySoft} />}>
      <View style={s.row}>
        <Avatar text="PN" bg={colors.primarySoft} fg={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>Dr. Priya Nair</Text>
          <Text style={s.meta}>Cardiology · City Hospital, Pune</Text>
        </View>
        <Pill label="Trust 92" icon="shield-checkmark" fg={colors.ok} bg="#e6f4ea" />
      </View>
      <View style={s.kv}><Text style={s.meta}>Purpose</Text><Text style={s.value}>Treatment</Text></View>
      <View style={s.kv}><Text style={s.meta}>Access for</Text><Text style={s.value}>24 hours</Text></View>
      <View style={s.chips}>
        <Pill label="Lab reports" icon="checkmark" fg={colors.primary} bg={colors.primarySoft} />
        <Pill label="Prescriptions" icon="checkmark" fg={colors.primary} bg={colors.primarySoft} />
        <Pill label="Imaging" fg={colors.muted} bg="#eef1f6" />
      </View>
      <View style={s.buttons}>
        <View style={[s.btn, s.btnGhost]}><Text style={s.btnGhostText}>Decline</Text></View>
        <View style={[s.btn, { backgroundColor: colors.primary }]}><Text style={s.btnText}>Approve</Text></View>
      </View>
    </Panel>
  );
}

export function EmergencyPreview() {
  return (
    <View style={{ gap: 10, alignSelf: "stretch" }}>
      <View style={s.idCard}>
        <View style={s.idBand}>
          <Text style={s.idBandText}>STUDENT ID</Text>
          <Ionicons name="school" size={14} color="#fff" />
        </View>
        <View style={[s.row, { padding: 12 }]}>
          <View style={s.photo}><Ionicons name="person" size={26} color="#9aa7bb" /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.strong}>Riya Sharma</Text>
            <Text style={s.meta}>B.E. Computer · Roll 21154</Text>
            <Text style={[s.meta, { color: colors.danger, fontWeight: "700" }]}>In an emergency, scan →</Text>
          </View>
          <View style={s.qr}><Ionicons name="qr-code" size={44} color={colors.text} /></View>
        </View>
      </View>
      <Panel title="What a responder sees" right={<Text style={s.meta}>no login</Text>}>
        <View style={s.row}>
          <View style={s.blood}><Text style={s.bloodText}>B+</Text></View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={s.chips}>
              <Pill label="Penicillin" icon="alert-circle" fg={colors.danger} bg="#fdecea" />
              <Pill label="Peanuts" icon="alert-circle" fg={colors.danger} bg="#fdecea" />
            </View>
            <Text style={s.meta}>Asthma · Salbutamol inhaler</Text>
          </View>
        </View>
        <View style={[s.row, s.contact]}>
          <Ionicons name="call" size={16} color={colors.ok} />
          <Text style={[s.value, { flex: 1 }]}>Mother · +91 98220 4XXXX</Text>
          <Text style={[s.meta, { color: colors.ok, fontWeight: "700" }]}>Call</Text>
        </View>
      </Panel>
    </View>
  );
}

export function MisusePreview() {
  const rows: { icon: Icon; fg: string; bg: string; title: string; sub: string; when: string }[] = [
    { icon: "moon", fg: colors.warn, bg: "#fff3d6", title: "Opened at 2:14 AM", sub: "Dr. R. Kulkarni viewed 4 records outside normal hours", when: "2m" },
    { icon: "hand-left", fg: colors.danger, bg: "#fdecea", title: "Blocked: no consent", sub: "An access attempt without your approval was stopped", when: "1h" },
    { icon: "eye", fg: colors.primary, bg: colors.primarySoft, title: "Dr. Priya Nair viewed Lab Report", sub: "Within your approved access · Treatment", when: "10:42" },
  ];
  return (
    <Panel title="Notifications" right={<Pill label="2 new" fg="#fff" bg={colors.danger} />}>
      {rows.map((r, n) => (
        <View key={r.title} style={[s.row, n < rows.length - 1 && s.divider, { alignItems: "flex-start", paddingBottom: 10 }]}>
          <IconTile name={r.icon} fg={r.fg} bg={r.bg} />
          <View style={{ flex: 1 }}>
            <Text style={s.strong}>{r.title}</Text>
            <Text style={s.meta}>{r.sub}</Text>
          </View>
          <Text style={s.meta}>{r.when}</Text>
        </View>
      ))}
    </Panel>
  );
}

export function AiPreview() {
  return (
    <Panel>
      <View style={s.row}>
        <IconTile name="document-text" fg={colors.ok} bg="#e6f4ea" />
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>Lab Report</Text>
          <Text style={s.meta}>City Diagnostics · 2 Nov 2026</Text>
        </View>
        <Pill label="Lab · Verified" fg={colors.primary} bg={colors.primarySoft} />
      </View>
      <View style={s.ai}>
        <Ionicons name="sparkles" size={14} color={colors.ai} />
        <Text style={s.aiText}>Blood pressure and fasting sugar are above normal; pulse is fine.</Text>
      </View>
      <View style={s.chips}>
        <Pill label="BP 150/96" icon="arrow-up" fg={colors.warn} bg="#fff3d6" />
        <Pill label="Glucose 142" icon="arrow-up" fg={colors.warn} bg="#fff3d6" />
        <Pill label="Pulse 88" icon="checkmark" fg={colors.ok} bg="#e6f4ea" />
      </View>
      <View style={s.bubbleMe}><Text style={s.bubbleMeText}>Is my sugar getting worse?</Text></View>
      <View style={s.bubbleAi}><Text style={s.aiText}>It went from 118 in June to 142 now. Worth raising with your doctor.</Text></View>
    </Panel>
  );
}

export function DecayPreview() {
  const rows = [
    { title: "Lab Report", date: "Nov 2026", level: 1, tag: "Current" },
    { title: "Prescription", date: "Aug 2026", level: 0.6, tag: "Fading" },
    { title: "Prescription", date: "Jan 2025", level: 0.12, tag: "Older" },
    { title: "Appendix surgery", date: "2019", level: 1, tag: "Always kept", pinned: true },
  ];
  return (
    <Panel title="Your timeline" right={<Text style={s.meta}>most relevant first</Text>}>
      {rows.map((r) => (
        <View key={r.title + r.date} style={[s.row, { opacity: r.level < 0.3 ? 0.45 : 1 }]}>
          <IconTile name={r.pinned ? "pin" : "document-text"} fg={r.pinned ? "#00838f" : colors.muted} bg={r.pinned ? "#e0f7fa" : "#eef1f6"} />
          <View style={{ flex: 1, gap: 5 }}>
            <View style={s.kv}><Text style={s.strong}>{r.title}</Text><Text style={s.meta}>{r.date}</Text></View>
            <View style={s.track}><View style={[s.bar, { width: `${Math.max(r.level, 0.06) * 100}%`, backgroundColor: r.pinned ? "#00838f" : colors.primary }]} /></View>
          </View>
          <Text style={[s.tag, r.pinned && { color: "#00838f" }]}>{r.tag}</Text>
        </View>
      ))}
    </Panel>
  );
}

export function SharePreview() {
  return (
    <Panel>
      <View style={[s.row, s.divider, { paddingBottom: 10 }]}>
        <IconTile name="link" fg={colors.primary} bg={colors.primarySoft} />
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>Link for Dr. Mehta</Text>
          <Text style={s.meta}>3 records · expires in 23 h</Text>
        </View>
        <View style={[s.btnSmall]}><Text style={[s.pillText, { color: colors.primary }]}>Copy</Text></View>
      </View>
      <View style={[s.row, s.divider, { paddingBottom: 10, alignItems: "flex-start" }]}>
        <Avatar text="SM" bg="#fce4ec" fg="#ad1457" />
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={s.strong}>Sunita Mehta · Mother</Text>
          <View style={s.chips}>
            <Pill label="Emergency info" fg="#ad1457" bg="#fce4ec" />
            <Pill label="View records" fg="#ad1457" bg="#fce4ec" />
          </View>
        </View>
      </View>
      <View style={s.row}>
        <IconTile name="finger-print" fg={colors.ok} bg="#e6f4ea" />
        <View style={{ flex: 1 }}>
          <Text style={s.strong}>Integrity check passed</Text>
          <Text style={s.meta}>SHA-256 fingerprint unchanged since upload</Text>
        </View>
        <Ionicons name="checkmark-circle" size={20} color={colors.ok} />
      </View>
    </Panel>
  );
}

const s = StyleSheet.create({
  panel: {
    alignSelf: "stretch", backgroundColor: "#fff", borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: "rgba(31,42,68,0.08)",
    shadowColor: "#1f2a44", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  panelHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitle: { fontSize: 12, fontWeight: "700", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#dfe4ec" },
  kv: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  strong: { fontSize: 14, fontWeight: "700", color: colors.text },
  meta: { fontSize: 12, color: colors.muted, lineHeight: 16 },
  value: { fontSize: 13, fontWeight: "600", color: colors.text },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: "700" },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "800", fontSize: 13 },
  iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  buttons: { flexDirection: "row", gap: 8, marginTop: 2 },
  btn: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  btnSmall: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  idCard: {
    backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(31,42,68,0.08)",
    shadowColor: "#1f2a44", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  idBand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0b57d0", paddingHorizontal: 12, paddingVertical: 6 },
  idBandText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  photo: { width: 48, height: 56, borderRadius: 8, backgroundColor: "#eef1f6", alignItems: "center", justifyContent: "center" },
  qr: { width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  blood: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#fdecea", alignItems: "center", justifyContent: "center" },
  bloodText: { color: colors.danger, fontSize: 18, fontWeight: "800" },
  contact: { backgroundColor: "#f3f8f4", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  ai: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.aiSoft, borderRadius: 12, padding: 10 },
  aiText: { flex: 1, color: colors.ai, fontSize: 13, lineHeight: 18 },
  bubbleMe: { alignSelf: "flex-end", backgroundColor: colors.primary, borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "80%" },
  bubbleMeText: { color: "#fff", fontSize: 13 },
  bubbleAi: { alignSelf: "flex-start", backgroundColor: colors.aiSoft, borderRadius: 14, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "85%", flexDirection: "row" },
  track: { height: 5, borderRadius: 3, backgroundColor: "#eef1f6", overflow: "hidden" },
  bar: { height: 5, borderRadius: 3 },
  tag: { fontSize: 11, fontWeight: "700", color: colors.muted, width: 70, textAlign: "right" },
});
