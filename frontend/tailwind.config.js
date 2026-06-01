/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        leaf: {
          50: "#f0fdf4",
          100: "#dcfce7",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d"
        },
        soil: {
          100: "#f5f1e8",
          500: "#9a6a3a"
        }
      },
      boxShadow: {
        panel: "0 14px 40px rgba(15, 23, 42, 0.08)"
      }
    },
  },
  plugins: [],
};

