# פריסה והעלאה ל-GitHub

## העלאה ל-GitHub

צרו repository ריק ב-GitHub. כדי להעלות רק את הקבצים הנוכחיים, בלי היסטוריית Git קודמת, הריצו מתיקיית הפרויקט:

```bash
git switch github-ready
git remote add origin https://github.com/YOUR_USERNAME/inspera-cashcash.git
git push -u origin github-ready:main
```

החליפו את `YOUR_USERNAME` בכתובת החשבון שלכם. הקובץ `.env`, תיקיית `node_modules/` וקובצי מערכת מוחרגים מ-Git. העלו רק את הענף `github-ready`, ולא את כל הענפים.

## דרישות להפעלה

- Node.js 18 ומעלה
- PostgreSQL
- משתני הסביבה שבקובץ `.env.example`

להרצה מקומית:

```bash
cp .env.example .env
npm install
```

ערכו את `.env` והגדירו `DATABASE_URL`, `JWT_SECRET` ו-`ADMIN_PASSWORD`. הריצו את `src/db/schema.sql` במסד הנתונים, ואז:

```bash
npm start
```

בהפעלה הראשונה, אם טבלת `users` ריקה, השרת ייצור משתמש מנהל לפי `ADMIN_USERNAME`, `ADMIN_PASSWORD` ו-`ADMIN_DISPLAY_NAME`. הסיסמה נשמרת כ-hash במסד הנתונים; היא לא נמצאת בקוד או במאגר GitHub. אם כבר קיים משתמש, ההגדרות האלה לא ישנו את הסיסמה שלו.

## פריסה ב-Railway

1. צרו פרויקט Railway והוסיפו שירות PostgreSQL.
2. פתחו את שאילתת ה-PostgreSQL והריצו את `src/db/schema.sql` לפני הפעלת שירות האפליקציה.
3. הוסיפו שירות אפליקציה באמצעות **Deploy from GitHub repo** ובחרו את המאגר.
4. הגדירו בשירות האפליקציה:
   - `DATABASE_URL` — הפניה למשתנה של שירות PostgreSQL.
   - `JWT_SECRET` — ערך אקראי וחזק (לפחות 32 תווים).
   - `ADMIN_USERNAME` — למשל `admin`.
   - `ADMIN_PASSWORD` — סיסמה ראשונית וחזקה.
   - `ADMIN_DISPLAY_NAME` — שם התצוגה, למשל `מנהל ראשי`.
   - `NODE_ENV` — `production`.
5. בצעו deploy. Railway מספק את `PORT` אוטומטית.

השרת לא ידרוס סיסמה של משתמש קיים. כדי להחליף סיסמה במסד קיים, יש לעדכן אותה דרך ניהול המשתמשים או בתהליך תחזוקה מאובטח במסד הנתונים.

## מבנה הפרויקט

```text
public/index.html
src/
  db/           # חיבור למסד וסכמת PostgreSQL
  middleware/   # אימות והרשאות
  routes/       # נתיבי API
  index.js      # נקודת הכניסה לשרת
package.json
railway.toml
```
