---
# Linux System Administration Complete Workflow
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

מסמך זה מכסה את היסודות של ניהול מערכות <span class="ltr-term">Linux</span> מנקודת מבט של <span class="ltr-term">sysadmin</span>: ניהול משתמשים, מערכת קבצים, הרשאות, תהליכים, שירותים (<span class="ltr-term">services</span>), לוגים, תזמון משימות (<span class="ltr-term">cron</span>) וניהול חבילות.

**מיועד ל:** מנהלי מערכת, <span class="ltr-term">DevOps</span>, וסטודנטים שמתחילים לעבוד מול שרת <span class="ltr-term">Linux</span>.

**דרישות מקדימות:**
- גישת <span class="ltr-term">SSH</span> לשרת <span class="ltr-term">Linux</span> (מבוסס <span class="ltr-term">Debian/Ubuntu</span> בדוגמאות, אך רוב הפקודות זהות ב-<span class="ltr-term">RHEL/CentOS</span> עם שינויי כלי ניהול חבילות).
- הרשאות <span class="ltr-term">root</span> או <span class="ltr-term">sudo</span> למשימות ניהול.

## 2. התקנה והגדרה (Installation & Setup)

אין "התקנה" עבור פקודות אלו — הן חלק מליבת המערכת (<span class="ltr-term">coreutils</span>, <span class="ltr-term">util-linux</span>, <span class="ltr-term">systemd</span>). יש לוודא שהמערכת מעודכנת לפני תחילת עבודה:

```bash
sudo apt update && sudo apt upgrade -y
```
מעדכן את רשימת החבילות הזמינות (<span class="ltr-term">apt update</span>) ולאחר מכן משדרג את כל החבילות המותקנות לגרסה האחרונה (<span class="ltr-term">apt upgrade</span>). מומלץ להריץ בתחילת כל פעולת תחזוקה.

## 3. פקודות חיוניות (Essential Commands)

### ניהול משתמשים (User Management)

```bash
sudo useradd -m -s /bin/bash newuser
```
יוצר משתמש חדש בשם `newuser` עם תיקיית <span class="ltr-term">home</span> (`-m`) ו-<span class="ltr-term">shell</span> ברירת מחדל `bash` (`-s`).

```bash
sudo passwd newuser
```
מגדיר/מאפס סיסמה למשתמש. המערכת תבקש להזין סיסמה חדשה פעמיים.

```bash
sudo usermod -aG sudo newuser
```
מוסיף את `newuser` לקבוצת `sudo` (`-aG` = <span class="ltr-term">append to group</span>) — מאפשר לו להריץ פקודות כ-<span class="ltr-term">root</span> דרך `sudo`. **אזהרה:** שימוש ב-`-G` בלבד (ללא `-a`) **מחליף** את כל הקבוצות הקיימות של המשתמש.

```bash
id newuser
```
מציג את ה-<span class="ltr-term">UID</span>, <span class="ltr-term">GID</span> וכל הקבוצות שהמשתמש שייך אליהן — דרך מהירה לוודא שהוספת קבוצה הצליחה.

### מערכת קבצים (File System)

```bash
ls -la /var/log
```
מציג את כל הקבצים בתיקייה (כולל קבצים נסתרים, `-a`) בפורמט מורחב (`-l`) הכולל הרשאות, בעלים, גודל ותאריך שינוי.

```bash
df -h
```
מציג שימוש בנפח דיסק לכל מערכת קבצים מחוברת, בפורמט קריא לבני אדם (`-h` = <span class="ltr-term">human-readable</span>, למשל `4.2G` במקום מספר בייטים גולמי).

```bash
du -sh /var/log/*
```
מציג את גודל כל קובץ/תיקייה בתוך `/var/log` בנפרד (`-s` = סיכום לכל פריט, `-h` = קריא לבני אדם). שימושי לאיתור קבצי לוג שתופסים מקום.

### הרשאות (Permissions)

```bash
chmod 644 /etc/myapp/config.yml
```
קובע הרשאות `rw-r--r--`: בעלים יכול לקרוא ולכתוב, קבוצה ואחרים יכולים רק לקרוא. נפוץ עבור קבצי קונפיגורציה.

```bash
chown appuser:appgroup /opt/myapp -R
```
משנה את הבעלים והקבוצה של `/opt/myapp` וכל תכולתו (`-R` = <span class="ltr-term">recursive</span>) ל-`appuser:appgroup`. נדרש בדרך כלל אחרי פריסת אפליקציה כ-<span class="ltr-term">root</span>.

### תהליכים (Processes)

