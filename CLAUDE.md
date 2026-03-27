# Rental App — תיעוד פרויקט

מערכת ניהול שכירויות בעברית. מאפשרת מעקב אחר חוזים, תשלומים, אירועים ונכסים.

---

## טכנולוגיות

| שכבה | טכנולוגיה |
|------|-----------|
| Frontend | Vanilla JS + HTML + CSS (SPA, ללא framework) |
| Backend | Node.js + Express |
| Database | PostgreSQL via Supabase (עם adapter שתומך גם ב-SQLite) |
| File uploads | Multer (PDFs) |
| PDF parsing | pdf-parse |
| Hosting | Render (backend + frontend static) |
| Storage | Supabase Storage (לתמונות — בפיתוח) |

---

## קבצים מרכזיים

```
rental-app/
├── server.js         # Express server + כל ה-API routes + PDF parsing
├── database.js       # DB adapter: מתרגם SQLite syntax ל-PostgreSQL, מנהל pool
├── public/
│   └── index.html    # כל ה-frontend: HTML + CSS + JS בקובץ אחד (~1400 שורות)
├── uploads/          # PDFs שהועלו (שמות קבצים בעברית, UTF-8)
├── package.json
├── .env              # DATABASE_URL (Supabase connection string)
└── CLAUDE.md         # קובץ זה
```

> **שים לב:** `public/index.html` נמחק מ-HEAD בעבר ושוחזר. אם הוא חסר — לשחזר עם `git show HEAD~:public/index.html > public/index.html`

---

## משתני סביבה

```env
DATABASE_URL=postgresql://...   # Supabase connection string
PORT=3000                        # ברירת מחדל
```

משתנים עתידיים (לתמונות):
```env
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_KEY=...
```

---

## Database Schema

### contracts
| עמודה | סוג | תיאור |
|-------|-----|--------|
| id | SERIAL PK | |
| tenant_name | TEXT | שם השוכר |
| property | TEXT | שם הנכס (מקשר ל-properties.name) |
| start_date | TEXT | YYYY-MM-DD |
| end_date | TEXT | YYYY-MM-DD |
| monthly_rent | REAL | שכר דירה חודשי |
| currency | TEXT | ברירת מחדל: 'ILS' |
| pdf_path | TEXT | נתיב מקומי לקובץ PDF |
| raw_text | TEXT | טקסט גולמי שחולץ מ-PDF |
| created_at | TIMESTAMPTZ | |

### payments
| עמודה | סוג | תיאור |
|-------|-----|--------|
| id | SERIAL PK | |
| contract_id | INTEGER | FK → contracts.id |
| due_date | TEXT | YYYY-MM-DD |
| amount | REAL | |
| paid | INTEGER | 0/1 |
| paid_date | TEXT | |
| notes | TEXT | |

### events
| עמודה | סוג | תיאור |
|-------|-----|--------|
| id | SERIAL PK | |
| contract_id | INTEGER | FK → contracts.id |
| event_date | TEXT | |
| type | TEXT | maintenance / rent_increase / notice / payment_issue / other |
| description | TEXT | |
| created_at | TIMESTAMPTZ | |

### properties
| עמודה | סוג | תיאור |
|-------|-----|--------|
| id | SERIAL PK | |
| name | TEXT UNIQUE | מקשר ל-contracts.property |
| address | TEXT | |
| type | TEXT | |

> הטבלה קיימת אך כרגע לא בשימוש מלא. מתוכנן להרחיב אותה עם `property_number` ו-`size_sqm`.

---

## API Endpoints

### חוזים
| Method | Path | תיאור |
|--------|------|--------|
| GET | `/api/contracts` | כל החוזים, ממוינים לפי end_date |
| GET | `/api/contracts/:id` | חוזה בודד |
| POST | `/api/contracts` | יצירת חוזה |
| PUT | `/api/contracts/:id` | עדכון חוזה |
| DELETE | `/api/contracts/:id` | מחיקת חוזה |
| GET | `/api/contracts/:id/pdf` | הורדת PDF (stream) |

### Dashboard
| Method | Path | תיאור |
|--------|------|--------|
| GET | `/api/dashboard` | סיכום: active, expired, expiringSoon, monthlyIncome |

### תשלומים
| Method | Path | תיאור |
|--------|------|--------|
| GET | `/api/payments/:contractId` | תשלומים לחוזה |
| POST | `/api/payments` | הוספת תשלום |
| PUT | `/api/payments/:id/pay` | סימון כשולם |
| PUT | `/api/payments/:id/unpay` | ביטול תשלום |
| DELETE | `/api/payments/:id` | מחיקת תשלום |
| POST | `/api/payments/generate/:contractId` | יצירה אוטומטית של תשלומים חודשיים |

### אירועים
| Method | Path | תיאור |
|--------|------|--------|
| GET | `/api/events/:contractId` | אירועים לחוזה |
| POST | `/api/events` | הוספת אירוע |
| PUT | `/api/events/:id` | עדכון אירוע |
| DELETE | `/api/events/:id` | מחיקת אירוע |

### PDF
| Method | Path | תיאור |
|--------|------|--------|
| POST | `/api/upload-pdf` | העלאת PDF + חילוץ נתונים |
| POST | `/api/scan-folder` | סריקת תיקייה מקומית של PDFs |
| POST | `/api/import-contract` | ייבוא חוזה שנסרק ל-DB |

---

## Frontend — מבנה דפים

כל ה-frontend נמצא בקובץ אחד: `public/index.html` (SPA).

| דף | תיאור |
|----|--------|
| Dashboard | כרטיסי סיכום + טבלת כל החוזים |
| Contracts | רשימת חוזים עם חיפוש וסינון |
| Contract Detail | פרטי חוזה + לשוניות: תשלומים / אירועים |
| Payments | ניהול תשלומים עם בחירת חוזה |
| PDF Scan | העלאת PDF בודד / סריקת תיקייה |
| Add/Edit | טופס הוספה/עריכת חוזה |

כל הטקסט בעברית, RTL, Vanilla JS (ללא framework).

---

## database.js — מנגנון ה-Adapter

הקובץ חושף אובייקט `db` עם שלוש פונקציות (`all`, `get`, `run`) שמתממשקות ל-PostgreSQL אך מקבלות SQL עם `?` (סגנון SQLite) — הפונקציה `convertPlaceholders` מתרגמת ל-`$1, $2, ...`.

`INSERT OR IGNORE` מתורגם ל-`INSERT ... ON CONFLICT DO NOTHING RETURNING id`.

---

## פיתוח מקומי

```bash
npm install
# הוסף .env עם DATABASE_URL
npm run dev   # nodemon
# או
npm start
```

האפליקציה עולה על: `http://localhost:3000`

---

## Deploy — Render

- האפליקציה פרוסה ב-Render
- משתנה סביבה `DATABASE_URL` מוגדר ב-Render dashboard
- `npm start` מריץ את `node server.js`
- ה-frontend מוגש כ-static מ-`public/`

---

## תכנון עתידי (בפיתוח)

- **מספר נכס** — שדה `property_number` בטבלת `properties`
- **גודל נכס** — שדה `size_sqm` בטבלת `properties`
- **תמונות נכס** — טבלת `property_images`, אחסון ב-Supabase Storage
  - קטגוריות: תיבת דואר, שעון מים, מונה חשמל, מספר חניה, כללי
  - תמונות שייכות לנכס (לא לחוזה) ועוברות בין חוזים
