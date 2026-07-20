---
# Linux Networking Complete Workflow
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

מסמך זה מכסה את כלי הרשת המרכזיים ב-<span class="ltr-term">Linux</span>: הגדרת ממשקי רשת, בדיקות קישוריות, סריקת פורטים, חומת אש, לכידת חבילות (<span class="ltr-term">packet capture</span>), <span class="ltr-term">DNS</span> וניתוב.

**מיועד ל:** מנהלי מערכת ו-<span class="ltr-term">DevOps</span> שצריכים לאבחן בעיות רשת בשרתי <span class="ltr-term">Linux</span>.

**דרישות מקדימות:** גישת `sudo`. חלק מהפקודות (`nmap`, `tcpdump`) דורשות התקנה נפרדת.

## 2. התקנה והגדרה (Installation & Setup)

```bash
sudo apt install -y iproute2 iputils-ping net-tools dnsutils nmap tcpdump
```
מתקין את חבילות הכלים הנפוצות: `iproute2` (`ip`, `ss`), `iputils-ping` (`ping`), `dnsutils` (`dig`, `nslookup`), `nmap` ו-`tcpdump`. ברוב הפצות <span class="ltr-term">Ubuntu</span> חלקן מותקנות כברירת מחדל.

## 3. פקודות חיוניות (Essential Commands)

### הגדרת ממשקי רשת (Interface Configuration)

```bash
ip addr show
```
מציג את כל ממשקי הרשת, כתובות <span class="ltr-term">IP</span> (<span class="ltr-term">IPv4</span>/<span class="ltr-term">IPv6</span>) ומצבם (`UP`/`DOWN`). התחליף המודרני ל-`ifconfig`.

```bash
sudo ip link set eth0 up
```
מפעיל ממשק רשת בשם `eth0` (`up`). שימושי כשממשק נופל למצב `DOWN` בעקבות שינוי קונפיגורציה.

```bash
sudo ip addr add 192.168.1.50/24 dev eth0
```
מוסיף כתובת <span class="ltr-term">IP</span> זמנית לממשק `eth0`. השינוי **לא נשמר** אחרי <span class="ltr-term">reboot</span> — לקביעות יש לערוך את קובץ ה-<span class="ltr-term">netplan</span> (`/etc/netplan/*.yaml`).

### בדיקות קישוריות (Connectivity Testing)

```bash
ping -c 4 8.8.8.8
```
שולח 4 בקשות <span class="ltr-term">ICMP echo</span> (`-c 4`) לכתובת `8.8.8.8` ומודד זמני תגובה. אובדן <span class="ltr-term">packet loss</span> או <span class="ltr-term">timeout</span> מצביעים על בעיית קישוריות.

```bash
mtr 8.8.8.8
```
משלב `ping` ו-`traceroute` — מציג בזמן אמת את כל ה-<span class="ltr-term">hops</span> בדרך ליעד וכמה <span class="ltr-term">packet loss</span> יש בכל <span class="ltr-term">hop</span>. שימושי לאיתור הקפיצה הבעייתית ברשת.

```bash
curl -v https://example.com
```
בודק חיבור <span class="ltr-term">HTTP/HTTPS</span> מלא כולל <span class="ltr-term">DNS</span>, <span class="ltr-term">TCP handshake</span> ו-<span class="ltr-term">TLS handshake</span> (`-v` = <span class="ltr-term">verbose</span>) — מאבחן בעיות שלא נראות ב-`ping` בלבד (למשל חסימת פורט 443).

### סריקת פורטים (Port Scanning)

```bash
ss -tulnp
```
מציג את כל ה-<span class="ltr-term">sockets</span> שמאזינים (`-l`) עבור <span class="ltr-term">TCP</span> (`-t`) ו-<span class="ltr-term">UDP</span> (`-u`), עם מספרי פורט (`-n`) ושם התהליך/<span class="ltr-term">PID</span> (`-p`). התחליף המודרני ל-`netstat -tulnp`.