```bash
ps aux --sort=-%mem | head -10
```
מציג את 10 התהליכים שצורכים הכי הרבה זיכרון (`--sort=-%mem` = מיון יורד לפי אחוז זיכרון). שימושי לאיתור תהליך שגורם ל-<span class="ltr-term">OOM</span>.

```bash
kill -15 1234
```
שולח אות <span class="ltr-term">SIGTERM</span> (15) לתהליך עם <span class="ltr-term">PID</span> 1234 — בקשה מנומסת לסיום. אם התהליך לא מגיב, ניתן להשתמש ב-`kill -9` (<span class="ltr-term">SIGKILL</span>) שלא ניתן להתעלם ממנו.

```bash
top
```
מציג תצוגה חיה ומתעדכנת של תהליכים, צריכת <span class="ltr-term">CPU</span> וזיכרון. לחיצה על `q` יוצאת, `k` הורגת תהליך לפי <span class="ltr-term">PID</span>.

### שירותים (Services / systemd)

```bash
sudo systemctl status nginx
```
מציג את מצב השירות `nginx`: האם הוא פעיל (`active (running)`), כשל, או מושבת — כולל שורות אחרונות מהלוג.

```bash
sudo systemctl restart nginx
```
מפעיל מחדש את השירות. שימושי אחרי שינוי קובץ קונפיגורציה.

```bash
sudo systemctl enable nginx
```
קובע שהשירות יעלה אוטומטית באתחול הבא של המערכת (יוצר <span class="ltr-term">symlink</span> ב-`/etc/systemd/system`).

### לוגים (Logs)

```bash
sudo journalctl -u nginx -f
```
מציג את הלוג של השירות `nginx` בזמן אמת (`-f` = <span class="ltr-term">follow</span>, כמו `tail -f`). `-u` מסנן לפי שם <span class="ltr-term">unit</span>.

```bash
tail -f /var/log/syslog
```
מציג את שורות הלוג האחרונות של המערכת ומתעדכן בזמן אמת. שימושי כשאין `systemd` או כשהשירות כותב ללוג קובץ ולא ל-<span class="ltr-term">journal</span>.

### תזמון משימות (Cron)

```bash
crontab -e
```
פותח לעריכה את טבלת המשימות המתוזמנות (<span class="ltr-term">cron jobs</span>) של המשתמש הנוכחי. פורמט שורה: `דקה שעה יום חודש יום-בשבוע פקודה`.

```bash
crontab -l
```
מציג את כל המשימות המתוזמנות הקיימות של המשתמש הנוכחי — חשוב להריץ לפני עריכה כדי לא לדרוס בטעות הגדרות קיימות.

### ניהול חבילות (Package Management)

```bash
apt list --installed | grep -i nginx
```
מציג אם חבילה מסוימת (כאן `nginx`) מותקנת, ואיזו גרסה.

```bash
sudo apt remove --purge nginx
```
מסיר חבילה כולל קבצי הקונפיגורציה שלה (`--purge`). ללא `--purge`, קבצי קונפיגורציה נשארים בדיסק.

## 4. פתרון תקלות נפוצות (Common Troubleshooting)

| תקלה | פקודת אבחון | פתרון נפוץ |
|------|-------------|------------|
| השירות לא עולה | `systemctl status <service>` ואז `journalctl -u <service> -n 50` | בדוק שגיאת קונפיגורציה בהודעות האחרונות, תקן ובצע `systemctl restart` |
| הדיסק מתמלא | `df -h` ואז `du -sh /var/log/* /var/* | sort -rh | head` | אתר את התיקייה הגדולה, נקה לוגים ישנים או הגדל <span class="ltr-term">volume</span> |
| תהליך תוקע <span class="ltr-term">CPU</span> | `top` או `ps aux --sort=-%cpu | head` | אתר את ה-<span class="ltr-term">PID</span>, בדוק אם זה צפוי, ואם לא — `kill` בצורה מבוקרת |
| משתמש לא מצליח להתחבר ב-<span class="ltr-term">SSH</span> | `id <user>`, בדיקת `/etc/passwd` ו-`/etc/ssh/sshd_config` | ודא שה-<span class="ltr-term">shell</span> תקין (לא `/usr/sbin/nologin`) ושהמשתמש בקבוצה המורשית |
| `cron` job לא רץ | `crontab -l` ו-`grep CRON /var/log/syslog` | ודא נתיב מלא לפקודה ב-<span class="ltr-term">crontab</span> — ל-`cron` אין את אותו `PATH` כמו ל-<span class="ltr-term">shell</span> אינטראקטיבי |

## 5. תרחישים מהחיים האמיתיים (Real-world Scenarios)

