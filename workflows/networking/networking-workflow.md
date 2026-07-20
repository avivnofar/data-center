---
# Network Troubleshooting Methodology — Complete Workflow
**Version:** 1.0
**Last Updated:** 2026-06-10
**Maintained by:** Claude (automated) + avivnofar
**Languages:** Hebrew primary, English technical terms
---

## תוכן עניינים (Table of Contents)
1. [סקירה כללית](#1-סקירה-כללית-overview)
2. [התקנה והגדרה](#2-התקנה-והגדרה-installation--setup)
3. [פקודות חיוניות](#3-פקודות-חיוניות-essential-commands)
4. [פתרון תקלות נפוצות](#4-פתרון-תקלות-נפוצות-common-troubleshooting)
5. [תרחישים מהחיים האמיתיים](#5-תרחישים-מהחיים-האמיתיים-real-world-scenarios)
6. [אבטחה](#6-אבטחה-security-considerations)
7. [אוטומציה](#7-אוטומציה-automation-tips)
8. [משאבים מאושרים](#8-משאבים-מאושרים-approved-resources)
9. [שינויים אחרונים](#9-שינויים-אחרונים-recent-changes)

## 1. סקירה כללית (Overview)

מסמך זה מציג מתודולוגיה שיטתית לאבחון תקלות רשת, ללא תלות במערכת הפעלה — תוך שימוש במודל <span class="ltr-term">OSI</span> ככלי חשיבה לבידוד הבעיה לשכבה הנכונה. כולל פקודות מקבילות עבור <span class="ltr-term">Linux</span> ו-<span class="ltr-term">Windows</span>.

**מיועד ל:** כל מי שצריך לאבחן "אין אינטרנט" / "השירות לא נגיש" בצורה מסודרת במקום ניחושים.

### מודל OSI — הפניה מהירה

| שכבה | שם | דוגמה | כלי אבחון |
|------|-----|-------|-----------|
| 1 | <span class="ltr-term">Physical</span> | כבלים, נורות חיבור | בדיקה פיזית, `ip link` / `ipconfig` |
| 2 | <span class="ltr-term">Data Link</span> | <span class="ltr-term">MAC</span>, <span class="ltr-term">switch</span> | `arp -a` |
| 3 | <span class="ltr-term">Network</span> | <span class="ltr-term">IP</span>, ניתוב | `ping`, `tracert`/`traceroute` |
| 4 | <span class="ltr-term">Transport</span> | <span class="ltr-term">TCP/UDP</span>, פורטים | `ss`/`netstat`, `Test-NetConnection` |
| 5-7 | <span class="ltr-term">Session/Presentation/Application</span> | <span class="ltr-term">DNS</span>, <span class="ltr-term">HTTP</span>, <span class="ltr-term">TLS</span> | `curl`, `nslookup`, דפדפן |

## 2. התקנה והגדרה (Installation & Setup)

אין צורך בהתקנה — כל הכלים המוזכרים מובְנים ב-<span class="ltr-term">Linux</span> וב-<span class="ltr-term">Windows</span> (חלקם דורשים `Enable-NetTCPIP` או חבילות בסיס שכבר מותקנות כברירת מחדל).

## 3. פקודות חיוניות (Essential Commands)

### זרימת אבחון מומלצת (שכבה 1 → 7)

1. **שכבה 3 — קישוריות בסיסית:**

   ```bash
   ping 8.8.8.8
   ```
   *(זהה ב-<span class="ltr-term">Linux</span> ו-<span class="ltr-term">Windows</span>)* — בודק האם יש קישוריות <span class="ltr-term">IP</span> בכלל. הצלחה = שכבה 3 תקינה ביציאה לאינטרנט.

2. **שכבה 3 — ניתוב לאורך הדרך:**

   | <span class="ltr-term">Linux</span> | <span class="ltr-term">Windows</span> |
   |---|---|
   | `traceroute 8.8.8.8` | `tracert 8.8.8.8` |

   מציג את כל ה-<span class="ltr-term">hops</span> בדרך ליעד — מאתר היכן בדיוק התעבורה נעצרת.

3. **שכבה 4 — בדיקת פורט ספציפי:**

   | <span class="ltr-term">Linux</span> | <span class="ltr-term">Windows</span> |
   |---|---|
   | `nc -zv host 443` | `Test-NetConnection -ComputerName host -Port 443` |

   בודק האם פורט <span class="ltr-term">TCP</span> ספציפי פתוח ונגיש — מבדיל בין "המארח לא נגיש" ל"השירות הספציפי לא מאזין/חסום".

4. **שכבה 5-7 — בדיקת DNS:**

   | <span class="ltr-term">Linux</span> | <span class="ltr-term">Windows</span> |
   |---|---|
   | `dig example.com` | `nslookup example.com` |

   מוודא שהשם נפתר לכתובת <span class="ltr-term">IP</span> נכונה. אם <span class="ltr-term">ping</span> לכתובת <span class="ltr-term">IP</span> עובד אך לשם הדומיין לא — הבעיה ב-<span class="ltr-term">DNS</span>, לא ברשת.

5. **שכבה 7 — בדיקת אפליקציה:**

   | <span class="ltr-term">Linux</span> | <span class="ltr-term">Windows</span> |
   |---|---|
   | `curl -v https://example.com` | `Invoke-WebRequest https://example.com` |

   בודק את כל שרשרת ה-<span class="ltr-term">HTTP/TLS</span> — הצעד האחרון לפני "זו בעיה באפליקציה עצמה".

### השוואת כלים

| כלי | פלטפורמה | שכבה | שימוש עיקרי |
|-----|----------|------|-------------|
| `ping` / `ping` | חוצה-פלטפורמות | 3 | קישוריות בסיסית |
| `traceroute` / `tracert` | חוצה-פלטפורמות (שמות שונים) | 3 | מסלול ו-<span class="ltr-term">hop</span> בעייתי |
| `ss` / `Get-NetTCPConnection` | <span class="ltr-term">Linux</span> / <span class="ltr-term">Windows</span> | 4 | פורטים פתוחים מקומית |
| `nc` / `Test-NetConnection` | <span class="ltr-term">Linux</span> / <span class="ltr-term">Windows</span> | 4 | בדיקת פורט מרוחק |
| `dig` / `nslookup` | <span class="ltr-term">Linux</span> / <span class="ltr-term">Windows</span> | 7 (DNS) | פתרון שמות |
| `tcpdump` / `Wireshark` | <span class="ltr-term">Linux</span> / חוצה-פלטפורמות | 1-7 | ניתוח חבילות מעמיק |

## 4. פתרון תקלות נפוצות (Common Troubleshooting)

| תסמין | שכבה חשודה | בדיקה ראשונה |
|-------|-------------|---------------|
| "אין אינטרנט בכלל" | 1-3 | `ping 8.8.8.8` — אם נכשל, בדוק חיבור פיזי/ניתוב לפני הכל |
| "אתרים לא עולים אבל <span class="ltr-term">IP</span> ישיר עובד" | 7 (<span class="ltr-term">DNS</span>) | `dig`/`nslookup` מול שרת <span class="ltr-term">DNS</span> חלופי (`8.8.8.8`) |
| "שירות מסוים לא נגיש, שאר הרשת תקינה" | 4 | `nc -zv` / `Test-NetConnection` לפורט הספציפי |
| "חיבור איטי לסירוגין" | 1-3 | `mtr`/`pathping` לאיתור <span class="ltr-term">hop</span> עם <span class="ltr-term">packet loss</span> |
| "<span class="ltr-term">HTTPS</span> נכשל אבל <span class="ltr-term">HTTP</span> עובד" | 6-7 (<span class="ltr-term">TLS</span>) | `curl -v` — בדוק תוקף תעודה ושרשרת אמון |

## 5. תרחישים מהחיים האמיתיים (Real-world Scenarios)

**תרחיש 1 — עובד מדווח "האתר לא עולה":**
1. `ping 8.8.8.8` — עובד → שכבה 1-3 תקינה.
2. `ping example.com` — נכשל → חשד ל-<span class="ltr-term">DNS</span>.
3. `nslookup example.com 8.8.8.8` — אם זה עובד מול <span class="ltr-term">DNS</span> חיצוני אך לא מול ה-<span class="ltr-term">DNS</span> הארגוני → תקלה בשרת ה-<span class="ltr-term">DNS</span> הפנימי.

**תרחיש 2 — שרת חדש בענן, אפליקציה לא נגישה מבחוץ:**
1. מהשרת עצמו: `curl localhost:8080` — עובד → האפליקציה רצה.
2. מבחוץ: `Test-NetConnection <ip> -Port 8080` — נכשל → הבעיה לא באפליקציה.
3. בדוק <span class="ltr-term">Security Group</span>/<span class="ltr-term">Firewall</span> בענן — לרוב חסרה כאן חוקת <span class="ltr-term">inbound</span>.

**תרחיש 3 — חיבור <span class="ltr-term">VPN</span> מתנתק לסירוגין:**
1. `mtr <vpn-gateway-ip>` ממקור החיבור — בדוק <span class="ltr-term">packet loss</span> לאורך הדרך לפני הגעה ל-<span class="ltr-term">VPN gateway</span>.
2. אם ה-<span class="ltr-term">packet loss</span> מתחיל לפני ה-<span class="ltr-term">gateway</span> — הבעיה אצל ספק האינטרנט, לא ב-<span class="ltr-term">VPN</span> עצמו.

## 6. אבטחה (Security Considerations)

- **`tracert`/`traceroute` חושפים טופולוגיה** — הרצה כלפי רשתות צד שלישי עלולה לחשוף מידע על תשתית; הימנע מהרצה מול יעדים שאינם בבעלותך ללא אישור.
- **`Test-NetConnection`/`nc` כסריקה רחבה** — הרצת בדיקות פורט מסיביות נגד טווחי <span class="ltr-term">IP</span> שאינם בבעלותך עלולה להיחשב פעילות סריקה עוינת.

## 7. אוטומציה (Automation Tips)

```bash
# Linux — בדיקת זמינות שירות חיצוני כל דקה
* * * * * nc -zv -w2 example.com 443 || echo "$(date): port 443 down" >> /var/log/port-check.log
```
בודק כל דקה האם פורט 443 ב-`example.com` נגיש (`-w2` = <span class="ltr-term">timeout</span> 2 שניות), ומתעד כשלים בלבד.

## 8. משאבים מאושרים (Approved Resources)

| מקור | קישור | תיאור |
|------|-------|-------|
| `iana.org` | [Service Name and Transport Protocol Port Number Registry](https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml) | רשימת פורטים רשמית |
| `rfc-editor.org` | [RFC 1122 — Requirements for Internet Hosts](https://www.rfc-editor.org/rfc/rfc1122) | תקן יסודות תקשורת <span class="ltr-term">IP</span> |
| `cisco.com` | [Cisco — Troubleshooting TCP/IP](https://www.cisco.com/c/en/us/support/docs/ip/routing-information-protocol-rip/13730-5.html) | מתודולוגיית אבחון רשת מבית <span class="ltr-term">Cisco</span> |

## 9. שינויים אחרונים (Recent Changes)

| תאריך | שינוי |
|-------|-------|
| 2026-06-10 | יצירה ראשונית של המסמך — מתודולוגיה חוצת-פלטפורמות מבוססת OSI |
| 2026-07-20 | הועבר מהארכיון החיצוני `data-center-archive` (שמעולם לא נדחף ל-<span class="ltr-term">GitHub</span>) לתיקיית <span class="ltr-term">workflows/</span> באפליקציה הראשית — הוסר תלות ברפו חיצוני |
