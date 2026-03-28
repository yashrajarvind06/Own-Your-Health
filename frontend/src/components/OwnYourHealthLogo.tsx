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
        {/* SVG Icon – shield + person + heart + ECG + digital pixels */}
        <svg
          width={icon}
          height={icon}
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="oyh-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1d3a8a" />
              <stop offset="100%" stopColor="#00d4aa" />
            </linearGradient>
          </defs>

          {/* Shield outline */}
          <path
            d="M50 5 L82 20 L82 52 C82 72 66 87 50 95 C34 87 18 72 18 52 L18 20 Z"
            fill="none"
            stroke="url(#oyh-grad)"
            strokeWidth="5"
            strokeLinejoin="round"
          />

          {/* Cupped hand (palm arc) */}
          <path
            d="M22 68 Q50 80 78 68"
            fill="none"
            stroke="url(#oyh-grad)"
            strokeWidth="5"
            strokeLinecap="round"
          />

          {/* Person circle head */}
          <circle cx="45" cy="32" r="8" fill="url(#oyh-grad)" />

          {/* Person body/torso */}
          <path
            d="M37 45 Q45 58 53 45 Q58 38 50 34"
            fill="url(#oyh-grad)"
          />

          {/* Heart shape */}
          <path
            d="M52 44 C52 40 56 37 60 40 C64 37 68 40 68 44 C68 51 60 57 60 57 C60 57 52 51 52 44 Z"
            fill="url(#oyh-grad)"
          />

          {/* ECG line on heart */}
          <path
            d="M52 48 L55 48 L57 43 L59 53 L61 43 L63 48 L68 48"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          {/* Digital pixel dots (top-right) */}
          <rect x="72" y="12" width="6" height="6" rx="1" fill="#00d4aa" />
          <rect x="80" y="8" width="8" height="8" rx="1" fill="#00d4aa" />
          <rect x="80" y="18" width="5" height="5" rx="1" fill="#1d3a8a" />
          <rect x="72" y="20" width="4" height="4" rx="1" fill="#00aacc" />
        </svg>

        {showText && (
          <span className={`font-extrabold tracking-tight leading-none ${text}`}>
            <span style={{ color: "#1d3a8a" }}>Own</span>
            <span style={{ color: "#00b890" }}>Your</span>
            <span style={{ color: "#1d3a8a" }}>Health</span>
          </span>
        )}
      </div>

      {showTagline && (
        <p
          className={`${tagline} font-semibold tracking-widest uppercase mt-1 flex items-center gap-1`}
          style={{ color: "#00b890" }}
        >
          <span style={{ color: "#1d3a8a" }}>—</span>
          Your Health
          <span style={{ color: "#1d3a8a" }}>•</span>
          Your Control
          <span style={{ color: "#1d3a8a" }}>—</span>
        </p>
      )}
    </div>
  );
}
