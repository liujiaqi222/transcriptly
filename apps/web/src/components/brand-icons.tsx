/**
 * Brand marks for the install and source-code links. Rendered inline at
 * text size; the GitHub mark inherits the link color via currentColor.
 * Paths from Simple Icons (CC0 1.0) and Google's official Chrome icon;
 * hidden from assistive tech because the surrounding link text already
 * names the destination.
 */

export function ChromeIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      height={size}
      viewBox="0 0 48 48"
      width={size}
    >
      <defs>
        <linearGradient
          id="chrome-red"
          x1="3.2173"
          x2="44.7812"
          y1="15"
          y2="15"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#d93025" />
          <stop offset="1" stopColor="#ea4335" />
        </linearGradient>
        <linearGradient
          id="chrome-yellow"
          x1="20.7219"
          x2="41.5039"
          y1="47.6791"
          y2="11.6837"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#fcc934" />
          <stop offset="1" stopColor="#fbbc04" />
        </linearGradient>
        <linearGradient
          id="chrome-green"
          x1="26.5981"
          x2="5.8161"
          y1="46.5015"
          y2="10.506"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#1e8e3e" />
          <stop offset="1" stopColor="#34a853" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="12" fill="#fff" />
      <path
        d="M24 12H44.7812a23.9939 23.9939 0 0 0-41.5639.0029L13.6079 30l.0093-.0024A11.9852 11.9852 0 0 1 24 12Z"
        fill="url(#chrome-red)"
      />
      <path
        d="M34.3913 30.0029 24.0007 48A23.994 23.994 0 0 0 44.78 12.0031H23.9989l-.0025.0093A11.985 11.985 0 0 1 34.3913 30.0029Z"
        fill="url(#chrome-yellow)"
      />
      <path
        d="M13.6086 30.0031 3.218 12.006A23.994 23.994 0 0 0 24.0025 48L34.3931 30.0029l-.0067-.0068a11.9852 11.9852 0 0 1-20.7778.007Z"
        fill="url(#chrome-green)"
      />
      <circle cx="24" cy="24" r="9.5" fill="#1a73e8" />
    </svg>
  );
}

export function GitHubIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
