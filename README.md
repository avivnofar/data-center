# 🖥️ Data Center — מאגר ידע לאנשי IT

מאגר ידע לפתרון תקלות IT — ממשק עברי/אנגלי עם תמיכת RTL מלאה, קלפי פקודות עם tooltips, חיפוש גלובלי, עוזר AI וסימולטור טרמינל.

**אתר חי:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

---

## מה זה?

כלי reference לאנשי IT, DevOps וסטודנטים. 148 רשומות ב-6 מודולים פעילים:

- 🐧 **Linux** — 42 פקודות (רשת, תהליכים, דיסק, הרשאות, מערכת, לוגים, משתמשים)
- ⊞ **CMD / Windows** — 25 פקודות עם שקילויות לינוקס
- 🌐 **רשת** — 30 כלים cross-platform (nmap, dig, netcat, openssl, iperf3...)
- ☎️ **1COM + MirtaPBX** — 28 רשומות על פלטפורמות PBX בענן
- 🔧 **פתרון תקלות** — 23 תרחישים step-by-step (SSH, דיסק מלא, CPU גבוה...)

### תכונות עיקריות

- **עברית ברירת מחדל** עם RTL layout מלא; לחצן החלפת שפה לאנגלית
- **AI Search** — עוזר מבוסס Claude עם שלושה מצבים: חיפוש חופשי, פתרון תקלה מודרך, ומצב CLI
- **ניתוח צילומי מסך** — הדבקה או צירוף תמונה לצ'אט ה-AI
- **Terminal Academy (CommandFlow)** — סימולטור טרמינל אינטראקטיבי ל-7 פלטפורמות
- **Hover tooltip** על שם הפקודה — מציג flags + תיאורים בשפה הנבחרת
- **חיפוש גלובלי** בכל המודולים בעברית ואנגלית
- אין build step, אין framework, אין dependencies

---

## Data Center — IT Knowledge Base

A bilingual Hebrew/English IT troubleshooting reference with full RTL
support, command cards with hover tooltips, global search, a Claude-powered
AI assistant, and an interactive terminal simulator.

**Live site:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

### Features

- Hebrew-first UI with language toggle (stored in `localStorage`)
- AI Search with three modes — Free Search, Solve a Case, and CLI Mode —
  backed by a Cloudflare Worker proxy (`claude-sonnet-5`), including
  screenshot analysis and live web-search citations
- Terminal Academy (CommandFlow): practice Bash, PowerShell, Cisco, Cloud,
  Networking, Security, and Database commands safely
- Hover tooltips showing quick flags in the selected language
- Click any command name → opens official documentation
- Global search across all modules in both languages
- Zero dependencies, zero build step — just static HTML + JSON

### Running locally

```bash
python -m http.server 8080
# then open http://localhost:8080
```

Or: `npx serve .`

### Adding content

1. Edit the relevant JSON file in `data/`
2. Follow the bilingual schema in `CLAUDE.md`
3. Run `node .github/scripts/validate-json.js` to validate
4. Commit and push

See `CURRENT-SPEC.md` for the audited architecture and feature status.

---

*Built with vanilla JS, CSS custom properties, and JSON data files.*
