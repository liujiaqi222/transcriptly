import { ImageResponse } from "next/og";
import { FRAUNCES_600_BASE64 } from "./fonts/fraunces-latin-600";
import { INTER_400_BASE64 } from "./fonts/inter-latin-400";
import { INTER_700_BASE64 } from "./fonts/inter-latin-700";
import { JETBRAINS_MONO_500_BASE64 } from "./fonts/jetbrains-mono-latin-500";

export const alt = "Transcriptly — Turn YouTube into a knowledge base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Static Open Graph / Twitter card generated at build time with satori.
 * Matches the site's font system — Inter for body/UI, Fraunces for the
 * display headline, JetBrains Mono for the Markdown file paths. next/og
 * bundles no display fonts, so these faces are vendored as WOFF base64.
 */
export default async function OpengraphImage() {
  const inter400 = Buffer.from(INTER_400_BASE64, "base64");
  const inter700 = Buffer.from(INTER_700_BASE64, "base64");
  const fraunces600 = Buffer.from(FRAUNCES_600_BASE64, "base64");
  const jetBrainsMono500 = Buffer.from(JETBRAINS_MONO_500_BASE64, "base64");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        backgroundColor: "#fffdf8",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width={40} height={40} viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M5 10 Q5 7 7.4 8.8 L14.6 14.2 Q17 16 14.6 17.8 L7.4 23.2 Q5 25 5 22 Z"
            fill="#202124"
          />
          <g stroke="#202124" strokeWidth={2.5} strokeLinecap="round">
            <line x1={20.5} y1={8} x2={26} y2={8} />
            <line x1={19} y1={16} x2={29} y2={16} stroke="#f5c451" />
            <line x1={20.5} y1={24} x2={23} y2={24} />
          </g>
        </svg>
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: -0.5,
            color: "#202124",
          }}
        >
          Transcriptly
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 56, flex: 1 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              fontSize: 62,
              fontWeight: 600,
              lineHeight: 1.04,
              letterSpacing: -2,
              color: "#202124",
              fontFamily: "Fraunces",
            }}
          >
            <span>Turn YouTube into </span>
            <span style={{ color: "#0872b9" }}>a knowledge base.</span>
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 24,
              lineHeight: 1.5,
              color: "#64748b",
              fontWeight: 400,
            }}
          >
            Capture a video, playlist, or entire channel as timestamped Markdown
            — searchable, portable, and yours.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 356,
            padding: 28,
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 20,
            fontSize: 18,
            lineHeight: 1.9,
            color: "#64748b",
          }}
        >
          <span style={{ fontWeight: 700, color: "#202124" }}>
            youtube/AI Notes
          </span>
          <span style={{ fontFamily: "JetBrains Mono", fontWeight: 500 }}>
            Reliable AI Agents.md
          </span>
          <span style={{ fontFamily: "JetBrains Mono", fontWeight: 500 }}>
            Context Engineering.md
          </span>
          <span style={{ fontFamily: "JetBrains Mono", fontWeight: 500 }}>
            Workflow Evaluation.md
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div
          style={{
            display: "flex",
            padding: "14px 30px",
            backgroundColor: "#f5c451",
            borderRadius: 14,
            fontSize: 22,
            fontWeight: 700,
            color: "#202124",
          }}
        >
          Add to Chrome
        </div>
        <div style={{ fontSize: 19, color: "#64748b", fontWeight: 400 }}>
          Plain Markdown · No account required · Open source
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Inter", data: inter400, weight: 400, style: "normal" },
        { name: "Inter", data: inter700, weight: 700, style: "normal" },
        {
          name: "Fraunces",
          data: fraunces600,
          weight: 600,
          style: "normal",
        },
        {
          name: "JetBrains Mono",
          data: jetBrainsMono500,
          weight: 500,
          style: "normal",
        },
      ],
    },
  );
}