```bash
sudo nmap -sT -p 1-1000 192.168.1.10
```
סורק את הפורטים 1 עד 1000 ב-<span class="ltr-term">TCP connect scan</span> (`-sT`) על המארח `192.168.1.10`. שימושי לבדוק אילו שירותים חשופים מנקודת מבט חיצונית.

### חומת אש (Firewall)

```bash
sudo ufw status verbose
```
מציג את חוקי `ufw` (<span class="ltr-term">Uncomplicated Firewall</span>) הפעילים, כולל מדיניות ברירת מחדל לכניסה ויציאה.

```bash
sudo ufw allow 22/tcp
```
פותח פורט 22 (<span class="ltr-term">SSH</span>) עבור <span class="ltr-term">TCP</span>. **חשוב:** ודא שפורט ה-<span class="ltr-term">SSH</span> פתוח **לפני** הפעלת `ufw enable`, אחרת תינעל מחוץ לשרת.

```bash
sudo iptables -L -n -v
```
מציג את חוקי `iptables` הגולמיים (`-L`) ללא <span class="ltr-term">DNS resolution</span> (`-n`), עם מונים (`-v`). שימושי כש-`ufw` לא בשימוש או לאבחון מתקדם.

### לכידת חבילות (Packet Capture)

```bash
sudo tcpdump -i eth0 port 443 -c 20
```
לוכד 20 חבילות (`-c 20`) על ממשק `eth0` המסוננות לפורט 443 (<span class="ltr-term">HTTPS</span>). שימושי לאמת שתעבורה אכן מגיעה/יוצאת מהשרת.

### DNS

```bash
dig example.com +short
```
מבצע שאילתת <span class="ltr-term">DNS</span> ומחזיר רק את כתובת ה-<span class="ltr-term">IP</span> (`+short`). דרך מהירה לבדוק <span class="ltr-term">resolution</span>.

```bash
dig @8.8.8.8 example.com
```
שולח את שאילתת ה-<span class="ltr-term">DNS</span> ישירות ל-<span class="ltr-term">resolver</span> ספציפי (`8.8.8.8`) — מאפשר להבדיל בין בעיית <span class="ltr-term">resolver</span> מקומי לבעיית <span class="ltr-term">DNS</span> כללית.

### ניתוב (Routing)

```bash
ip route show
```
מציג את טבלת הניתוב הנוכחית, כולל ה-<span class="ltr-term">default gateway</span>. אם חסרה שורת `default` — אין לשרת יציאה לאינטרנט.

```bash
sudo ip route add 10.0.0.0/24 via 192.168.1.1
```
מוסיף נתיב סטטי לרשת `10.0.0.0/24` דרך <span class="ltr-term">gateway</span> `192.168.1.1`. זמני — לקביעות יש לערוך <span class="ltr-term">netplan</span>.

## 4. פתרון תקלות נפוצות (Common Troubleshooting)

| תקלה | פקודת אבחון | פתרון נפוץ |
|------|-------------|------------|
| אין גישה לאינטרנט | `ip route show` | ודא שקיימת שורת `default via ...`; אם חסרה — הוסף <span class="ltr-term">gateway</span> |
| שירות לא נגיש מבחוץ | `ss -tulnp \| grep <port>` | ודא שהשירות מאזין על `0.0.0.0` ולא רק `127.0.0.1`, ושהפורט פתוח ב-`ufw` |
| <span class="ltr-term">DNS</span> לא נפתר | `dig example.com` מול `dig @8.8.8.8 example.com` | אם רק ה-<span class="ltr-term">resolver</span> המקומי נכשל — בדוק `/etc/resolv.conf` |
| חיבור איטי/<span class="ltr-term">timeout</span> | `mtr <host>` | אתר את ה-<span class="ltr-term">hop</span> עם <span class="ltr-term">packet loss</span> גבוה |
| תעבורה חסומה לכאורה | `tcpdump -i any port <port>` | אם אין חבילות נכנסות — הבעיה לפני השרת (<span class="ltr-term">firewall</span>/<span class="ltr-term">router</span>); אם יש — הבעיה באפליקציה |

## 5. תרחישים מהחיים האמיתיים (Real-world Scenarios)

