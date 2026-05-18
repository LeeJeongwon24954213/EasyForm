import { useState, useEffect } from 'react';
import { X, FileText, Clock, User, Loader2 } from 'lucide-react';
import { GeneratedForm } from '../types';
import { pdfjs } from 'react-pdf';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { analyzeFieldCoordinates } from '../lib/gemini';

interface ResponsesModalProps {
  formId: string;
  uploadedFileUrl?: string | null;
  form?: GeneratedForm | null;
  onClose: () => void;
}

export default function ResponsesModal({ formId, uploadedFileUrl, form, onClose }: ResponsesModalProps) {
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdfId, setGeneratingPdfId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/forms/${formId}/responses`)
      .then(res => res.json())
      .then(data => {
        setResponses(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch responses", err);
        setLoading(false);
      });
  }, [formId]);

  const handleGeneratePdf = async (idx: number, answers: any) => {
    if (!uploadedFileUrl || !form) {
      alert("원본 문서 데이터가 없어 PDF를 생성할 수 없습니다. (페이지 새로고침 시 초기화됨)");
      return;
    }
    setGeneratingPdfId(idx);
    try {
      const fieldsByPage: Record<number, {id: string, question: string}[]> = {};
      for (const section of form.sections) {
        for (const field of section.fields) {
          const pageNum = field.pageReference || 1;
          if (!fieldsByPage[pageNum]) fieldsByPage[pageNum] = [];
          fieldsByPage[pageNum].push({ id: field.id, question: field.question });
        }
      }

      const pdfBytes = await fetch(uploadedFileUrl).then(res => res.arrayBuffer());
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pdfDoc.registerFontkit(fontkit);
      
      const fontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf';
      const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
      const customFont = await pdfDoc.embedFont(fontBytes);

      const docPages = pdfDoc.getPages();
      const numPagesInOriginal = docPages.length;
      const loadingTask = pdfjs.getDocument(uploadedFileUrl);
      const pdf = await loadingTask.promise;

      for (const [pageNumStr, fields] of Object.entries(fieldsByPage)) {
         const pageNum = parseInt(pageNumStr);
         if (pageNum > numPagesInOriginal) continue;

         const page = await pdf.getPage(pageNum);
         const viewport = page.getViewport({ scale: 2.0 });
         const canvas = document.createElement('canvas');
         const context = canvas.getContext('2d');
         if (!context) continue;
         
         canvas.height = viewport.height;
         canvas.width = viewport.width;
         await page.render({ canvasContext: context, viewport }).promise;
         const imageBase64 = canvas.toDataURL('image/png');

         const cacheKey = `coords_${form.title}_${pageNum}_${fields.map(f => f.id).join('-')}`;
         let coords;
         const cachedCoords = localStorage.getItem(cacheKey);
         if (cachedCoords) {
           coords = JSON.parse(cachedCoords);
         } else {
           coords = await analyzeFieldCoordinates(imageBase64, fields);
           localStorage.setItem(cacheKey, JSON.stringify(coords));
         }
         const pdfPage = docPages[pageNum - 1];
         const { width, height } = pdfPage.getSize();

         for (const [fieldId, coordArray] of Object.entries(coords)) {
           const val = answers[fieldId];
           if (val && Array.isArray(coordArray)) {
             const text = Array.isArray(val) ? val.join(', ') : val;
             for (const coord of coordArray) {
               pdfPage.drawText(text, {
                 x: (width * coord.x) + 2,
                 y: (height * (1 - coord.y)) - 4,
                 size: 11,
                 font: customFont,
                 color: rgb(0.1, 0.1, 0.9),
               });
             }
           }
         }
      }

      const pdfBytesSaved = await pdfDoc.save();
      const blob = new Blob([pdfBytesSaved], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      
    } catch (err: any) {
      console.error(err);
      alert("PDF 생성 중 오류가 발생했습니다: " + err.message);
    } finally {
      setGeneratingPdfId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#FAFAF9] max-w-4xl w-full max-h-[90vh] flex flex-col rounded-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#E7E7E4] shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-lg">📊</span>
            <h3 className="text-sm font-bold tracking-widest uppercase text-[#1A1A1A]">제출된 응답 데이터 관리 (데모)</h3>
          </div>
          <button onClick={onClose} className="p-2 text-[#8C8C88] hover:text-[#1A1A1A] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8 bg-[#F0EBE3]">
          <div className="mb-6 bg-white border border-[#E7E7E4] rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-bold text-[#1A1A1A] mb-2">실시간 응답 내역</h2>
            <p className="text-sm text-[#4A4A47]">공유된 링크를 통해 사용자가 제출한 응답과 PDF 입력 데이터가 이곳에 안전하게 저장됩니다.</p>
          </div>

          {loading ? (
            <div className="text-center py-12 text-[#8C8C88]">불러오는 중...</div>
          ) : responses.length === 0 ? (
            <div className="bg-white border border-[#E7E7E4] rounded-lg p-12 text-center shadow-sm">
              <FileText className="w-12 h-12 text-[#E7E7E4] mx-auto mb-4" />
              <p className="text-[#8C8C88] font-medium">아직 제출된 응답이 없습니다.</p>
              <p className="text-xs text-[#8C8C88] mt-2">생성된 링크로 들어가서 폼을 제출해보세요.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {responses.map((res, idx) => (
                <div key={idx} className="bg-white border border-[#E7E7E4] rounded-lg p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#E7E7E4]">
                    <div className="flex items-center gap-2 text-[#1A1A1A] font-bold">
                      <User className="w-4 h-4 text-[#8C8C88]" />
                      응답 #{idx + 1}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[#8C8C88]">
                      <Clock className="w-3 h-3" />
                      {new Date(res.submittedAt).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(res.answers || {}).map(([key, value]) => (
                      <div key={key} className="bg-[#FAFAF9] p-3 rounded border border-[#E7E7E4]">
                        <p className="text-[10px] uppercase font-bold tracking-widest text-[#8C8C88] mb-1">{key}</p>
                        <p className="text-[14px] text-[#1A1A1A] font-medium">{Array.isArray(value) ? value.join(', ') : String(value)}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-[#E7E7E4] flex justify-end">
                    <button 
                      onClick={() => handleGeneratePdf(idx, res.answers)}
                      disabled={generatingPdfId === idx}
                      className="text-[11px] font-bold uppercase tracking-widest text-white bg-blue-600 px-4 py-2 rounded-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {generatingPdfId === idx ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> 문서 생성 중...</>
                      ) : (
                        "📄 작성된 PDF 문서 열기"
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
