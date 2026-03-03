import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        gov: {
          // Blue Set 1 – primary actions
          'blue-light':  '#ebf1ff',
          'blue-light-hover': '#e1eaff',
          'blue':        '#3772ff',
          'blue-hover':  '#3267e6',
          'blue-active': '#2c5bcc',
          'blue-dark':   '#2956bf',
          'blue-darker': '#132859',
          // Blue Set 2 – navy / header / sidebar
          'navy-light':  '#eaebee',
          'navy':        '#283353',
          'navy-hover':  '#242e4b',
          'navy-dark':   '#1e263e',
          'navy-darker': '#0e121d',
          // Grey
          'grey-light':  '#e8e8e8',
          'grey-light-hover': '#dddddd',
          'grey':        '#1b1b1b',
          'grey-dark':   '#141414',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 4px 0 rgba(40,51,83,0.08)',
        'modal': '0 8px 40px 0 rgba(19,40,89,0.18)',
      },
    },
  },
  plugins: [],
}

export default config
