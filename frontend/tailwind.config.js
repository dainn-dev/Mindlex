/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0f1e3d",
          50: "#f4f6fb",
          100: "#e5e9f2",
          200: "#cbd3e3",
          400: "#5c6e8e",
          600: "#1a2d52",
          700: "#162644",
          800: "#0f1e3d",
          900: "#0a142a"
        },
        gold: {
          DEFAULT: "#c9a96e",
          dark: "#a8884f",
          light: "#dfc497"
        },
        cream: "#faf8f3"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        display: ["'Playfair Display'", "Georgia", "serif"]
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 30, 61, 0.05), 0 4px 12px rgba(15, 30, 61, 0.04)",
        lift: "0 10px 40px rgba(15, 30, 61, 0.08)"
      }
    }
  },
  plugins: []
};