**תרחיש 1 — אפליקציה רצה אבל לא נגישה מהדפדפן:**
1. `ss -tulnp | grep 8080` — מוודא שהשירות מאזין.
2. אם כתובת ה-<span class="ltr-term">listen</span> היא `127.0.0.1:8080` ולא `0.0.0.0:8080` — זו הבעיה: השירות מקשיב רק מקומית.
3. שנה את הקונפיגורציה של האפליקציה להאזין על `0.0.0.0`.
4. `sudo ufw allow 8080/tcp` — ודא שהפורט גם פתוח בחומת האש.

**תרחיש 2 — שרת חדש לא מקבל כתובת רשת:**
1. `ip addr show` — הממשק במצב `DOWN` או ללא כתובת.
2. `sudo ip link set eth0 up`
3. אם עדיין אין כתובת — בדוק קובץ `netplan` (`/etc/netplan/*.yaml`) עבור שגיאת תחביר, ואז `sudo netplan apply`.

**תרחיש 3 — חשד לתעבורה לא צפויה לכתובת חיצונית:**
1. `sudo ss -tulnp` — בדוק תהליכים שמאזינים על פורטים לא מוכרים.
2. `sudo tcpdump -i eth0 -c 50` — לכוד דגימת תעבורה.
3. `sudo nmap -sT -p- localhost` — סרוק את כל הפורטים המקומיים מול הציפיות.

## 6. אבטחה (Security Considerations)

- **`nmap` נגד מארחים שאינם בבעלותך** — סריקת פורטים ברשתות שאינן שלך עלולה להיחשב פעילות עוינת. השתמש רק על מערכות שבבעלותך או באישור מפורש.
- **פתיחת `ufw enable` ללא חוק `SSH`** — תנעל אותך מחוץ לשרת מרוחק. תמיד `ufw allow 22/tcp` (או הפורט המותאם) לפני ההפעלה.
- **`tcpdump` חושף תוכן תעבורה** — חבילות לא מוצפנות (<span class="ltr-term">HTTP</span>, <span class="ltr-term">DNS</span>) עלולות לחשוף מידע רגיש; הרץ עם הרשאות מתאימות בלבד ושמור קבצי לכידה במקום מאובטח.

## 7. אוטומציה (Automation Tips)

```bash
# בדיקת קישוריות תקופתית ורישום ל-log
*/5 * * * * ping -c 1 8.8.8.8 >/dev/null || echo "$(date): no internet" >> /var/log/connectivity.log
```
רץ כל 5 דקות; אם <span class="ltr-term">ping</span> נכשל — מתעד שורה עם חותמת זמן. בסיס פשוט לזיהוי הפסקות קישוריות.

## 8. משאבים מאושרים (Approved Resources)

| מקור | קישור | תיאור |
|------|-------|-------|
| `man7.org` | [ip(8)](https://man7.org/linux/man-pages/man8/ip.8.html) | תיעוד רשמי לפקודת `ip` |
| `man7.org` | [ss(8)](https://man7.org/linux/man-pages/man8/ss.8.html) | תיעוד רשמי לפקודת `ss` |
| `man7.org` | [tcpdump(8)](https://man7.org/linux/man-pages/man8/tcpdump.8.html) | תיעוד רשמי ל-`tcpdump` |
| `linux.die.net` | [dig(1)](https://linux.die.net/man/1/dig) | תיעוד פקודת `dig` |
| `nmap.org` | [Nmap Reference Guide](https://nmap.org/book/man.html) | מדריך רשמי ל-`nmap` |

## 9. שינויים אחרונים (Recent Changes)

| תאריך | שינוי |
|-------|-------|
| 2026-06-10 | יצירה ראשונית של המסמך — 13 פקודות רשת |
| 2026-07-20 | הועבר מהארכיון החיצוני `data-center-archive` (שמעולם לא נדחף ל-<span class="ltr-term">GitHub</span>) לתיקיית <span class="ltr-term">workflows/</span> באפליקציה הראשית — הוסר תלות ברפו חיצוני |
