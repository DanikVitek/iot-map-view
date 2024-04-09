/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["/index.html", "./src/**/*.{js,jsx,ts,tsx}"],
    important: true,
    theme: {
        extend: {},
    },
    daisyui: {
        themes: ["nord"]
    },
    plugins: [require("daisyui")],
};
