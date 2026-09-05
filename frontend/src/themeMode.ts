import { createContext } from 'react'

export const ThemeModeContext = createContext({ darkMode: true, toggleDarkMode: () => {} })
