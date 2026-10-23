export const colors = {
  primary: "#1a73e8",
  primarySoft: "#e8f0fe",
  bg: "#f4f8fd",
  card: "#ffffff",
  text: "#1f2a44",
  muted: "#5b6478",
  border: "#dfe6f0",
  danger: "#d93025",
  warn: "#8a5a00", // 5.9:1 on white (the old #b7791f was 3.6:1, below 4.5:1)
  ok: "#188038",
};

// docx trust badges; keys match trust_badge in backend/app/services/records.py
export const trustBadge: Record<string, { label: string; color: string }> = {
  UNVERIFIED: { label: "Self-uploaded · Unverified", color: colors.warn },
  DOCTOR_VERIFIED: { label: "Doctor · Verified", color: colors.ok },
  LAB_VERIFIED: { label: "Lab · Verified", color: colors.primary },
  DOCTOR_REVIEWED: { label: "★ Reviewed by doctor", color: "#7b1fa2" },
};

// Must match ACCESS_PURPOSES in backend/app/enums.py
export const purposeLabel: Record<string, string> = {
  TREATMENT: "Treatment",
  SECOND_OPINION: "Second opinion",
  EMERGENCY: "Emergency",
  INSURANCE: "Insurance",
};

export const PERMISSIONS = [
  { key: "EMERGENCY", label: "Emergency information" },
  { key: "VIEW_RECORDS", label: "View records" },
  { key: "UPLOAD", label: "Upload documents" },
  { key: "APPROVE_ACCESS", label: "Approve doctor access" },
];
