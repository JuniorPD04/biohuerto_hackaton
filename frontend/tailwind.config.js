/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f3f6f1",
        sidebar: "#f7faf5",
        surface: "#ffffff",
        primary: "#1b4d2e",
        accent: {
          50: "#eaf3e7",
          100: "#d6e8d0",
          700: "#1f7a3d",
          800: "#1c5a30",
        },
        terracotta: "#9a4a39",
        text: "#1b271f",
        muted: {
          1: "#46514a",
          2: "#6e786f",
          3: "#9aa39a",
        },
        line: {
          DEFAULT: "#e4eae0",
          2: "#cdd6c9",
        },
        chip: {
          DEFAULT: "#eef2ec",
          2: "#f1f5ef",
          3: "#f6f9f4",
        },
        sb: {
          bg: "#0e3a23",
          accent: "#7ad79a",
          badge: "#e0822f",
          icon: "#2f8754",
        },
      },
      fontFamily: {
        sans: ["'Humnst'", "'Roboto'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,40,30,.04)",
        cardHover: "0 12px 30px rgba(27,77,46,.13)",
        modal: "0 24px 64px rgba(20,40,30,.32)",
        toast: "0 12px 34px rgba(20,40,30,.3)",
      },
      keyframes: {
        toastIn: {
          from: { transform: "translateY(16px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        fade: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        popIn: {
          from: { transform: "scale(.94)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        toastIn: "toastIn .25s cubic-bezier(.22,1,.36,1)",
        fade: "fade .2s ease",
        popIn: "popIn .24s cubic-bezier(.22,1,.36,1)",
      },
    },
  },
  plugins: [],
};
