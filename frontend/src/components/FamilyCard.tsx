import React from "react";

interface FamilyLink {
  id: number;
  owner_email?: string | null;
  owner_name?: string | null;
  target_email?: string | null;
  target_name?: string | null;
  relationship: string;
  member_email: string;
  status: string;
  created_at: string;
}

interface FamilyCardProps {
  item: FamilyLink;
  variant: "outgoing" | "incoming";
  actionLabel?: string;
  onAction?: () => void;
}

const FamilyCard: React.FC<FamilyCardProps> = ({ item, variant, actionLabel, onAction }) => {
  const title = variant === "outgoing" ? item.target_name : item.owner_name;
  const subtitle = variant === "outgoing" ? "You can access this profile" : "Managed by this patient account";
  const email = variant === "outgoing" ? (item.target_email || item.member_email) : item.owner_email;

  return (
    <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">{title || "Linked profile"}</h3>
          <p className="text-sm text-gray-500 mt-1">{item.relationship}</p>
          <p className="text-sm text-gray-400 mt-1">{email || item.member_email}</p>
          <p className="text-xs text-gray-500 mt-2">{subtitle}</p>
        </div>

        <span className="bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full font-medium shrink-0 uppercase">
          {item.status}
        </span>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          Linked {new Date(item.created_at).toLocaleDateString()}
        </span>
        {onAction && actionLabel && (
          <button
            onClick={onAction}
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default FamilyCard;
