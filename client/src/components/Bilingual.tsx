import { dict, helperLang, type DictKey, type Lang } from '../lib/i18n'

// Zweisprachiges Label wie im Mockup: .lead = Hauptsprache, .t2 = Hilfssprache
export default function Bilingual({ k, lang, t2 = true }: { k: DictKey; lang: Lang; t2?: boolean }) {
  return (
    <span className="i18n">
      <span className="lead">{dict[k][lang]}</span>
      {t2 && <span className="t2">{dict[k][helperLang(lang)]}</span>}
    </span>
  )
}
