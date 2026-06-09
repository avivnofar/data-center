# 🖥️ Data Center — מאגר ידע לאנשי IT

מאגר ידע לפתרון תקלות IT — ממשק עברי/אנגלי עם תמיכת RTL מלאה, קלפי פקודות עם tooltips, וחיפוש גלובלי.

**אתר חי:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

---

## מה זה?

כלי reference לאנשי IT, DevOps וסטודנטים. 56 רשומות ב-4 מודולים:

- 🐧 **Linux** — 24 פקודות (רשת, תהליכים, דיסק, הרשאות, מערכת, לוגים, משתמשים)
- ⊞ **CMD / Windows** — 13 פקודות עם שקילויות לינוקס
- 🌐 **רשת** — 10 כלים cross-platform (nmap, dig, netcat, openssl, iperf3...)
- 🔧 **פתרון תקלות** — 9 תרחישים step-by-step (SSH, דיסק מלא, CPU גבוה...)

### תכונות עיקריות

- **עברית ברירת מחדל** עם RTL layout מלא; לחצן החלפת שפה לאנגלית
- **Hover tooltip** על שם הפקודה — מציג flags + תיאורים בשפה הנבחרת
- **לחיצה על שם פקודה** — פותח תיעוד רשמי בטאב חדש
- **חיפוש גלובלי** בכל המודולים בעברית ואנגלית
- **FAQ pills** — קיצורי דרך לשאלות נפוצות
- אין build step, אין framework, אין dependencies

---

## Data Center — IT Knowledge Base

A bilingual Hebrew/English IT troubleshooting reference with full RTL support, command cards with hover tooltips, and global search.

**Live site:** [avivnofar.github.io/data-center](https://avivnofar.github.io/data-center)

### Features

- Hebrew-first UI with language toggle (stored in `localStorage`)
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

---

*Built with vanilla JS, CSS custom properties, and JSON data files.*
