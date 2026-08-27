import { ImageResponse } from "next/og";
import { INTER_800_BASE64 } from "./fonts/inter-latin-800";

export const alt = "Transcriptly — Turn YouTube into a knowledge base";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Static Open Graph / Twitter card generated at build time with satori.
 * Uses the vendored Inter 800 latin subset (next/og bundles no bold font);
 * the page itself keeps the system font stack — only this image uses Inter.
 */
export default async function OpengraphImage() {
  const interBold = Buffer.from(INTER_800_BASE64, "base64");

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
            fontWeight: 800,
            letterSpacing: -1,
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
              fontSize: 74,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -3,
              color: "#202124",
            }}
          >
            Turn YouTube into a knowledge base.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 25,
              lineHeight: 1.5,
              color: "#64748b",
            }}
          >
            Capture a video, playlist, or entire channel as timestamped Markdown
            transcripts.
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
          <span style={{ fontWeight: 800, color: "#202124" }}>
            youtube/AI Notes
          </span>
          <span>Reliable AI Agents.md</span>
          <span>Context Engineering.md</span>
          <span>Workflow Evaluation.md</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div
          style={{
            display: "flex",
            padding: "14px 30px",
            backgroundColor: "#f5c451",
            borderRadius: 14,
            fontSize: 23,
            fontWeight: 800,
            color: "#202124",
          }}
        >
          Add to Chrome
        </div>
        <div style={{ fontSize: 20, color: "#64748b" }}>
          Plain Markdown · No account required · Open source
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Inter",
          data: interBold,
          weight: 800,
          style: "normal",
        },
      ],
    },
  );
}
