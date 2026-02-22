require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const contracts = [
  { tenant_name: 'נוף מנדל', property: 'תובל 22', start_date: '2024-06-30', end_date: '2025-06-30', monthly_rent: 3800, currency: 'ILS' },
  { tenant_name: 'עו"ד אמיר עזר', property: 'תובל 22 רמת גן – משרד', start_date: '2025-12-01', end_date: '2026-11-30', monthly_rent: 5170, currency: 'ILS' },
  { tenant_name: 'אמיר עזר', property: 'חוזה חניה 21 תובל 22', start_date: '2025-10-01', end_date: '2026-10-01', monthly_rent: 400, currency: 'ILS' },
  { tenant_name: 'עו"ד אמיר עזר', property: 'חניה 19 – תובל 22', start_date: '2025-04-01', end_date: '2026-04-01', monthly_rent: 400, currency: 'ILS' },
  { tenant_name: 'תומר אשכנזי', property: 'חוזה קומת ביניים תומר תובל 22', start_date: '2026-02-01', end_date: '2027-02-01', monthly_rent: 1500, currency: 'ILS' },
  { tenant_name: 'ליעד גרושקה', property: 'גרושקה קומה 4 תובל 22', start_date: '2024-04-07', end_date: '2025-04-07', monthly_rent: 2300, currency: 'ILS' },
  { tenant_name: 'עדי ומיכל יחסי ציבור וקשרי משקיעים בע"מ', property: "פרופ' שור 14 תל אביב – קומת קרקע", start_date: '2025-11-01', end_date: '2026-10-31', monthly_rent: 3715, currency: 'ILS' },
  { tenant_name: 'תומר אשכנזי חנות', property: 'הסכם שכירות תומר תובל 22', start_date: '2025-11-01', end_date: '2026-10-31', monthly_rent: 7611, currency: 'ILS' },
  { tenant_name: 'רעות', property: 'הסכם שכירות רחוב אשר ברש תל אביב', start_date: '2026-02-01', end_date: '2027-02-01', monthly_rent: 6300, currency: 'ILS' },
];

async function importData() {
  console.log('מתחבר לSupabase...');
  try {
    for (const c of contracts) {
      await pool.query(
        `INSERT INTO contracts (tenant_name, property, start_date, end_date, monthly_rent, currency)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [c.tenant_name, c.property, c.start_date, c.end_date, c.monthly_rent, c.currency]
      );
      console.log(`✅ יובא: ${c.tenant_name} | ${c.property}`);
    }
    console.log('\n🎉 כל הנתונים יובאו בהצלחה!');
  } catch (err) {
    console.error('שגיאה:', err.message);
  } finally {
    await pool.end();
  }
}

importData();