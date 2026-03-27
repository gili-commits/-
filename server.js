require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { createClient } = require('@supabase/supabase-js');
const db = require('./database');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Buffer.from(file.originalname, 'latin1').toString('utf8'));
  }
});
const upload = multer({ storage });

// Multer for image uploads (memory storage → Supabase)
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── PDF Parsing helpers ────────────────────────────────────────────────────

function extractHebrewDates(text) {
  const hebrewMonths = {
    'ינואר': '01', 'פברואר': '02', 'מרץ': '03', 'מרס': '03',
    'אפריל': '04', 'מאי': '05', 'יוני': '06',
    'יולי': '07', 'אוגוסט': '08', 'ספטמבר': '09',
    'אוקטובר': '10', 'נובמבר': '11', 'דצמבר': '12'
  };

  const dates = [];

  // Pattern: DD/MM/YYYY or DD.MM.YYYY
  const numericPattern = /(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/g;
  let m;
  while ((m = numericPattern.exec(text)) !== null) {
    dates.push(`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`);
  }

  // Pattern: DD month YYYY (Hebrew month name)
  const hebrewPattern = new RegExp(
    `(\\d{1,2})\\s+(${Object.keys(hebrewMonths).join('|')})\\s+(\\d{4})`, 'g'
  );
  while ((m = hebrewPattern.exec(text)) !== null) {
    const month = hebrewMonths[m[2]];
    dates.push(`${m[3]}-${month}-${m[1].padStart(2,'0')}`);
  }

  return [...new Set(dates)].sort();
}

function extractAmounts(text) {
  const amounts = [];
  // Matches: 5,000 / 5000 / ₪5,000 / 5,000 ₪ / NIS 5,000
  const pattern = /(?:₪|NIS|ש"ח|שקל(?:ים)?)\s*([\d,]+)|(\d{3,}(?:,\d{3})*)/g;
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const raw = (m[1] || m[2]).replace(/,/g, '');
    const val = parseInt(raw, 10);
    if (val >= 500 && val <= 50000) amounts.push(val); // reasonable rent range
  }
  return [...new Set(amounts)];
}

function extractTenantName(text) {
  // Look for common patterns in Hebrew contracts
  const patterns = [
    /השוכר[:\s]+([^\n,]+)/,
    /שם השוכר[:\s]+([^\n,]+)/,
    /לבין[:\s]+([^\n,]{3,40})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extractPropertyFromFilename(filename) {
  // Extract property from filename (Hebrew-friendly)
  const name = path.basename(filename, '.pdf');
  return name;
}

async function parsePdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  let data;
  try {
    data = await pdfParse(buffer);
  } catch (e) {
    return { text: '', dates: [], amounts: [], tenant: null };
  }
  const text = data.text;
  const dates = extractHebrewDates(text);
  const amounts = extractAmounts(text);
  const tenant = extractTenantName(text);
  return { text, dates, amounts, tenant };
}

// ─── Routes ────────────────────────────────────────────────────────────────

// GET all contracts
app.get('/api/contracts', (req, res) => {
  db.all(
    `SELECT c.*, p.property_number, p.size_sqm
     FROM contracts c
     LEFT JOIN properties p ON p.name = c.property
     ORDER BY c.end_date ASC`,
    [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
});

// GET single contract
app.get('/api/contracts/:id', (req, res) => {
  db.get(
    `SELECT c.*, p.property_number, p.size_sqm
     FROM contracts c
     LEFT JOIN properties p ON p.name = c.property
     WHERE c.id = ?`,
    [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    });
});

// GET contract PDF file
app.get('/api/contracts/:id/pdf', (req, res) => {
  db.get('SELECT pdf_path FROM contracts WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || !row.pdf_path) return res.status(404).send('אין קובץ PDF לחוזה זה');
    if (!fs.existsSync(row.pdf_path)) return res.status(404).send('קובץ לא נמצא: ' + row.pdf_path);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    fs.createReadStream(row.pdf_path).pipe(res);
  });
});

function upsertProperty(name, property_number, size_sqm, cb) {
  if (!name) return cb();
  db.run(`INSERT INTO properties (name) VALUES (?)`, [name], () => {
    const sets = [], vals = [];
    if (property_number !== undefined) { sets.push('property_number=?'); vals.push(property_number || null); }
    if (size_sqm !== undefined) { sets.push('size_sqm=?'); vals.push(size_sqm ? parseFloat(size_sqm) : null); }
    if (sets.length === 0) return cb();
    vals.push(name);
    db.run(`UPDATE properties SET ${sets.join(',')} WHERE name=?`, vals, cb);
  });
}

// POST create contract
app.post('/api/contracts', (req, res) => {
  const { tenant_name, property, start_date, end_date, monthly_rent, currency, pdf_path, property_number, size_sqm } = req.body;
  db.run(
    `INSERT INTO contracts (tenant_name, property, start_date, end_date, monthly_rent, currency, pdf_path)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenant_name, property, start_date, end_date, monthly_rent, currency || 'ILS', pdf_path || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      upsertProperty(property, property_number, size_sqm, () => res.json({ id }));
    }
  );
});

// PUT update contract
app.put('/api/contracts/:id', (req, res) => {
  const { tenant_name, property, start_date, end_date, monthly_rent, currency, property_number, size_sqm } = req.body;
  db.run(
    `UPDATE contracts SET tenant_name=?, property=?, start_date=?, end_date=?, monthly_rent=?, currency=?
     WHERE id=?`,
    [tenant_name, property, start_date, end_date, monthly_rent, currency || 'ILS', req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      upsertProperty(property, property_number, size_sqm, () => res.json({ changes: this.changes }));
    }
  );
});

// DELETE contract
app.delete('/api/contracts/:id', (req, res) => {
  db.run('DELETE FROM contracts WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

// POST upload & parse PDF
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const filename = req.file.filename;

  const parsed = await parsePdf(filePath);
  const property = extractPropertyFromFilename(filename);

  // Auto-detect start/end dates (first = start, last = end)
  const startDate = parsed.dates[0] || null;
  const endDate = parsed.dates[parsed.dates.length - 1] || null;
  const monthlyRent = parsed.amounts[0] || null;

  res.json({
    filename,
    property,
    tenant: parsed.tenant,
    dates: parsed.dates,
    amounts: parsed.amounts,
    start_date: startDate,
    end_date: endDate,
    monthly_rent: monthlyRent,
    text_preview: parsed.text.slice(0, 500)
  });
});

// POST scan local folder
app.post('/api/scan-folder', async (req, res) => {
  const { folderPath } = req.body;
  if (!folderPath || !fs.existsSync(folderPath)) {
    return res.status(400).json({ error: 'Folder not found: ' + folderPath });
  }

  const files = fs.readdirSync(folderPath).filter(f => f.toLowerCase().endsWith('.pdf'));
  const results = [];

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const parsed = await parsePdf(filePath);
    const property = extractPropertyFromFilename(file);

    const startDate = parsed.dates[0] || null;
    const endDate = parsed.dates[parsed.dates.length - 1] || null;
    const monthlyRent = parsed.amounts[0] || null;

    results.push({
      filename: file,
      property,
      tenant: parsed.tenant,
      dates: parsed.dates,
      amounts: parsed.amounts,
      start_date: startDate,
      end_date: endDate,
      monthly_rent: monthlyRent
    });
  }

  res.json(results);
});

// POST import scanned contract into DB
app.post('/api/import-contract', (req, res) => {
  const { tenant_name, property, start_date, end_date, monthly_rent, pdf_path, raw_text } = req.body;
  db.run(
    `INSERT OR IGNORE INTO contracts (tenant_name, property, start_date, end_date, monthly_rent, pdf_path, raw_text)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenant_name, property, start_date, end_date, monthly_rent, pdf_path || null, raw_text || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

// GET dashboard summary
app.get('/api/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const in60days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  db.all(`SELECT c.*, p.property_number, p.size_sqm FROM contracts c LEFT JOIN properties p ON p.name = c.property`, [], (err, contracts) => {
    if (err) return res.status(500).json({ error: err.message });

    const active = contracts.filter(c => c.end_date >= today);
    const expired = contracts.filter(c => c.end_date && c.end_date < today);
    const expiringSoon = contracts.filter(c => c.end_date >= today && c.end_date <= in60days);
    const monthlyIncome = active.reduce((sum, c) => sum + (c.monthly_rent || 0), 0);

    res.json({
      total: contracts.length,
      active: active.length,
      expired: expired.length,
      expiringSoon: expiringSoon.length,
      monthlyIncome,
      contracts,
      expiringSoonList: expiringSoon
    });
  });
});

// Payments routes
app.get('/api/payments/:contractId', (req, res) => {
  db.all('SELECT * FROM payments WHERE contract_id = ? ORDER BY due_date', [req.params.contractId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/payments', (req, res) => {
  const { contract_id, due_date, amount, paid, paid_date, notes } = req.body;
  db.run(
    'INSERT INTO payments (contract_id, due_date, amount, paid, paid_date, notes) VALUES (?,?,?,?,?,?)',
    [contract_id, due_date, amount, paid ? 1 : 0, paid_date || null, notes || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/payments/:id/pay', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.run('UPDATE payments SET paid=1, paid_date=? WHERE id=?', [today, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

app.put('/api/payments/:id/unpay', (req, res) => {
  db.run('UPDATE payments SET paid=0, paid_date=NULL WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

app.delete('/api/payments/:id', (req, res) => {
  db.run('DELETE FROM payments WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

// POST generate monthly payments for a contract
app.post('/api/payments/generate/:contractId', (req, res) => {
  db.get('SELECT * FROM contracts WHERE id=?', [req.params.contractId], (err, contract) => {
    if (err || !contract) return res.status(404).json({ error: 'Contract not found' });

    const start = new Date(contract.start_date);
    const end = new Date(contract.end_date);
    const amount = contract.monthly_rent;

    const months = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-01`);
      cur.setMonth(cur.getMonth() + 1);
    }

    if (months.length === 0) return res.json({ inserted: 0 });

    db.all('SELECT due_date FROM payments WHERE contract_id=?', [contract.id], (err2, existing) => {
      if (err2) return res.status(500).json({ error: err2.message });
      const existingDates = new Set(existing.map(r => r.due_date));
      const toInsert = months.filter(m => !existingDates.has(m));
      if (toInsert.length === 0) return res.json({ inserted: 0 });

      let inserted = 0;
      let pending = toInsert.length;
      toInsert.forEach(due_date => {
        db.run(
          'INSERT INTO payments (contract_id, due_date, amount) VALUES (?,?,?)',
          [contract.id, due_date, amount],
          function(e) {
            if (!e) inserted++;
            pending--;
            if (pending === 0) res.json({ inserted });
          }
        );
      });
    });
  });
});

// Events routes
app.get('/api/events/:contractId', (req, res) => {
  db.all('SELECT * FROM events WHERE contract_id=? ORDER BY event_date DESC', [req.params.contractId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/events', (req, res) => {
  const { contract_id, event_date, type, description } = req.body;
  db.run(
    'INSERT INTO events (contract_id, event_date, type, description) VALUES (?,?,?,?)',
    [contract_id, event_date, type, description || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/api/events/:id', (req, res) => {
  const { event_date, type, description } = req.body;
  db.run(
    'UPDATE events SET event_date=?, type=?, description=? WHERE id=?',
    [event_date, type, description || null, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ changes: this.changes });
    }
  );
});

app.delete('/api/events/:id', (req, res) => {
  db.run('DELETE FROM events WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ changes: this.changes });
  });
});

// ─── Property Images ────────────────────────────────────────────────────────

app.get('/api/properties/:name/images', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  db.all('SELECT * FROM property_images WHERE property_name=? ORDER BY category, created_at', [name], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/properties/:name/images', imageUpload.single('image'), async (req, res) => {
  const propertyName = decodeURIComponent(req.params.name);
  const { category } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const storagePath = `${propertyName}/${category}/${Date.now()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('property-images')
    .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

  if (upErr) return res.status(500).json({ error: upErr.message });

  const { data: urlData } = supabase.storage.from('property-images').getPublicUrl(storagePath);

  db.run(`INSERT INTO properties (name) VALUES (?)`, [propertyName], () => {
    db.run(
      'INSERT INTO property_images (property_name, category, image_url) VALUES (?,?,?)',
      [propertyName, category, urlData.publicUrl],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, image_url: urlData.publicUrl });
      }
    );
  });
});

app.delete('/api/images/:id', async (req, res) => {
  db.get('SELECT * FROM property_images WHERE id=?', [req.params.id], async (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Not found' });
    const match = row.image_url.split('/storage/v1/object/public/property-images/')[1];
    if (match) await supabase.storage.from('property-images').remove([decodeURIComponent(match)]);
    db.run('DELETE FROM property_images WHERE id=?', [req.params.id], function(e) {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ ok: true });
    });
  });
});

const server = app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`\n🏢 Rental Management App running at ${url}\n`);
  
});

function shutdown() {
  console.log('\nסוגר שרת...');
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP',  shutdown);
