type Props = { status: "granted" | "denied" | "expired" | "emergency" | "pending" | "none" | "verified"; remainingSeconds?: number };
export default function QRBadge({ status, remainingSeconds }: Props) {
  const map: Record<string, { text: string; cls: string }> = {
    granted: { text: `Access granted${remainingSeconds ? ` (${remainingSeconds}s)` : ""}`, cls: "bg-green-100 text-green-700" },
    denied: { text: "Access denied", cls: "bg-red-100 text-red-700" },
    expired: { text: "Access expired", cls: "bg-red-100 text-red-700" },
    emergency: { text: "Emergency Access (Override)", cls: "bg-red-600 text-white font-bold" },
    pending: { text: "Waiting for approval", cls: "bg-blue-100 text-blue-700" },
    verified: { text: "QR Verified", cls: "bg-purple-100 text-purple-700" },
    none: { text: "No session", cls: "bg-gray-100 text-gray-700" },
  };
  const v = map[status] || map.none;
  return <span className={`inline-block px-3 py-1 rounded ${v.cls}`}>{v.text}</span>;
}
