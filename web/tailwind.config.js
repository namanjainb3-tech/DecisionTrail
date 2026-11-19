/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        obsidian: '#080b11',
        surface: '#0d121d',
        'surface-elevated': '#131927',
        'border-subtle': '#1a2233',
        'border-strong': '#28354f',
        accent: '#0ea5e9',
        terminal: '#10b981',
      },
      },
  plugins: [],
};
