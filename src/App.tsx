import { useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { generateFormDesign } from './lib/gemini';
import { GeneratedForm } from './types';
import FormPreview from './components/FormPreview';
import DemoModal from './components/DemoModal';
import ResponsesModal from './components/ResponsesModal';
import { Sparkles, Layout, Code2, Copy, Check, UploadCloud, Search, X, Link as LinkIcon, FileText } from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function App() {
  const [rawText, setRawText] = useState('');
  const [platform, setPlatform] = useState('Google Forms');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [generatedForm, setGeneratedForm] = useState<GeneratedForm | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'json'>('preview');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [isLinkGenerated, setIsLinkGenerated] = useState(false);
  const [numPages, setNumPages] = useState<number>();
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [showPageViewer, setShowPageViewer] = useState(false);
  const [viewerPageNum, setViewerPageNum] = useState<number>(1);
  const [generatedLink, setGeneratedLink] = useState<string>('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showResponsesModal, setShowResponsesModal] = useState(false);
  const [formId, setFormId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }): void {
    setNumPages(numPages);
  }

  const handlePageClick = (pageNum: number) => {
    if (uploadedFileUrl) {
      // PDF가 업로드된 경우 해당 페이지를 모달로 보여줌
      setViewerPageNum(pageNum);
      setShowPageViewer(true);
    } else {
      // PDF가 없으면 textarea에서 해당 페이지 텍스트로 스크롤
      if (!textareaRef.current) return;
      const textarea = textareaRef.current;
      
      const searchString = `--- [PAGE ${pageNum}] ---`;
      const index = rawText.indexOf(searchString);
      
      if (index !== -1) {
        const textBefore = rawText.substring(0, index);
        const linesBefore = textBefore.split('\n').length;
        
        textarea.focus();
        textarea.setSelectionRange(index, index + searchString.length);
        
        const lineHeight = parseInt(window.getComputedStyle(textarea).lineHeight || '24');
        textarea.scrollTop = linesBefore * lineHeight;
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);

    // 파일 캐시 확인 (이름 + 크기 + 마지막 수정 시간)
    const fileCacheKey = `fileCache_${file.name}_${file.size}_${file.lastModified}`;
    const cachedText = localStorage.getItem(fileCacheKey);

    if (cachedText) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setUploadedFileUrl(URL.createObjectURL(file));
      } else {
        setUploadedFileUrl(null);
      }
      setRawText(cachedText);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const fileUrl = URL.createObjectURL(file);
      setUploadedFileUrl(fileUrl);
      
      setIsExtracting(true);
      setError(null);
      
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let extractedText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          extractedText += `\n\n--- [PAGE ${i}] ---\n\n`;
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          extractedText += pageText + '\n';
        }
        
        setRawText(extractedText);
        try {
          localStorage.setItem(fileCacheKey, extractedText);
        } catch (e) {
          console.warn("파일 캐싱 실패");
        }
      } catch (err: any) {
        console.error('PDF JS Extraction error:', err);
        setError('PDF 텍스트 추출 중 오류가 발생했습니다: ' + err.message);
      } finally {
        setIsExtracting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    } else {
      setUploadedFileUrl(null);
    }

    setIsExtracting(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData,
      });

      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("Non-JSON response from server:", text);
        if (text.includes("Cookie check") || text.includes("aistudio_auth_flow")) {
          throw new Error("브라우저 보안 정책으로 인해 HWP 파일 등은 새 창에서 열어야 변환이 가능합니다. 에러창을 닫고 'Open in New Tab' 아이콘(새 창에서 열기)을 클릭해주세요.");
        }
        throw new Error(`서버 응답 오류 (JSON 파싱 실패): ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extract text');
      }

      setRawText(data.text);
      try {
        localStorage.setItem(fileCacheKey, data.text);
      } catch (e) {
        console.warn("파일 캐싱 실패");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '문서 텍스트를 추출하는 중 오류가 발생했습니다.');
    } finally {
      setIsExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString();
  };

  const handleGenerate = async () => {
    if (!rawText.trim()) return;
    
    setIsGenerating(true);
    setError(null);
    try {
      const cacheKey = `formCache_${platform}_${getHash(rawText)}_${rawText.length}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        setGeneratedForm(JSON.parse(cached));
        setActiveTab('preview');
        setIsGenerating(false);
        return;
      }

      const result = await generateFormDesign(rawText, platform);
      setGeneratedForm(result);
      
      try {
        localStorage.setItem(cacheKey, JSON.stringify(result));
      } catch (e) {
        console.warn("로컬 스토리지 용량 초과로 캐싱 실패");
      }
      
      setActiveTab('preview');
    } catch (err: any) {
      console.error(err);
      if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('Quota'))) {
        setError('API 사용량을 초과했습니다. 잠시 후 다시 시도해주시거나 요금제를 확인해주세요 (Quota Exceeded).');
      } else {
        setError('제출 양식을 생성하는 중 오류가 발생했습니다. 텍스트를 확인하고 다시 시도해주세요.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteField = (sIdx: number, fieldId: string) => {
    if (!generatedForm) return;
    const newForm = { ...generatedForm };
    newForm.sections[sIdx].fields = newForm.sections[sIdx].fields.filter(f => f.id !== fieldId);
    setGeneratedForm(newForm);
  };

  const handleEditField = (sIdx: number, fieldId: string, newQuestion: string) => {
    if (!generatedForm) return;
    const newForm = { ...generatedForm };
    const fieldIndex = newForm.sections[sIdx].fields.findIndex(f => f.id === fieldId);
    if (fieldIndex > -1) {
      newForm.sections[sIdx].fields[fieldIndex].question = newQuestion;
    }
    setGeneratedForm(newForm);
  };

  const copyJson = () => {
    if (generatedForm) {
      navigator.clipboard.writeText(JSON.stringify(generatedForm, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#FAFAF9] text-[#1A1A1A] font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="flex justify-between items-center px-10 py-6 border-b border-[#E7E7E4] bg-white z-10 shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-[#1A1A1A] rounded-full flex items-center justify-center shrink-0">
            <span className="text-[#FAFAF9] text-xs font-bold">E/F</span>
          </div>
          <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#1A1A1A]">EasyForm</span>
        </div>
        <div className="flex items-center space-x-8 text-[11px] font-semibold tracking-wider uppercase opacity-60">
          <span className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-[#1A1A1A]"></span>
             UX/UI 폼 전문가 준비 완료
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-12 overflow-hidden">
        {/* Left Side: Input */}
        <section className="col-span-12 md:col-span-4 lg:col-span-4 border-r border-[#E7E7E4] p-8 md:p-12 flex flex-col h-full overflow-hidden bg-[#FAFAF9]">
          <div className="shrink-0 mb-6">
            <p className="text-[10px] font-bold tracking-[0.3em] uppercase mb-4 text-[#8C8C88]">분석 엔진 v1.0</p>
            <h1 className="text-5xl lg:text-7xl font-sans font-bold leading-[1.1] tracking-tight mb-6">
              문서에서<br/><span className="font-sans text-3xl font-light opacity-50">온라인 폼으로</span>
            </h1>
            
            <div className="flex flex-col">
              <input
                type="file"
                accept=".pdf,.hwp,.hwpx,.docx"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtracting}
                className="w-full flex items-center justify-center gap-3 border-2 border-dashed border-[#E7E7E4] hover:border-[#1A1A1A] hover:bg-[#F5F5F4] transition-colors py-4 rounded-sm text-[#4A4A47] group disabled:opacity-50"
              >
                {isExtracting ? (
                  <span className="flex items-center gap-2 text-sm italic">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    텍스트 추출 중...
                  </span>
                ) : (
                  <>
                    <UploadCloud className="w-5 h-5 opacity-60 group-hover:opacity-100" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">PDF / HWP 업로드</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4 shrink-0">
             <label className="text-[10px] font-bold tracking-widest uppercase text-[#8C8C88]">추출된 텍스트</label>
             <select 
               value={platform} 
               onChange={(e) => setPlatform(e.target.value)}
               className="text-[10px] uppercase font-bold tracking-wider border border-[#E7E7E4] rounded-none py-1.5 px-3 bg-white focus:outline-none focus:border-[#1A1A1A] transition-colors cursor-pointer"
             >
               <option value="Google Forms">Google Forms</option>
               <option value="Naver Office">Naver Office</option>
               <option value="Typeform">Typeform</option>
             </select>
          </div>

          <div className="flex-1 flex flex-col relative min-h-0 mb-6 bg-white border border-[#E7E7E4] rounded-sm overflow-hidden focus-within:border-[#1A1A1A] transition-colors">
            <textarea
              ref={textareaRef}
              className="w-full h-full p-5 resize-none focus:outline-none text-sm leading-relaxed font-light italic text-[#4A4A47] placeholder:opacity-30 bg-transparent overflow-y-auto"
              placeholder="파일을 업로드하면 추출된 문서 내용이 여기에 표시됩니다."
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </div>

          <div className="shrink-0 pt-6 border-t border-[#E7E7E4]">
            <button
               onClick={handleGenerate}
               disabled={isGenerating || !rawText.trim()}
               className="w-full px-8 py-4 bg-[#1A1A1A] text-[#FAFAF9] text-[11px] font-bold uppercase tracking-[0.3em] hover:bg-[#333] disabled:opacity-50 disabled:hover:bg-[#1A1A1A] transition-colors flex justify-center items-center gap-3 rounded-sm"
             >
               {isGenerating ? (
                 <>
                   <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                     <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                     <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                   </svg>
                   처리 중...
                 </>
               ) : (
                 <>
                   디지털 링크 생성
                 </>
               )}
             </button>
          </div>
        </section>

        {/* Right Side: Output */}
        <section className="col-span-12 md:col-span-8 lg:col-span-8 bg-white flex flex-col overflow-hidden relative">
           <div className="flex justify-between items-center px-12 py-6 border-b border-[#E7E7E4] bg-white shrink-0 absolute top-0 left-0 right-0 z-10 w-full">
              <div className="flex space-x-6 text-[10px] font-bold uppercase tracking-widest">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`transition-opacity ${
                    activeTab === 'preview' ? 'opacity-100 border-b-2 border-[#1A1A1A] pb-1' : 'opacity-40 hover:opacity-100'
                  }`}
                >
                  디지털 미리보기
                </button>
                <button
                  onClick={() => setActiveTab('json')}
                  className={`transition-opacity ${
                    activeTab === 'json' ? 'opacity-100 border-b-2 border-[#1A1A1A] pb-1' : 'opacity-40 hover:opacity-100'
                  }`}
                >
                  JSON 스키마
                </button>
              </div>
              
              {activeTab === 'json' && generatedForm && (
                 <button 
                    onClick={copyJson}
                    className="text-[10px] font-bold uppercase tracking-widest opacity-60 hover:opacity-100 flex items-center gap-2 transition-opacity"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? '복사됨' : '복사'}
                  </button>
              )}
          </div>

          <div className="flex-1 overflow-auto p-12 pt-[80px] w-full bg-white relative">
            {error ? (
              <div className="h-full flex flex-col items-center justify-center">
                 <h2 className="text-3xl font-serif text-[#1A1A1A] mb-4">처리 오류</h2>
                 <p className="text-sm font-light text-[#4A4A47] italic max-w-md text-center">{error}</p>
              </div>
            ) : activeTab === 'preview' ? (
              <FormPreview 
                form={generatedForm} 
                onPageClick={handlePageClick} 
                onGenerateLink={() => {
                  setShowVerification(true);
                  setIsLinkGenerated(false);
                  setGeneratedLink('');
                  setLinkCopied(false);
                }} 
                onDemoClick={() => setShowDemoModal(true)}
                onDeleteField={handleDeleteField}
                onEditField={handleEditField}
              />
            ) : (
              <div className="h-full relative font-mono text-[11px] leading-relaxed">
                {generatedForm ? (
                  <textarea
                    readOnly
                    value={JSON.stringify(generatedForm, null, 2)}
                    className="w-full h-full p-6 bg-[#FAFAF9] text-[#4A4A47] border border-[#E7E7E4] rounded-sm resize-none focus:outline-none focus:border-[#1A1A1A] transition-colors overflow-auto"
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-[#8C8C88]">
                     <span className="font-serif text-4xl italic opacity-30 mb-4">스키마</span>
                     <p className="text-[10px] font-bold tracking-widest uppercase">콘텐츠 분석 대기 중</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Verification Modal (Quick Look style) */}
      {showVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/80 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200">
          <div className="bg-[#FAFAF9] w-full max-w-7xl h-full flex flex-col rounded-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-8 py-5 border-b border-[#E7E7E4] shrink-0 bg-white">
              <h3 className="text-sm font-bold tracking-widest uppercase text-[#1A1A1A] flex items-center gap-3">
                 <Search className="w-4 h-4" />
                 데이터 검토 및 최종 확인
              </h3>
              <button onClick={() => setShowVerification(false)} className="p-2 text-[#8C8C88] hover:text-[#1A1A1A] transition-colors">
                 <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 flex overflow-hidden">
               {/* Content area that swaps based on mobile/desktop and state */}
               {/* For simplicity while maintaining structure, I'll use state to control visibility on mobile */}
               <div className={`w-full md:w-1/2 md:border-r border-[#E7E7E4] bg-[#E7E7E4]/30 flex flex-col relative overflow-hidden ${isLinkGenerated ? 'hidden md:flex' : 'flex'}`}>
                  {/* PDF Viewer / Raw Text */}
                  {uploadedFileUrl ? (
                     <div className="w-full h-full overflow-y-auto bg-gray-200 custom-scrollbar flex flex-col items-center p-4">
                       <Document 
                         file={uploadedFileUrl} 
                         onLoadSuccess={onDocumentLoadSuccess}
                         loading={
                           <div className="flex flex-col items-center justify-center p-12 text-[#8C8C88]">
                             <svg className="animate-spin h-6 w-6 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                             <span className="text-xs font-bold tracking-widest uppercase">PDF 로딩 중...</span>
                           </div>
                         }
                       >
                         {Array.from(new Array(numPages), (el, index) => (
                           <Page 
                             key={`page_${index + 1}`} 
                             pageNumber={index + 1} 
                             renderTextLayer={false}
                             renderAnnotationLayer={false}
                             className="shadow-md mb-4 bg-white"
                             width={480}
                           />
                         ))}
                       </Document>
                     </div>
                  ) : (
                     <div className="w-full h-full p-8 overflow-auto flex flex-col items-center justify-center text-[#8C8C88]">
                       <FileText className="w-12 h-12 opacity-20 mb-6" />
                       <p className="mb-2 font-bold uppercase tracking-widest text-xs">원문 텍스트 데이터 ({uploadedFileName || '알 수 없음'})</p>
                       <p className="text-xs opacity-70 mb-8 italic">HWP 등 PDF가 아닌 포맷은 브라우저 기본적으로 화면에 렌더링을 지원하지 않아 텍스트로 대체하여 보여드립니다.</p>
                       <div className="w-full max-w-lg bg-white p-6 border border-[#E7E7E4] rounded-sm shadow-sm text-left">
                         <textarea readOnly value={rawText} className="w-full h-64 resize-none focus:outline-none text-[13px] leading-relaxed font-light text-[#4A4A47] bg-transparent" />
                       </div>
                     </div>
                  )}
               </div>
               
               {/* Right Side / Mobile Full: Questions Review */}
               <div className={`w-full md:w-1/2 bg-[#FAFAF9] flex flex-col overflow-hidden ${isLinkGenerated ? 'flex' : 'hidden md:flex'}`}>
                  <div className="px-8 py-5 bg-white border-b border-[#E7E7E4] flex items-center justify-between gap-4 shrink-0">
                     {isLinkGenerated && (
                       <button onClick={() => setIsLinkGenerated(false)} className="md:hidden text-xs font-bold text-[#8C8C88] hover:text-[#1A1A1A]">
                         ← 뒤로
                       </button>
                     )}
                     <span className="text-xl opacity-60">👀</span>
                     <p className="text-sm text-[#4A4A47] font-light leading-relaxed flex-1">생성될 폼 항목이 원본 문서와 올바르게 매칭되었는지 확인 후 링크를 생성해주세요.</p>
                  </div>
                  <div className="flex-1 overflow-auto p-8 space-y-8">
                     {generatedForm?.sections.map((sec, sIdx) => (
                        <div key={sIdx}>
                           <h4 className="text-xs font-bold uppercase tracking-widest text-[#1A1A1A] mb-4 pb-2 border-b border-[#E7E7E4]">{sec.title}</h4>
                           <ul className="space-y-4">
                              {sec.fields.map(f => (
                                 <li key={f.id} className="bg-white p-5 border border-[#E7E7E4] rounded-sm flex flex-col gap-3 shadow-sm hover:border-[#1A1A1A]/30 transition-colors">
                                    <div className="flex justify-between items-start gap-4">
                                      <span className="text-[14px] text-[#1A1A1A] font-medium leading-relaxed">
                                        {f.question} {f.required && <span className="text-red-500">*</span>}
                                      </span>
                                      {f.pageReference && (
                                        <span className="text-[10px] font-bold tracking-widest uppercase bg-[#E7E7E4]/50 text-[#4A4A47] px-2 py-1 rounded-sm shrink-0 whitespace-nowrap">
                                          {f.pageReference}페이지
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex justify-between items-center mt-2 pt-3 border-t border-[#E7E7E4]/50">
                                      <span className="text-[10px] uppercase font-bold tracking-widest text-[#8C8C88]">{f.type.replace('_', ' ')}</span>
                                    </div>
                                 </li>
                              ))}
                           </ul>
                        </div>
                     ))}
                  </div>
                  <div className="p-6 border-t border-[#E7E7E4] flex justify-end gap-4 shrink-0 bg-white">
                     <button onClick={() => setShowVerification(false)} className="px-6 py-3 border border-[#E7E7E4] rounded-sm text-[#4A4A47] text-xs font-bold uppercase tracking-widest hover:bg-[#F5F5F4] transition-colors">
                       돌아가기
                     </button>
                      <button 
                         onClick={async () => {
                            if (isLinkGenerated || !generatedForm) return;
                            setIsGeneratingLink(true);
                            try {
                              const res = await fetch('/api/forms', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(generatedForm),
                              });
                              const data = await res.json();
                              const fullUrl = `${window.location.origin}${data.url}`;
                              setGeneratedLink(fullUrl);
                              const newFormId = data.url.split('/survey/')[1];
                              if (newFormId) setFormId(newFormId);
                              setIsLinkGenerated(true);
                            } catch (err) {
                              console.error('Link generation failed:', err);
                            } finally {
                              setIsGeneratingLink(false);
                            }
                         }} 
                         disabled={isGeneratingLink}
                         className={`px-8 py-3 rounded-sm text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-3 ${isLinkGenerated ? 'bg-[#F5F5F4] text-[#1A1A1A] border border-[#E7E7E4]' : 'bg-[#1A1A1A] text-[#FAFAF9] hover:bg-[#333]'} disabled:opacity-50`}
                      >
                         {isGeneratingLink ? (
                           <><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> 생성 중...</>
                         ) : isLinkGenerated ? (<><Check className="w-4 h-4" /> 링크 생성 완료!</>) : (<><LinkIcon className="w-4 h-4" /> 최종 링크 생성하기</>)}
                      </button>
                   </div>
                   {isLinkGenerated && generatedLink && (
                     <div className="px-6 pb-6 bg-white space-y-3">
                       {/* 가짜 공개 URL */}
                       <div className="flex items-center gap-2 bg-[#F5F5F4] border border-[#E7E7E4] rounded-sm p-3">
                         <LinkIcon className="w-4 h-4 text-[#8C8C88] shrink-0" />
                         <input
                           type="text"
                           readOnly
                           value={`https://easyform.pro/f/${generatedLink.split('/survey/')[1] || ''}`}
                           className="flex-1 bg-transparent text-sm text-[#1A1A1A] focus:outline-none font-mono"
                         />
                         <button
                           onClick={() => {
                             navigator.clipboard.writeText(`https://easyform.pro/f/${generatedLink.split('/survey/')[1] || ''}`);
                             setLinkCopied(true);
                             setTimeout(() => setLinkCopied(false), 2000);
                           }}
                           className="px-3 py-1.5 bg-[#1A1A1A] text-white text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#333] transition-colors flex items-center gap-1.5 shrink-0"
                         >
                           {linkCopied ? <><Check className="w-3 h-3" /> 복사됨</> : <><Copy className="w-3 h-3" /> 복사</>}
                         </button>
                       </div>
                       <p className="text-[10px] text-[#8C8C88] italic">이 링크를 공유하면 누구나 설문에 참여할 수 있습니다.</p>
                       <div className="flex justify-between items-center mt-6 pt-6 border-t border-[#E7E7E4]">
                         <a 
                           href={generatedLink} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="text-[11px] text-blue-500 hover:text-blue-700 underline font-medium"
                         >
                           ▸ 로컬 테스트 링크로 열기 (새 탭)
                         </a>
                         <button
                           onClick={() => setShowResponsesModal(true)}
                           className="px-4 py-2 border border-[#1A1A1A] text-[#1A1A1A] text-[10px] font-bold uppercase tracking-widest rounded-sm hover:bg-[#F5F5F4] transition-colors flex items-center gap-2"
                         >
                           <Database className="w-3 h-3" />
                           제출된 응답(데이터) 확인
                         </button>
                       </div>
                     </div>
                   )}
               </div>
            </div>
          </div>
        </div>
      )}

      {/* PDF Page Viewer Modal */}
      {showPageViewer && uploadedFileUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/80 backdrop-blur-sm p-4 md:p-8 animate-in fade-in duration-200" onClick={() => setShowPageViewer(false)}>
          <div className="bg-[#FAFAF9] max-w-2xl w-full max-h-[90vh] flex flex-col rounded-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#E7E7E4] shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-[#4A4A47]" />
                <h3 className="text-sm font-bold tracking-widest uppercase text-[#1A1A1A]">
                  {viewerPageNum}페이지
                </h3>
                <span className="text-[10px] text-[#8C8C88] font-light italic">{uploadedFileName}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewerPageNum(p => Math.max(1, p - 1))}
                  disabled={viewerPageNum <= 1}
                  className="px-2 py-1 text-xs font-bold text-[#4A4A47] hover:bg-[#F5F5F4] disabled:opacity-30 transition-colors rounded-sm"
                >
                  ←
                </button>
                <span className="text-[10px] font-bold tracking-widest text-[#8C8C88]">
                  {viewerPageNum} / {numPages || '?'}
                </span>
                <button
                  onClick={() => setViewerPageNum(p => Math.min(numPages || p, p + 1))}
                  disabled={viewerPageNum >= (numPages || 1)}
                  className="px-2 py-1 text-xs font-bold text-[#4A4A47] hover:bg-[#F5F5F4] disabled:opacity-30 transition-colors rounded-sm"
                >
                  →
                </button>
                <button onClick={() => setShowPageViewer(false)} className="ml-2 p-2 text-[#8C8C88] hover:text-[#1A1A1A] transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-200 flex justify-center p-4">
              <Document
                file={uploadedFileUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex flex-col items-center justify-center p-12 text-[#8C8C88]">
                    <svg className="animate-spin h-6 w-6 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span className="text-xs font-bold tracking-widest uppercase">PDF 로딩 중...</span>
                  </div>
                }
              >
                <Page
                  pageNumber={viewerPageNum}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-md bg-white"
                  width={550}
                />
              </Document>
            </div>
          </div>
        </div>
      )}

      {/* Demo Modal */}
      {showDemoModal && generatedForm && (
        <DemoModal 
          form={generatedForm} 
          rawText={rawText} 
          uploadedFileUrl={uploadedFileUrl}
          uploadedFileName={uploadedFileName}
          onClose={() => setShowDemoModal(false)} 
        />
      )}

      {showResponsesModal && formId && (
        <ResponsesModal 
          formId={formId} 
          uploadedFileUrl={uploadedFileUrl}
          form={generatedForm}
          onClose={() => setShowResponsesModal(false)} 
        />
      )}
    </div>
  );
}

