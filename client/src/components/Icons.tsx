// SVG-Symbol-Bibliothek aus docs/mockup.html (Zeilen 281–405), 1:1 übernommen:
// 3 illustrierte Charakter-Porträts (#sym-mila/-luka/-ana) + 12 Stroke-Icons (#i-…).
// Wird einmal in App gerendert; Nutzung überall via <svg className="ico"><use href="#i-…"/></svg>.
const SPRITE = `
  <radialGradient id="mSkin" cx="43%" cy="35%" r="80%"><stop offset="0%" stop-color="#FCE3CC"/><stop offset="52%" stop-color="#F6D0B0"/><stop offset="86%" stop-color="#EBB88F"/><stop offset="100%" stop-color="#DDA377"/></radialGradient>
  <linearGradient id="mSkinSh" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0%" stop-color="#E0A97E" stop-opacity="0"/><stop offset="100%" stop-color="#CE9264" stop-opacity=".6"/></linearGradient>
  <linearGradient id="mHair" x1="0.2" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#F4D98F"/><stop offset="40%" stop-color="#E4BB63"/><stop offset="100%" stop-color="#C79640"/></linearGradient>
  <linearGradient id="mHairD" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#CFA24A"/><stop offset="100%" stop-color="#A67C2E"/></linearGradient>
  <linearGradient id="mHairHi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FBEBB8"/><stop offset="100%" stop-color="#FBEBB8" stop-opacity="0"/></linearGradient>
  <linearGradient id="mTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8FBEE0"/><stop offset="100%" stop-color="#6699C6"/></linearGradient>
  <radialGradient id="mIris" cx="50%" cy="42%" r="60%"><stop offset="0%" stop-color="#7FA8B8"/><stop offset="60%" stop-color="#4E7C8E"/><stop offset="100%" stop-color="#365A69"/></radialGradient>
  <radialGradient id="mBlush" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#EE9E8E" stop-opacity=".45"/><stop offset="100%" stop-color="#EE9E8E" stop-opacity="0"/></radialGradient>
  <radialGradient id="lSkin" cx="43%" cy="35%" r="80%"><stop offset="0%" stop-color="#F3D2B0"/><stop offset="52%" stop-color="#EBBE93"/><stop offset="86%" stop-color="#DCA675"/><stop offset="100%" stop-color="#C88F5C"/></radialGradient>
  <linearGradient id="lSkinSh" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0%" stop-color="#CF9764" stop-opacity="0"/><stop offset="100%" stop-color="#B87C48" stop-opacity=".6"/></linearGradient>
  <linearGradient id="lHair" x1="0.2" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#6B4A34"/><stop offset="55%" stop-color="#4E3221"/><stop offset="100%" stop-color="#382317"/></linearGradient>
  <linearGradient id="lHairHi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8A6446"/><stop offset="100%" stop-color="#8A6446" stop-opacity="0"/></linearGradient>
  <linearGradient id="lTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5FA98C"/><stop offset="100%" stop-color="#3E8168"/></linearGradient>
  <radialGradient id="lIris" cx="50%" cy="42%" r="60%"><stop offset="0%" stop-color="#8A6A44"/><stop offset="60%" stop-color="#5E4126"/><stop offset="100%" stop-color="#3E2A15"/></radialGradient>
  <radialGradient id="aSkin" cx="43%" cy="35%" r="80%"><stop offset="0%" stop-color="#F6D9BE"/><stop offset="52%" stop-color="#EEC6A0"/><stop offset="86%" stop-color="#E0AE80"/><stop offset="100%" stop-color="#CC9662"/></radialGradient>
  <linearGradient id="aSkinSh" x1="0" y1="0" x2="1" y2="0.35"><stop offset="0%" stop-color="#D39E6C" stop-opacity="0"/><stop offset="100%" stop-color="#BC8450" stop-opacity=".6"/></linearGradient>
  <linearGradient id="aHair" x1="0.2" y1="0" x2="0.5" y2="1"><stop offset="0%" stop-color="#5A3B2E"/><stop offset="50%" stop-color="#3F281E"/><stop offset="100%" stop-color="#2C1B14"/></linearGradient>
  <linearGradient id="aHairHi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7C5340"/><stop offset="100%" stop-color="#7C5340" stop-opacity="0"/></linearGradient>
  <linearGradient id="aTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#C98BB0"/><stop offset="100%" stop-color="#A96690"/></linearGradient>
  <radialGradient id="aIris" cx="50%" cy="42%" r="60%"><stop offset="0%" stop-color="#7A5638"/><stop offset="60%" stop-color="#4E3320"/><stop offset="100%" stop-color="#332012"/></radialGradient>
  <radialGradient id="aBlush" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#E88F8A" stop-opacity=".4"/><stop offset="100%" stop-color="#E88F8A" stop-opacity="0"/></radialGradient>

  <symbol id="sym-mila" viewBox="0 0 300 360">
    <path d="M36 360 C40 300 84 276 150 276 C216 276 260 300 264 360 Z" fill="url(#mTop)"/>
    <path d="M120 288 q30 20 60 0 l-6 20 q-24 12 -48 0 Z" fill="#7CACD3"/>
    <path d="M128 244 h44 v26 c0 12 -10 20 -22 20 c-12 0 -22 -8 -22 -20 Z" fill="url(#mSkin)"/>
    <path d="M128 250 q22 16 44 0 v6 q-22 14 -44 0 Z" fill="#CE9264" opacity=".55"/>
    <path d="M62 176 C52 104 100 68 150 68 C200 68 248 104 238 176 C246 214 244 250 226 282 C224 258 226 226 218 206 C222 176 214 132 190 116 C170 104 130 104 110 116 C86 132 78 176 82 206 C74 226 76 258 74 282 C56 250 54 214 62 176 Z" fill="url(#mHair)"/>
    <path d="M82 206 C78 176 78 140 96 120 C88 148 88 182 90 210 Z" fill="url(#mHairD)" opacity=".55"/>
    <path d="M218 206 C222 176 222 140 204 120 C212 148 212 182 210 210 Z" fill="url(#mHairD)" opacity=".55"/>
    <ellipse cx="80" cy="186" rx="10" ry="15" fill="url(#mSkin)"/><ellipse cx="220" cy="186" rx="10" ry="15" fill="url(#mSkin)"/>
    <path d="M92 168 C92 120 116 96 150 96 C184 96 208 120 208 168 C208 204 196 232 176 246 C166 253 158 256 150 256 C142 256 134 253 124 246 C104 232 92 204 92 168 Z" fill="url(#mSkin)"/>
    <path d="M182 128 C198 154 198 200 178 232 C190 206 192 164 182 128 Z" fill="url(#mSkinSh)"/>
    <ellipse cx="126" cy="130" rx="22" ry="14" fill="#FFF1E0" opacity=".38"/>
    <ellipse cx="116" cy="196" rx="15" ry="10" fill="url(#mBlush)"/><ellipse cx="184" cy="196" rx="15" ry="10" fill="url(#mBlush)"/>
    <path d="M110 150 q16 -8 32 -2 q-16 -2 -32 5 Z" fill="#C9A054"/><path d="M158 148 q16 -6 32 2 q-16 -5 -32 3 Z" fill="#C9A054"/>
    <path d="M108 162 q16 -12 32 -2 q-2 12 -18 12 q-12 0 -14 -10 Z" fill="#fff"/>
    <path d="M160 160 q16 -10 32 2 q-4 10 -16 10 q-14 0 -16 -12 Z" fill="#fff"/>
    <circle cx="126" cy="164" r="9" fill="url(#mIris)"/><circle cx="176" cy="163" r="9" fill="url(#mIris)"/>
    <circle cx="126" cy="164" r="9" fill="none" stroke="#2E4E5B" stroke-width="1.2"/><circle cx="176" cy="163" r="9" fill="none" stroke="#2E4E5B" stroke-width="1.2"/>
    <circle cx="126" cy="164" r="4" fill="#1C1712"/><circle cx="176" cy="163" r="4" fill="#1C1712"/>
    <circle cx="128.5" cy="161" r="2.2" fill="#fff"/><circle cx="178.5" cy="160" r="2.2" fill="#fff"/>
    <path d="M107 160 q17 -13 34 -3 M159 158 q17 -11 34 3" stroke="#5A4632" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M107 160 l-4 -3 M141 157 l3 -4 M159 158 l-3 -4 M193 161 l4 -3" stroke="#5A4632" stroke-width="2" stroke-linecap="round"/>
    <path d="M112 174 q14 5 26 1 M162 173 q14 5 26 0" stroke="#D8A97C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M150 158 L147 192" stroke="#EFC59A" stroke-width="3" fill="none" stroke-linecap="round" opacity=".6"/>
    <path d="M150 160 q6 20 3 28 q-4 6 -11 5" stroke="#D8A97C" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="150" cy="192" rx="9" ry="6" fill="#EFC59A" opacity=".5"/>
    <path d="M132 210 q9 -5 18 -4 q9 -1 18 4 q-8 3 -18 3 q-10 0 -18 -3 Z" fill="#CE7B6A"/>
    <path d="M132 210 q18 12 36 0 q-8 10 -18 10 q-10 0 -18 -10 Z" fill="#D98878"/>
    <path d="M138 219 q12 5 24 0" stroke="#B96656" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".6"/>
    <path d="M91 172 C86 120 116 94 150 94 C186 94 214 120 209 172 C206 150 198 136 188 128 C186 140 176 146 164 148 C150 150 138 146 128 138 C118 132 104 150 96 168 C93 158 91 166 91 172 Z" fill="url(#mHair)"/>
    <path d="M128 138 C150 150 176 144 188 128 C182 142 168 150 152 150 C142 150 134 145 128 138 Z" fill="url(#mHairD)" opacity=".45"/>
    <path d="M118 120 q36 -14 72 4" stroke="url(#mHairHi)" stroke-width="5" fill="none" stroke-linecap="round" opacity=".8"/>
    <path d="M91 178 c-2 22 4 44 16 60 l8 -6 c-10 -16 -16 -36 -14 -56 Z" fill="url(#mHair)"/>
    <path d="M209 178 c2 22 -4 44 -16 60 l-8 -6 c10 -16 16 -36 14 -56 Z" fill="url(#mHair)"/>
  </symbol>

  <symbol id="sym-luka" viewBox="0 0 300 360">
    <path d="M32 360 C36 298 82 272 150 272 C218 272 264 298 268 360 Z" fill="url(#lTop)"/>
    <path d="M118 284 l32 26 l-14 14 l-24 -30 Z" fill="#356F59"/><path d="M182 284 l-32 26 l14 14 l24 -30 Z" fill="#356F59"/>
    <path d="M126 240 h48 v28 c0 12 -11 20 -24 20 c-13 0 -24 -8 -24 -20 Z" fill="url(#lSkin)"/>
    <path d="M126 246 q24 16 48 0 v6 q-24 14 -48 0 Z" fill="#B87C48" opacity=".55"/>
    <ellipse cx="78" cy="184" rx="10" ry="15" fill="url(#lSkin)"/><ellipse cx="222" cy="184" rx="10" ry="15" fill="url(#lSkin)"/>
    <path d="M88 166 C88 118 114 92 150 92 C186 92 212 118 212 166 C212 206 198 234 178 248 C168 255 158 258 150 258 C142 258 132 255 122 248 C102 234 88 206 88 166 Z" fill="url(#lSkin)"/>
    <path d="M186 126 C202 154 202 202 180 234 C192 206 194 162 186 126 Z" fill="url(#lSkinSh)"/>
    <path d="M85 170 C80 110 116 82 150 82 C184 82 220 110 215 170 C212 150 204 138 194 132 C190 122 178 118 166 120 C158 114 142 114 134 120 C122 118 110 122 106 132 C96 138 88 150 85 170 Z" fill="url(#lHair)"/>
    <path d="M104 140 q22 -20 46 -20 q24 0 46 20" stroke="url(#lHairHi)" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".65"/>
    <path d="M120 106 q30 -8 60 4" stroke="#7A5A3E" stroke-width="2" fill="none" opacity=".5"/>
    <path d="M108 152 q18 -7 34 -1 q-16 -3 -34 6 Z" fill="#3E2A18"/><path d="M158 151 q16 -6 34 1 q-18 -8 -34 5 Z" fill="#3E2A18"/>
    <path d="M110 164 q15 -10 30 -1 q-3 11 -16 11 q-12 0 -14 -10 Z" fill="#fff"/>
    <path d="M160 163 q15 -9 30 1 q-3 10 -15 10 q-13 0 -15 -11 Z" fill="#fff"/>
    <circle cx="127" cy="166" r="8.5" fill="url(#lIris)"/><circle cx="174" cy="165" r="8.5" fill="url(#lIris)"/>
    <circle cx="127" cy="166" r="4" fill="#1A130C"/><circle cx="174" cy="165" r="4" fill="#1A130C"/>
    <circle cx="129.5" cy="163" r="2" fill="#fff"/><circle cx="176.5" cy="162" r="2" fill="#fff"/>
    <path d="M109 162 q16 -11 32 -2 M159 161 q16 -10 32 2" stroke="#3A2A1C" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M150 160 q6 22 3 30 q-4 6 -12 5" stroke="#C88F5C" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="150" cy="192" rx="10" ry="6" fill="#E7BB8C" opacity=".45"/>
    <path d="M132 212 q18 -6 36 0 q-8 4 -18 4 q-10 0 -18 -4 Z" fill="#C47862"/>
    <path d="M132 212 q18 11 36 0 q-8 9 -18 9 q-10 0 -18 -9 Z" fill="#CE8570"/>
    <path d="M120 224 q30 30 60 0 q-6 26 -30 26 q-24 0 -30 -26 Z" fill="#8A6A4E" opacity=".16"/>
  </symbol>

  <symbol id="sym-ana" viewBox="0 0 300 360">
    <path d="M34 360 C38 300 84 274 150 274 C216 274 262 300 266 360 Z" fill="url(#aTop)"/>
    <path d="M122 286 q28 18 56 0 l-6 20 q-22 12 -44 0 Z" fill="#B87BA0"/>
    <path d="M128 244 h44 v26 c0 12 -10 20 -22 20 c-12 0 -22 -8 -22 -20 Z" fill="url(#aSkin)"/>
    <path d="M128 250 q22 16 44 0 v6 q-22 14 -44 0 Z" fill="#BC8450" opacity=".55"/>
    <path d="M58 180 C48 104 100 66 150 66 C200 66 252 104 242 180 C252 224 250 268 230 300 C228 268 230 232 222 210 C226 176 216 130 190 114 C170 102 130 102 110 114 C84 130 74 176 78 210 C70 232 72 268 70 300 C50 268 48 224 58 180 Z" fill="url(#aHair)"/>
    <ellipse cx="80" cy="186" rx="10" ry="15" fill="url(#aSkin)"/><ellipse cx="220" cy="186" rx="10" ry="15" fill="url(#aSkin)"/>
    <path d="M92 168 C92 120 116 96 150 96 C184 96 208 120 208 168 C208 204 196 232 176 246 C166 253 158 256 150 256 C142 256 134 253 124 246 C104 232 92 204 92 168 Z" fill="url(#aSkin)"/>
    <path d="M182 128 C198 154 198 200 178 232 C190 206 192 164 182 128 Z" fill="url(#aSkinSh)"/>
    <ellipse cx="116" cy="196" rx="15" ry="10" fill="url(#aBlush)"/><ellipse cx="184" cy="196" rx="15" ry="10" fill="url(#aBlush)"/>
    <path d="M91 170 C87 116 116 94 150 94 C184 94 213 116 209 170 C206 148 198 132 187 124 C182 138 166 144 150 144 C134 144 118 138 113 124 C102 132 94 148 91 170 Z" fill="url(#aHair)"/>
    <path d="M150 144 C150 144 168 142 187 124 C182 138 168 144 152 144 Z" fill="url(#aHairHi)" opacity=".4"/>
    <path d="M150 144 C150 144 132 142 113 124 C118 138 132 144 148 144 Z" fill="url(#aHairHi)" opacity=".4"/>
    <path d="M116 116 q34 -12 68 2" stroke="url(#aHairHi)" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".55"/>
    <path d="M110 150 q16 -7 32 -1 q-16 -3 -32 6 Z" fill="#3A2418"/><path d="M158 149 q16 -6 32 1 q-16 -4 -32 5 Z" fill="#3A2418"/>
    <path d="M108 162 q16 -11 32 -2 q-2 12 -18 12 q-12 0 -14 -10 Z" fill="#fff"/>
    <path d="M160 160 q16 -10 32 2 q-4 11 -16 11 q-14 0 -16 -13 Z" fill="#fff"/>
    <circle cx="126" cy="164" r="9" fill="url(#aIris)"/><circle cx="176" cy="163" r="9" fill="url(#aIris)"/>
    <circle cx="126" cy="164" r="4" fill="#160F0A"/><circle cx="176" cy="163" r="4" fill="#160F0A"/>
    <circle cx="128.5" cy="161" r="2.2" fill="#fff"/><circle cx="178.5" cy="160" r="2.2" fill="#fff"/>
    <path d="M107 160 q17 -12 34 -3 M159 158 q17 -11 34 3" stroke="#2E1E14" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M107 160 l-4 -3 M141 157 l3 -4 M159 158 l-3 -4 M193 161 l4 -3" stroke="#2E1E14" stroke-width="2" stroke-linecap="round"/>
    <path d="M150 160 q6 20 3 28 q-4 6 -11 5" stroke="#CC9662" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>
    <ellipse cx="150" cy="192" rx="9" ry="6" fill="#EEC6A0" opacity=".5"/>
    <path d="M131 210 q10 -6 19 -4 q9 -2 19 4 q-9 3 -19 3 q-9 0 -19 -3 Z" fill="#C86E68"/>
    <path d="M131 210 q19 13 38 0 q-9 11 -19 11 q-10 0 -19 -11 Z" fill="#D67E76"/>
    <path d="M137 219 q13 5 26 0" stroke="#B15A54" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".6"/>
  </symbol>
  <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3V11.5A8.5 8.5 0 0 1 11.5 3h1A8.5 8.5 0 0 1 21 11.5z"/></symbol>
  <symbol id="i-book" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></symbol>
  <symbol id="i-pencil" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5l4 4L7 21H3v-4z"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></symbol>
  <symbol id="i-mic" viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/></symbol>
  <symbol id="i-speaker" viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></symbol>
  <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5 4.7 1.3 7L12 17.5 5.7 21 7 14 2 9.3l7-.8z"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></symbol>
  <symbol id="i-swap" viewBox="0 0 24 24"><path d="M17 1l4 4-4 4"/><path d="M21 5H9"/><path d="M7 23l-4-4 4-4"/><path d="M3 19h12"/></symbol>
  <symbol id="i-phones" viewBox="0 0 24 24"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></symbol>
  <symbol id="i-doc" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></symbol>
  <symbol id="i-sparkle" viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></symbol>
`

export default function Icons() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs dangerouslySetInnerHTML={{ __html: SPRITE }} />
    </svg>
  )
}

export function Icon({ id, className = 'ico' }: { id: string; className?: string }) {
  return (
    <svg className={className}>
      <use href={`#${id}`} />
    </svg>
  )
}
