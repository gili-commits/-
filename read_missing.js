const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const FOLDER = 'C:\\Users\\gilin\\Desktop\\claude\\תובל 22\\חוזי שכירויות';

const missing = [
  'חוזה אמיר עזר תובל 22.pdf',
  'חוזה חניה 21 תובל 22.pdf',
  'חוזה חניה מספר 19 תובל 22.pdf',
  'ליעד גרושקה תובל 22 חוזה חתום.pdf',
  'הסכם שכירות רחוב שור תל אביב.pdf',
];

(async () => {
  for (const file of missing) {
    const filePath = path.join(FOLDER, file);
    console.log('\n' + '='.repeat(60));
    console.log('📄 ' + file);
    console.log('='.repeat(60));
    try {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      // Print full text
      console.log(data.text);
    } catch(e) {
      console.log('שגיאה: ' + e.message);
    }
  }
})();
