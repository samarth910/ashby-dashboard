import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Sarvam brand tokens, ported from docs/brand-tokens.md
      colors: {
        ink: {
          DEFAULT: "#0A0A0B",
          2: "#2A2A2E",
          3: "#6B6B72",
        },
        paper: {
          DEFAULT: "#FFFFFF",
          2: "#FAFAF7",
        },
        night: {
          DEFAULT: "#0E1014",
          2: "#15181E",
        },
        hairline: "#EAEAE4",
        brand: {
          blue: "#2F5BFF",
          "blue-soft": "#7AA0FF",
          "blue-ink": "#1336B5",
          orange: "#FF6A1A",
          "orange-soft": "#FFB37A",
          "orange-ink": "#C9450A",
        },
        stage: {
          applied: "#7AA0FF",
          r1: "#5A7EFF",
          r2: "#4F68F0",
          r3: "#8B4DE8",
          r4: "#B85BD9",
          final: "#E85BBE",
          offer: "#FF6A1A",
          hired: "#16A34A",
          archived: "#6B6B72",
        },
      },
      fontFamily: {
        display: ["Inter Tight", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["3rem", { lineHeight: "1.05", fontWeight: "700" }],
        h1: ["2rem", { lineHeight: "1.1", fontWeight: "700" }],
        h2: ["1.5rem", { lineHeight: "1.2", fontWeight: "600" }],
        h3: ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.5" }],
        small: ["0.75rem", { lineHeight: "1.4", fontWeight: "500" }],
        caption: ["0.6875rem", { lineHeight: "1.3", fontWeight: "500" }],
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "16px",
        xl: "24px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(10,10,11,0.04), 0 8px 24px rgba(10,10,11,0.04)",
        float: "0 12px 40px rgba(47,91,255,0.12)",
      },
      backgroundImage: {
        "sarvam-gradient": "linear-gradient(135deg, #2F5BFF 0%, #8B4DE8 50%, #FF6A1A 100%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
