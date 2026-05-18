import { useState } from 'react';
import { GeneratedForm, FormField } from '../types';
import { Check, AlertCircle, Loader2, X, FileText, Download } from 'lucide-react';
import { fillDocument, analyzeFieldCoordinates } from '../lib/gemini';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { Document, Page, pdfjs } from 'react-pdf';

interface DemoModalProps {
  form: GeneratedForm;
  rawText: string;
  uploadedFileUrl: string | null;
  uploadedFileName: string;
  onClose: () => void;
}

export default function DemoModal({ form, rawText, uploadedFileUrl, uploadedFileName, onClose }: DemoModalProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [filledDocument, setFilledDocument] = useState<string | null>(null);
  const [filledDocumentPdfUrl, setFilledDocumentPdfUrl] = useState<string | null>(null);
  const [numPagesPdf, setNumPagesPdf] = useState<number>(1);
  const [previewPageNum, setPreviewPageNum] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateAnswer = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    if (validationErrors[fieldId]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    }
  };

  const toggleCheckbox = (fieldId: string, option: string) => {
    setAnswers(prev => {
      const current = prev[fieldId] || [];
      if (current.includes(option)) {
        return { ...prev, [fieldId]: current.filter((o: string) => o !== option) };
      }
      return { ...prev, [fieldId]: [...current, option] };
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const section of form.sections) {
      for (const field of section.fields) {
        if (field.required) {
          const val = answers[field.id];
          if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
            errors[field.id] = '필수 항목입니다.';
          }
        }
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const fillDummyData = () => {
    const dummy: Record<string, any> = {};
    for (const section of form.sections) {
      for (const field of section.fields) {
        const q = field.question.toLowerCase();
        
        if (field.type === 'short_text') {
          if (q.includes('이름') || q.includes('성명')) dummy[field.id] = '홍길동';
          else if (q.includes('학과') || q.includes('전공')) dummy[field.id] = '컴퓨터공학부';
          else if (q.includes('대학') && q.includes('원')) dummy[field.id] = '한국대학교 대학원';
          else if (q.includes('대학')) dummy[field.id] = '한국대학교';
          else if (q.includes('학년')) dummy[field.id] = '3학년';
          else if (q.includes('학번')) dummy[field.id] = '2026123456';
          else if (q.includes('전화') || q.includes('연락처') || q.includes('핸드폰')) dummy[field.id] = '010-1234-5678';
          else if (q.includes('이메일') || q.includes('e-mail')) dummy[field.id] = 'hong@example.com';
          else if (q.includes('주소')) dummy[field.id] = '서울특별시 강남구 테헤란로 123, 456호';
          else if (q.includes('서명') || q.includes('인')) dummy[field.id] = '홍 길 동';
          else if (q.includes('년')) dummy[field.id] = '2026';
          else if (q.includes('월')) dummy[field.id] = '5';
          else if (q.includes('일')) dummy[field.id] = '13';
          else if (q.includes('계좌') || q.includes('은행')) dummy[field.id] = '신한은행 110-123-456789';
          else dummy[field.id] = '예시 입력값';
        } else if (field.type === 'long_text') {
           dummy[field.id] = '글로벌 인재로 성장하기 위해 2026년도 장학생 선발에 지원하게 되었습니다. 향후 IT 분야의 글로벌 리더가 되어 사회에 공헌하고 싶습니다.';
        } else if (field.type === 'date') {
           dummy[field.id] = '2026-05-13';
        } else if (field.type === 'multiple_choice' || field.type === 'dropdown') {
           if (field.options && field.options.length > 0) dummy[field.id] = field.options[0];
        } else if (field.type === 'checkbox') {
           if (field.options && field.options.length > 0) dummy[field.id] = [field.options[0]];
        }
      }
    }
    setAnswers(dummy);
    setValidationErrors({});
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setError(null);
    try {
      if (uploadedFileUrl && uploadedFileName.toLowerCase().endsWith('.pdf')) {
        // 1. 프로그램적으로 PDF 렌더링 (DOM 의존성 제거)
        const loadingTask = pdfjs.getDocument(uploadedFileUrl);
        const pdf = await loadingTask.promise;
        // 그룹화된 페이지 기준으로 좌표 분석 및 그리기 수행
        const fieldsByPage: Record<number, {id: string, question: string}[]> = {};
        for (const section of form.sections) {
          for (const field of section.fields) {
            const pageNum = field.pageReference || 1; // pageReference가 없으면 1페이지로 간주
            if (!fieldsByPage[pageNum]) fieldsByPage[pageNum] = [];
            fieldsByPage[pageNum].push({ id: field.id, question: field.question });
          }
        }

        const pdfBytes = await fetch(uploadedFileUrl).then(res => res.arrayBuffer());
        const pdfDoc = await PDFDocument.load(pdfBytes);
        pdfDoc.registerFontkit(fontkit);
        
        const fontUrl = 'https://raw.githubusercontent.com/google/fonts/main/ofl/nanumgothic/NanumGothic-Regular.ttf';
        const fontBytes = await fetch(fontUrl).then(res => {
          if (!res.ok) throw new Error("한글 폰트를 불러오는데 실패했습니다.");
          return res.arrayBuffer();
        });
        const customFont = await pdfDoc.embedFont(fontBytes);

        const docPages = pdfDoc.getPages();
        const numPagesInOriginal = docPages.length;

        for (const [pageNumStr, fields] of Object.entries(fieldsByPage)) {
           const pageNum = parseInt(pageNumStr);
           if (pageNum > numPagesInOriginal) continue;

           // 1. 해당 페이지 프로그램적으로 렌더링
           const page = await pdf.getPage(pageNum);
           const viewport = page.getViewport({ scale: 2.0 }); // 고해상도 캡처
           const canvas = document.createElement('canvas');
           const context = canvas.getContext('2d');
           if (!context) continue;
           
           canvas.height = viewport.height;
           canvas.width = viewport.width;
           await page.render({ canvasContext: context, viewport }).promise;
           const imageBase64 = canvas.toDataURL('image/png');

           // 2. Gemini를 통한 좌표 분석 (캐싱 적용하여 데모 시연 시 0.1초 만에 즉시 완성되도록 함)
           const cacheKey = `coords_${form.title}_${pageNum}_${fields.map(f => f.id).join('-')}`;
           let coords;
           const cachedCoords = localStorage.getItem(cacheKey);
           if (cachedCoords) {
             coords = JSON.parse(cachedCoords);
           } else {
             coords = await analyzeFieldCoordinates(imageBase64, fields);
             localStorage.setItem(cacheKey, JSON.stringify(coords));
           }

           // 3. pdf-lib로 원본 PDF 페이지 위에 그리기
           const pdfPage = docPages[pageNum - 1];
           const { width, height } = pdfPage.getSize();

           for (const [fieldId, coordArray] of Object.entries(coords)) {
             const val = answers[fieldId];
             if (val && Array.isArray(coordArray)) {
               const text = Array.isArray(val) ? val.join(', ') : val;
               for (const coord of coordArray) {
                 pdfPage.drawText(text, {
                   x: (width * coord.x) + 2, // 좌측에 약간의 여백 추가
                   y: (height * (1 - coord.y)) - 4, // 텍스트 베이스라인(하단) 보정 (세로 중앙 정렬)
                   size: 11,
                   font: customFont,
                   color: rgb(0.1, 0.1, 0.9), // 파란색 텍스트
                 });
               }
             }
           }
        }
        // 저장 후 PDF URL 생성
        const pdfBytesSaved = await pdfDoc.save();
        const blob = new Blob([pdfBytesSaved], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setFilledDocumentPdfUrl(url);

      } else {
        const result = await fillDocument(rawText, form, answers);
        setFilledDocument(result);
      }
    } catch (err: any) {
      setError('문서를 완성하는 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    const hasError = !!validationErrors[field.id];
    switch (field.type) {
      case 'short_text':
        return (
          <input
            type="text"
            value={answers[field.id] || ''}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            className={`w-full border-b-2 ${hasError ? 'border-red-400' : 'border-[#E7E7E4] focus:border-[#1A1A1A]'} py-2 text-[15px] focus:outline-none transition-colors bg-transparent`}
            placeholder="답변을 입력하세요"
          />
        );
      case 'long_text':
        return (
          <textarea
            value={answers[field.id] || ''}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            className={`w-full border-2 rounded-md ${hasError ? 'border-red-400' : 'border-[#E7E7E4] focus:border-[#1A1A1A]'} p-3 text-[15px] focus:outline-none transition-colors bg-transparent resize-none min-h-[100px]`}
            placeholder="답변을 입력하세요"
          />
        );
      case 'date':
        return (
          <input
            type="date"
            value={answers[field.id] || ''}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            className={`w-auto border-2 rounded-md ${hasError ? 'border-red-400' : 'border-[#E7E7E4] focus:border-[#1A1A1A]'} p-2 text-[15px] focus:outline-none transition-colors bg-transparent`}
          />
        );
      case 'multiple_choice':
        return (
          <div className="mt-3 space-y-3">
            {field.options?.map((opt, idx) => (
              <label key={idx} className="flex items-center space-x-3 cursor-pointer group">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${answers[field.id] === opt ? 'border-[#1A1A1A] bg-[#1A1A1A]' : hasError ? 'border-red-400' : 'border-[#C4C4C1] group-hover:border-[#1A1A1A]'}`}>
                  {answers[field.id] === opt && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <span className="text-[15px] text-[#1A1A1A]" onClick={() => updateAnswer(field.id, opt)}>{opt}</span>
              </label>
            ))}
          </div>
        );
      case 'checkbox':
        return (
          <div className="mt-3 space-y-3">
            {field.options?.map((opt, idx) => {
              const checked = (answers[field.id] || []).includes(opt);
              return (
                <label key={idx} className="flex items-center space-x-3 cursor-pointer group">
                  <div 
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${checked ? 'border-[#1A1A1A] bg-[#1A1A1A]' : hasError ? 'border-red-400' : 'border-[#C4C4C1] group-hover:border-[#1A1A1A]'}`}
                    onClick={() => toggleCheckbox(field.id, opt)}
                  >
                    {checked && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-[15px] text-[#1A1A1A]" onClick={() => toggleCheckbox(field.id, opt)}>{opt}</span>
                </label>
              );
            })}
          </div>
        );
      case 'dropdown':
        return (
          <select
            value={answers[field.id] || ''}
            onChange={(e) => updateAnswer(field.id, e.target.value)}
            className={`w-60 border-2 rounded-md ${hasError ? 'border-red-400' : 'border-[#E7E7E4] focus:border-[#1A1A1A]'} p-2.5 text-[15px] focus:outline-none transition-colors bg-white cursor-pointer`}
          >
            <option value="">선택해주세요</option>
            {field.options?.map((opt, idx) => (
              <option key={idx} value={opt}>{opt}</option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/80 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200">
      <div className="bg-[#FAFAF9] max-w-5xl w-full h-[90vh] flex flex-col rounded-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center px-6 py-4 border-b border-[#E7E7E4] shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <span className="text-lg">✨</span>
            <h3 className="text-sm font-bold tracking-widest uppercase text-[#1A1A1A]">데모 시연: 원본 양식 기반 문서 완성하기</h3>
          </div>
          <button onClick={onClose} className="p-2 text-[#8C8C88] hover:text-[#1A1A1A] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex">
          {filledDocumentPdfUrl ? (
            <div className="flex-1 p-8 overflow-auto bg-gray-200 flex flex-col items-center">
              <div className="w-full max-w-2xl flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  답변이 채워진 원본 PDF
                </h2>
                <div className="flex gap-4">
                  <a href={filledDocumentPdfUrl} download={`completed_${uploadedFileName}`} className="px-4 py-2 bg-[#1A1A1A] text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#333] transition-colors flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    다운로드
                  </a>
                  <button onClick={() => setFilledDocumentPdfUrl(null)} className="px-4 py-2 border-2 border-[#1A1A1A] text-[#1A1A1A] text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-[#F5F5F4] transition-colors">
                    ← 다시 작성하기
                  </button>
                </div>
              </div>
              <Document file={filledDocumentPdfUrl} onLoadSuccess={({ numPages }) => setNumPagesPdf(numPages)}>
                 {Array.from(new Array(numPagesPdf), (el, index) => (
                   <div key={`page_${index + 1}`} className="mb-4">
                     <Page pageNumber={index + 1} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-lg bg-white" width={600} />
                   </div>
                 ))}
              </Document>
            </div>
          ) : filledDocument ? (
            <div className="flex-1 p-8 overflow-auto bg-white">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-8 border-b border-[#E7E7E4] pb-4">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    답변이 채워진 마크다운 (HWP/텍스트 폴백)
                  </h2>
                  <button onClick={() => setFilledDocument(null)} className="text-xs font-bold uppercase tracking-widest text-[#8C8C88] hover:text-[#1A1A1A]">
                    ← 다시 작성하기
                  </button>
                </div>
                <div className="bg-[#FAFAF9] border border-[#E7E7E4] p-8 rounded-sm text-[14px] leading-relaxed text-[#1A1A1A] whitespace-pre-wrap font-serif">
                  {filledDocument}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 p-8 overflow-auto bg-[#F0EBE3]">
              <div className="max-w-[600px] mx-auto">
                <div className="mb-6 bg-white border border-[#E7E7E4] rounded-lg overflow-hidden shadow-sm">
                  <div className="h-3 w-full bg-[#1A1A1A]"></div>
                  <div className="p-8">
                    <h1 className="text-2xl font-bold leading-tight mb-3">{form.title}</h1>
                    <p className="text-sm text-[#4A4A47]">{form.description}</p>
                    <div className="mt-6 pt-4 border-t border-[#E7E7E4] flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <p className="text-xs text-blue-500 italic">* 응답을 제출하면 AI가 분석하여 원본 PDF의 적절한 위치에 텍스트를 채워넣습니다.</p>
                      <button 
                        onClick={fillDummyData} 
                        className="px-4 py-2 bg-[#1A1A1A] text-white text-[11px] font-bold tracking-widest uppercase rounded-sm hover:bg-[#333] transition-colors flex items-center justify-center gap-2 shrink-0 shadow-sm"
                      >
                        ✨ 데모 예시 채우기
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {form.sections.map((section, sIdx) => (
                  <div key={sIdx} className="space-y-4 mb-6">
                    {section.title && (
                      <div className="bg-white border border-[#E7E7E4] rounded-lg p-5 shadow-sm">
                        <h2 className="text-lg font-bold text-[#1A1A1A]">{section.title}</h2>
                      </div>
                    )}
                    {section.fields.map((field, fIdx) => {
                      const hasError = !!validationErrors[field.id];
                      return (
                        <div key={field.id} className={`bg-white border rounded-lg p-6 shadow-sm transition-colors ${hasError ? 'border-red-400' : 'border-[#E7E7E4]'}`}>
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <p className="text-[15px] font-medium text-[#1A1A1A]">
                              {fIdx + 1}. {field.question}
                              {field.required && <span className="text-red-500 ml-1 font-bold">*</span>}
                            </p>
                            {field.pageReference && uploadedFileUrl && uploadedFileName.toLowerCase().endsWith('.pdf') && (
                              <button 
                                onClick={() => setPreviewPageNum(field.pageReference!)}
                                className="text-[10px] uppercase font-bold tracking-widest bg-[#F5F5F4] hover:bg-[#E7E7E4] text-[#4A4A47] px-3 py-1.5 rounded-sm flex items-center gap-1 transition-colors whitespace-nowrap ml-2 shrink-0"
                              >
                                 <span>Page {field.pageReference} 보기</span>
                              </button>
                            )}
                          </div>
                          {renderField(field)}
                          {hasError && <p className="mt-2 text-xs text-red-500">{validationErrors[field.id]}</p>}
                        </div>
                      );
                    })}
                  </div>
                ))}

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-4 bg-[#1A1A1A] text-white text-sm font-bold uppercase tracking-widest rounded-md hover:bg-[#333] disabled:opacity-50 transition-colors flex justify-center items-center gap-2 mb-12 shadow-sm"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 원본 구조 분석 및 문서 생성 중 (페이지 당 약 5초 소요)...</>
                  ) : (
                    '응답 제출 및 원본 문서 채우기'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PDF 원본 페이지 미리보기 모달 */}
      {previewPageNum && uploadedFileUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" onClick={() => setPreviewPageNum(null)}>
          <div className="bg-[#E7E7E4] p-2 rounded-sm shadow-2xl max-h-full overflow-auto relative" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-2 px-2">
               <span className="font-bold text-sm tracking-widest uppercase text-[#1A1A1A]">원본 PDF - Page {previewPageNum}</span>
               <button onClick={() => setPreviewPageNum(null)} className="p-1 text-[#8C8C88] hover:text-[#1A1A1A] transition-colors">
                 <X className="w-5 h-5" />
               </button>
            </div>
            <div className="bg-white shadow-sm overflow-hidden border border-[#C4C4C1]">
              <Document file={uploadedFileUrl}>
                 <Page pageNumber={previewPageNum} renderTextLayer={false} renderAnnotationLayer={false} width={800} />
              </Document>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
