import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { spawn } from 'child_process';
import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Polyfill browser globals required by pdfjs-dist before kordoc is dynamically imported
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
    constructor(w: number, h: number) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); }
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {};
}

// In-memory form storage
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

// Set up server
async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json());

  // Set up multer for file uploads
  const uploadDir = 'uploads/';
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


  // API endpoints
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Save a form and get a unique link
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
    if (!data) {
      return res.status(404).json({ error: 'Form not found' });
    }
    res.json(data.form);
  });

  // Submit a response to a form
  app.post('/api/forms/:id/responses', (req, res) => {
    const data = formStore.get(req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'Form not found' });
    }
    const responses = responseStore.get(req.params.id) || [];
    responses.push({ ...req.body, submittedAt: new Date().toISOString() });
    responseStore.set(req.params.id, responses);
    res.json({ success: true });
  });

  // Get responses for a form
  app.get('/api/forms/:id/responses', (req, res) => {
    const data = formStore.get(req.params.id);
    if (!data) {
      return res.status(404).json({ error: 'Form not found' });
    }
    const responses = responseStore.get(req.params.id) || [];
    res.json(responses);
  });

  app.post('/api/extract-text', upload.single('file'), async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const filePath = req.file.path;
      const originalName = req.file.originalname;
      
      console.log(`Extracting text from: ${originalName}`);
      let extractedText = '';

      // Try to use kordoc to parse the file
      try {
        const { parse } = await import('@clazic/kordoc');
        const parseResult = await parse(filePath, {
            format: 'markdown', 
            silent: true 
        });
        
        if (parseResult && (parseResult as any).success && (parseResult as any).blocks) {
            let currentContent: string[] = [];
            let currentPage = 1;
            
            function extractTextFromBlock(block: any): string {
                let result = '';
                if (block.pageNumber && block.pageNumber !== currentPage) {
                    result += `\n\n--- [PAGE ${block.pageNumber}] ---\n\n`;
                    currentPage = block.pageNumber;
                }
                
                if (block.text) {
                    result += block.text + '\n';
                }
                
                if (block.type === 'table' && block.table && block.table.cells) {
                    result += '\n';
                    for (const row of block.table.cells) {
                         result += (row || []).map((cell: any) => cell ? cell.text : '').join(' | ') + '\n';
                    }
                    result += '\n';
                }
                
                if (block.children && Array.isArray(block.children)) {
                    for (const child of block.children) {
                        result += extractTextFromBlock(child);
                    }
                }
                
                return result;
            }

            for (const block of (parseResult as any).blocks) {
                currentContent.push(extractTextFromBlock(block));
            }
            extractedText = currentContent.join('').trim();
            // If the blocks didn't have much text, fallback to the markdown
            if (extractedText.length < 50 && (parseResult as any).markdown) {
                extractedText = (parseResult as any).markdown;
            }
        } else if (parseResult && (parseResult as any).markdown) {
            extractedText = (parseResult as any).markdown;
        } else if (parseResult && typeof parseResult === 'string') {
            extractedText = parseResult;
        }
      } catch (err) {
         console.error("Kordoc failed to parse, falling back to simple read if possible", err);
         throw err;
      }

      // Cleanup
      fs.unlinkSync(filePath);

      res.json({ text: extractedText });
    } catch (err: any) {
      console.error('Error extracting text:', err);
      // Cleanup on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      next(err);
    }
  });

  // Global Error Handler for API
  app.use('/api', (err: any, req: any, res: any, next: any) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  });

  // Vite dev server / static serving
  if (process.env.NODE_ENV !== 'production') {
    const VITE_PORT = 5173;
    const viteProc = spawn(
      'node_modules/.bin/vite',
      ['--port', String(VITE_PORT), '--strictPort'],
      { stdio: 'inherit', shell: false }
    );
    process.on('exit', () => viteProc.kill());
    // Wait briefly for Vite to start, then proxy all non-API traffic
    await new Promise(r => setTimeout(r, 1500));
    app.use(
      createProxyMiddleware({
        target: `http://localhost:${VITE_PORT}`,
        changeOrigin: true,
        ws: true,
      })
    );
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Serve static files
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
