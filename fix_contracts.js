const db = require('./database');

setTimeout(() => {
  const updates = [
    {
      id: 2,
      tenant_name: 'עו"ד אמיר עזר',
      property: 'תובל 22 רמת גן – משרד',
      start_date: '2025-12-01',
      end_date: '2026-11-30',
      monthly_rent: 5170
    },
    {
      id: 4,
      tenant_name: 'עו"ד אמיר עזר',
      property: 'חניה 19 – תובל 22',
      start_date: '2025-04-01',
      end_date: '2026-04-01',
      monthly_rent: 400
    },
    {
      id: 7,
      tenant_name: 'עדי ומיכל יחסי ציבור וקשרי משקיעים בע"מ',
      property: 'פרופ\' שור 14 תל אביב – קומת קרקע',
      start_date: '2025-11-01',
      end_date: '2026-10-31',
      monthly_rent: 3715
    }
  ];

  let done = 0;
  for (const u of updates) {
    db.run(
      `UPDATE contracts SET tenant_name=?, property=?, start_date=?, end_date=?, monthly_rent=? WHERE id=?`,
      [u.tenant_name, u.property, u.start_date, u.end_date, u.monthly_rent, u.id],
      function(err) {
        if (err) {
          console.error(`❌ שגיאה בעדכון ID ${u.id}:`, err.message);
        } else {
          console.log(`✅ עודכן ID ${u.id}: ${u.tenant_name} | ${u.property} | ₪${u.monthly_rent.toLocaleString()}/חודש`);
        }
        done++;
        if (done === updates.length) {
          console.log('\n📊 מצב נוכחי של כל החוזים:');
          db.all('SELECT id, tenant_name, property, start_date, end_date, monthly_rent FROM contracts ORDER BY id', [], (err, rows) => {
            if (err) return console.error(err);
            for (const r of rows) {
              const rent = r.monthly_rent ? `₪${Number(r.monthly_rent).toLocaleString()}` : '(חסר)';
              const end = r.end_date || '(חסר)';
              console.log(`  [${r.id}] ${r.tenant_name || '(חסר שוכר)'} | ${r.property} | ${rent} | סיום: ${end}`);
            }
            setTimeout(() => process.exit(0), 200);
          });
        }
      }
    );
  }
}, 1000);
