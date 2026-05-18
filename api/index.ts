import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Polyfills required by pdfjs-dist / kordoc
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    is2D = true; isIdentity = true;
    static fromMatrix() { return new (globalThis as any).DOMMatrix(); }
    multiply() { return new (globalThis as any).DOMMatrix(); }
    translate() { return new (globalThis as any).DOMMatrix(); }
    scale() { return new (globalThis as any).DOMMatrix(); }
    rotate() { return new (globalThis as any).DOMMatrix(); }
    inverse() { return new (globalThis as any).DOMMatrix(); }
    transformPoint(p: any) { return p || { x: 0, y: 0 }; }
  };
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {
    width: number; height: number; data: Uint8ClampedArray;
    constructor(w: number, h: number) {
      this.width = w; this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {};
}

// NOTE: In-memory storage — resets on Vercel cold start.
// For persistence, replace with a database (e.g. Vercel KV, PlanetScale).
const formStore = new Map<string, { form: any; createdAt: string }>();
const responseStore = new Map<string, any[]>();

function generateFormId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const app = express();
app.use(express.json());

// Use /tmp for uploads — Vercel filesystem is read-only except /tmp
const uploadDir = '/tmp/uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Save a form
app.post('/api/forms', (req, res) => {
  try {
    const form = req.body;
    if (!form || !form.title) {
      return res.status(400).json({ error: 'Invalid form data' });
    }
    const id = generateFormId();
    formStore.set(id, { form, createdAt: new Date().toISOString() });
    responseStore.set(id, []);
    res.json({ id, url: `/survey/${id}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a form by ID
app.get('/api/forms/:id', (req, res) => {
  const data = formStore.get(req.params.id);
  if (!data) return res.status(404).json({ error: 'Form not found' });
  res.json(data.form);
});

// Submit a response
app.post('/api/forms/:id/responses', (req, res) => {
  const data = formStore.get(req.params.id);
  if (!data) return res.status(404).json({ error: 'Form not found' });
  const responses = responseStore.get(req.params.id) || [];
  responses.push({ ...req.body, submittedAt: new Date().toISOString() });
  responseStore.set(req.params.id, responses);
  res.json({ success: true });
});

// Get responses
app.get('/api/forms/:id/responses', (req, res) => {
  const data = formStore.get(req.params.id);
  if (!data) return res.status(404).json({ error: 'Form not found' });
  res.json(responseStore.get(req.params.id) || []);
});

// Extract text from uploaded file
app.post('/api/extract-text', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const filePath = req.file.path;
    const originalName = req.file.originalname;
    console.log(`Extracting text from: ${originalName}`);
    let extractedText = '';

    try {
      const { parse } = await import('@clazic/kordoc');
      const parseResult = await parse(filePath, { format: 'markdown', silent: true });

      if (parseResult && (parseResult as any).success && (parseResult as any).blocks) {
        let currentPage = 1;

        function extractTextFromBlock(block: any): string {
          let result = '';
          if (block.pageNumber && block.pageNumber !== currentPage) {
            result += `\n\n--- [PAGE ${block.pageNumber}] ---\n\n`;
            currentPage = block.pageNumber;
          }
          if (block.text) result += block.text + '\n';
          if (block.type === 'table' && block.table?.cells) {
            result += '\n';
            for (const row of block.table.cells) {
              result += (row || []).map((cell: any) => cell?.text ?? '').join(' | ') + '\n';
            }
            result += '\n';
          }
          if (block.children?.length) {
            for (const child of block.children) result += extractTextFromBlock(child);
          }
          return result;
        }

        extractedText = (parseResult as any).blocks.map(extractTextFromBlock).join('').trim();
        if (extractedText.length < 50 && (parseResult as any).markdown) {
          extractedText = (parseResult as any).markdown;
        }
      } else if ((parseResult as any)?.markdown) {
        extractedText = (parseResult as any).markdown;
      } else if (typeof parseResult === 'string') {
        extractedText = parseResult;
      }
    } catch (err) {
      console.error('kordoc failed:', err);
      throw err;
    }

    fs.unlinkSync(filePath);
    res.json({ text: extractedText });
  } catch (err: any) {
    console.error('Error extracting text:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    next(err);
  }
});

// Error handler
app.use('/api', (err: any, req: any, res: any, next: any) => {
  console.error('API Error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
