import { createContext, useContext, useState, useEffect } from 'react'
import { getLang, setLang as persistLang, TRANSLATIONS, LANGUAGES } from '@/i18n'

const LangContext = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(getLang)

  // Apply direction and lang attr to <html> immediately on mount + on change
  useEffect(() => {
    const l = LANGUAGES.find(x => x.code === lang)
    document.documentElement.dir = l?.dir || 'ltr'
    document.documentElement.lang = lang
    document.body.dir = l?.dir || 'ltr'
  }, [lang])

  const switchLang = (code) => {
    persistLang(code)
    setLangState(code)
  }

  const t = (key) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key
  const langObj = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0]
  const dir = langObj.dir
  const isRTL = dir === 'rtl'

  return (
    <LangContext.Provider value={{ lang, switchLang, t, dir, isRTL, languages: LANGUAGES }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)