**תרחיש 1 — שרת לא מגיב, מתברר שהדיסק מלא:**
1. `df -h` — מראה `/` ב-100%.
2. `du -sh /var/log/* | sort -rh | head -5` — מאתר ש-`/var/log/journal` תופס 8GB.
3. `sudo journalctl --vacuum-size=200M` — מצמצם את הלוגים השמורים.
4. `df -h` שוב — לוודא שהשטח שוחרר.

**תרחיש 2 — אתר לא נטען אחרי שינוי קונפיגורציה ב-<span class="ltr-term">nginx</span>:**
1. `sudo nginx -t` — בודק תחביר קונפיגורציה לפני <span class="ltr-term">reload</span>.
2. אם יש שגיאה — תקן את הקובץ המצוין בהודעה.
3. `sudo systemctl reload nginx` — טוען קונפיגורציה מחדש ללא הפסקת שירות.
4. `sudo journalctl -u nginx -n 20` — מוודא שאין שגיאות אחרי הטעינה.

**תרחיש 3 — משתמש חדש לצוות צריך גישת <span class="ltr-term">sudo</span> מוגבלת בזמן:**
1. `sudo useradd -m -s /bin/bash contractor`
2. `sudo passwd contractor`
3. `sudo usermod -aG sudo contractor` — להעניק גישה זמנית.
4. בתום הפרויקט: `sudo deluser contractor sudo` להסרת ההרשאה מבלי למחוק את המשתמש.

## 6. אבטחה (Security Considerations)

- **`chmod`/`chown` רחבים מדי** — הימנע מ-`chmod 777` או `chown root` על תיקיות אפליקציה; הגדר את המשתמש/קבוצה המינימליים הנדרשים.
- **`sudo` קבוצתי** — הוספת משתמש לקבוצת `sudo` מעניקה לו שליטה מלאה על המערכת. עבור הרשאות חלקיות, השתמש ב-`/etc/sudoers.d/` עם פקודות ספציפיות בלבד.
- **`kill -9`** — סוגר תהליך באופן מיידי ללא ניקוי משאבים (קבצים פתוחים, חיבורי <span class="ltr-term">DB</span>); השתמש בו רק כמוצא אחרון אחרי `kill -15`.
- **`cron` כ-<span class="ltr-term">root</span>** — משימות `cron` שרצות כ-<span class="ltr-term">root</span> עם סקריפטים הניתנים לכתיבה על ידי משתמשים אחרים הן וקטור הסלמת הרשאות נפוץ.

## 7. אוטומציה (Automation Tips)

```bash
# ניקוי לוגים ישנים אוטומטית — להוספה ל-crontab
0 3 * * * journalctl --vacuum-time=7d
```
מריץ כל יום ב-03:00 ניקוי לוגי `journald` שישנים מ-7 ימים — מונע התמלאות דיסק הדרגתית.

```bash
# בדיקה יומית לתהליכים שצורכים יותר מ-90% CPU ושליחת התראה ללוג
*/15 * * * * ps aux | awk '$3 > 90 {print $0}' >> /var/log/high-cpu-alert.log
```
רץ כל 15 דקות ומתעד תהליכים חריגים — בסיס פשוט להתראות מותאמות אישית.

## 8. משאבים מאושרים (Approved Resources)

| מקור | קישור | תיאור |
|------|-------|-------|
| `man7.org` | [useradd(8)](https://man7.org/linux/man-pages/man8/useradd.8.html) | תיעוד רשמי של פקודת `useradd` |
| `man7.org` | [systemctl(1)](https://man7.org/linux/man-pages/man1/systemctl.1.html) | תיעוד רשמי של `systemctl` |
| `man7.org` | [crontab(5)](https://man7.org/linux/man-pages/man5/crontab.5.html) | פורמט קובץ `crontab` |
| `man7.org` | [chmod(1)](https://man7.org/linux/man-pages/man1/chmod.1.html) | תיעוד הרשאות `chmod` |
| `ubuntu.com` | [Ubuntu Server Guide](https://ubuntu.com/server/docs) | מדריך רשמי לניהול שרת <span class="ltr-term">Ubuntu</span> |
| `kernel.org` | [Linux Kernel Documentation](https://www.kernel.org/doc/html/latest/) | תיעוד ליבת <span class="ltr-term">Linux</span> (לקריאה מתקדמת) |

## 9. שינויים אחרונים (Recent Changes)

| תאריך | שינוי |
|-------|-------|
| 2026-06-10 | יצירה ראשונית של המסמך — 16 פקודות בסיס לניהול מערכת |
| 2026-07-20 | הועבר מהארכיון החיצוני `data-center-archive` (שמעולם לא נדחף ל-<span class="ltr-term">GitHub</span>) לתיקיית <span class="ltr-term">workflows/</span> באפליקציה הראשית — הוסר תלות ברפו חיצוני |
