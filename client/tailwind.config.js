/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        institute: {
          deep: "#063c2b",
          forest: "#0b5a3b",
          leaf: "#16704b",
          gold: "#d6a72c",
          "gold-light": "#f4e6bd",
          paper: "#f7f8f3",
        },
      },
    },
  },
  plugins: [],
};
