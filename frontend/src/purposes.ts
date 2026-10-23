// Must match ACCESS_PURPOSES in backend/app/enums.py (docx: access explanation requirement)
export const ACCESS_PURPOSES = [
  { code: "TREATMENT", label: "Treatment" },
  { code: "SECOND_OPINION", label: "Second opinion" },
  { code: "EMERGENCY", label: "Emergency" },
  { code: "INSURANCE", label: "Insurance" },
];

// Older requests in the logs still carry the previous codes
export const PURPOSE_LABELS: Record<string, string> = {
  ...Object.fromEntries(ACCESS_PURPOSES.map((p) => [p.code, p.label])),
  FOLLOW_UP: "Follow-up consultation",
  DIAGNOSTIC: "Diagnostic review",
  MEDICATION: "Medication review",
  PROCEDURE: "Procedure preparation",
  EMERGENCY_EVAL: "Emergency evaluation",
  OTHER: "Other reason",
};
