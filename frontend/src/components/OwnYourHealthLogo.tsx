import { useId } from "react";

interface LogoProps {
  /** Size variant controlling the overall pixel dimensions */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Whether to show the tagline "YOUR HEALTH • YOUR CONTROL" */
  showTagline?: boolean;
  /** Whether to show the text brand name next to the icon */
  showText?: boolean;
  /** Extra className override for the wrapper */
  className?: string;
}

const sizeMap = {
  xs: { icon: 24, text: "text-base", tagline: "text-xs" },
  sm: { icon: 32, text: "text-lg", tagline: "text-xs" },
  md: { icon: 44, text: "text-2xl", tagline: "text-xs" },
  lg: { icon: 64, text: "text-3xl", tagline: "text-sm" },
  xl: { icon: 96, text: "text-5xl", tagline: "text-base" },
};

/** The app mark: a pulse running through the "O" of Own. Same geometry as mobile/assets/logo.svg. */
export function LogoMark({ size = 32, className = "" }: { size?: number; className?: string }) {
  const id = useId(); // gradient ids must be unique when several marks are on one page
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b9bff" /><stop offset="1" stopColor="#0b57d0" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".2" /><stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="23" fill={`url(#${id}t)`} />
      <rect width="100" height="100" rx="23" fill={`url(#${id}s)`} />
      <circle cx="48" cy="50" r="24" fill="none" stroke="#fff" strokeWidth="8.5" />
      <path d="M13 50 H31 M59.5 50 H76" stroke={`url(#${id}t)`} strokeWidth="14" strokeLinecap="round" />
      <polyline points="13,50 31,50 37.5,42 45,61 53,38.5 59.5,50 76,50" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="84" cy="50" r="4.5" fill="#fff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight leading-none text-slate-800 ${className}`}>
      Own<span className="text-blue-600">Your</span>Health
    </span>
  );
}

export default function OwnYourHealthLogo({
  size = "sm",
  showTagline = false,
  showText = true,
  className = "",
}: LogoProps) {
  const { icon, text, tagline } = sizeMap[size];

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex items-center gap-2">
        <LogoMark size={icon} />
        {showText && <Wordmark className={text} />}
      </div>
      {showTagline && (
        <p className={`${tagline} mt-1 font-semibold uppercase tracking-widest text-blue-700`}>
          Your Health • Your Control
        </p>
      )}
    </div>
  );
}
