import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-body)"],
        display: ["var(--font-display)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        panel: {
          bg:"#080B14",surface:"#0D1220",card:"#111827",border:"#1E2D45",
          accent:"#2563EB","accent-dim":"#1D4ED8",success:"#10B981",
          warning:"#F59E0B",danger:"#EF4444",muted:"#94A3B8",
          text:"#E2E8F0","text-dim":"#64748B",
        },
      },
      animation: {
        "fade-in":"fadeIn 0.4s ease forwards",
        "slide-up":"slideUp 0.35s ease forwards",
        "pulse-dot":"pulseDot 2s ease infinite",
      },
      keyframes: {
        fadeIn:{from:{opacity:"0"},to:{opacity:"1"}},
        slideUp:{from:{opacity:"0",transform:"translateY(12px)"},to:{opacity:"1",transform:"translateY(0)"}},
        pulseDot:{"0%,100%":{opacity:"1"},"50%":{opacity:"0.4"}},
      },
    },
  },
  plugins:[],
};
export default config;
