const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const db = require('./database');

const CONTRACTS_FOLDER = 'C:\\Users\\gilin\\Desktop\\claude\\תובל 22\\חוזי שכירויות';

const hebrewMonths = {
  'ינואר': '01', 'פברואר': '02', 'מרץ': '03', 'מרס': '03',
  'אפריל': '04', 'מאי': '05', 'יוני': '06',
  'יולי': '07', 'אוגוסט': '08', 'ספטמבר': '09',
  'אוקטובר': '10', 'נובמבר': '11', 'דצמבר': '12'
};

function extractDates(text) {
  const dates = [];
  const numericPattern = /(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/g;
  let m;
  while ((m = numericPattern.exec(text)) !== null) {
    const d = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    if (d >= '2000-01-01' && d <= '2035-01-01') dates.push(d);
  }
  const hebrewPattern = new RegExp(`(\\d{1,2})\\s+(${Object.keys(hebrewMonths).join('|')})\\s+(\\d{4})`, 'g');
  while ((m = hebrewPattern.exec(text)) !== null) {
    dates.push(`${m[3]}-${hebrewMonths[m[2]]}-${m[1].padStart(2,'0')}`);
  }
  return [...new Set(dates)].sort();
}

function extractAmounts(text) {
  const amounts = [];
  const pattern = /(?:₪|NIS|ש"ח|שקלים?)\s*([\d,]+)|([\d,]{4,7})\s*(?:₪|ש"ח|שקלים?)/g;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const raw = (m[1] || m[2]).replace(/,/g, '');
    const val = parseInt(raw, 10);
    if (val >= 1000 && val <= 100000) amounts.push(val);
  }
  return [...new Set(amounts)];
}

function extractTenant(text, filename) {
  const patterns = [
    /(?:השוכר|שם השוכר)[:\s]+([^\n,\/]{3,30})/,
    /לבין[:\s]*\n?\s*([^\n,\/]{3,30})/,
    /(?:מר|גב'|גברת)[.\s]+([^\n,]{3,25})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1].trim().length > 2) return m[1].trim();
  }
  return null;
}

async function scanAndImport() {
  console.log('📂 סורק תיקייה:', CONTRACTS_FOLDER);

  const files = fs.readdirSync(CONTRACTS_FOLDER).filter(f => f.toLowerCase().endsWith('.pdf'));
  console.log(`נמצאו ${files.length} קבצי PDF\n`);

  const results = [];

  for (const file of files) {
    const filePath = path.join(CONTRACTS_FOLDER, file);
    console.log(`📄 מנתח: ${file}`);

    let text = '';
    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      text = data.text;
    } catch(e) {
      console.log(`  ⚠️  שגיאה בקריאת PDF: ${e.message}`);
    }

    const dates = extractDates(text);
    const amounts = extractAmounts(text);
    const tenant = extractTenant(text, file);

    const startDate = dates[0] || null;
    const endDate = dates[dates.length - 1] || null;
    const monthlyRent = amounts[0] || null;
    const property = path.basename(file, '.pdf');

    console.log(`  👤 שוכר:    ${tenant || '(לא זוהה)'}`);
    console.log(`  🏠 נכס:     ${property}`);
    console.log(`  📅 תאריכים: ${dates.join(', ') || 'לא נמצאו'}`);
    console.log(`  💰 סכומים:  ${amounts.map(a => '₪'+a.toLocaleString()).join(', ') || 'לא נמצאו'}`);
    console.log('');

    results.push({ tenant, property, startDate, endDate, monthlyRent, filePath, text });
  }

  // Wait for DB to be ready then import
  setTimeout(() => {
    let imported = 0;
    for (const r of results) {
      db.run(
        `INSERT INTO contracts (tenant_name, property, start_date, end_date, monthly_rent, pdf_path, raw_text)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [r.tenant, r.property, r.startDate, r.endDate, r.monthlyRent, r.filePath, r.text.slice(0, 2000)],
        function(err) {
          if (err) console.error('שגיאת DB:', err.message);
          else {
            imported++;
            console.log(`✅ יובא: ${r.property} (ID: ${this.lastID})`);
            if (imported === results.length) {
              console.log(`\n🎉 סה"כ ${imported} חוזים יובאו לבסיס הנתונים!`);
              console.log('פתח http://localhost:3000 לצפייה בדשבורד');
              setTimeout(() => process.exit(0), 500);
            }
          }
        }
      );
    }
  }, 1000);
}

scanAndImport().catch(console.error);
