/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./script.js", "./src/**/*.{html,js}"],
  theme: {
    extend: {
      colors: {
        primary: {
          light: "#FFF7ED",
          DEFAULT: "#FB923C",
          dark: "#EA580C",
        },
        secondary: "#F8FAFC",
        dark: "#F1F5F9",
      },
    },
  },
  plugins: [],
};
