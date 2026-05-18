import { GeneratedForm } from '../types';
import { FormField } from '../types';

import { Trash2, Edit2 } from 'lucide-react';

export default function FormPreview({ 
  form, 
  onPageClick, 
  onGenerateLink, 
  onDemoClick,
  onDeleteField,
  onEditField 
}: { 
  form: GeneratedForm | null, 
  onPageClick?: (pageNum: number) => void, 
  onGenerateLink?: () => void, 
  onDemoClick?: () => void,
  onDeleteField?: (sIdx: number, fieldId: string) => void,
  onEditField?: (sIdx: number, fieldId: string, newQuestion: string) => void
}) {
  if (!form) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-gray-400">
         <span className="text-5xl opacity-30 mb-4">📋</span>
         <p className="text-[15px] font-medium">콘텐츠 분석 대기 중</p>
      </div>
    );
  }

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'short_text':
        return (
          <input
            type="text"
            disabled
            className="w-1/2 border-b border-[#E7E7E4] py-1 text-[15px] focus:outline-none transition-colors bg-transparent mt-2 border-dashed italic placeholder:opacity-30"
            placeholder="단답형 텍스트"
          />
        );
      case 'long_text':
        return (
          <textarea
            disabled
            className="w-full border-b border-[#E7E7E4] py-1 text-[15px] focus:outline-none transition-colors bg-transparent mt-2 resize-none h-10 border-dashed italic placeholder:opacity-30"
            placeholder="장문형 텍스트"
          />
        );
      case 'date':
        return (
          <input
            type="date"
            disabled
            className="w-auto border-b border-[#E7E7E4] py-1 text-[15px] focus:outline-none transition-colors bg-transparent mt-2"
          />
        );
      case 'multiple_choice':
      case 'checkbox':
        return (
          <div className="mt-4 space-y-4">
            {field.options?.map((opt, idx) => (
              <div key={idx} className="flex items-center space-x-3">
                <input
                  type={field.type === 'multiple_choice' ? 'radio' : 'checkbox'}
                  disabled
                  className="w-5 h-5 accent-[#1A1A1A] bg-white border-[#E7E7E4]"
                />
                <label className="text-[15px] text-[#1A1A1A]">{opt}</label>
              </div>
            ))}
          </div>
        );
      case 'dropdown':
        return (
          <select
            disabled
            className="w-48 border border-[#E7E7E4] rounded-sm p-2 text-[15px] focus:outline-none transition-colors bg-white mt-2"
          >
            <option>선택</option>
            {field.options?.map((opt, idx) => (
              <option key={idx} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      default:
        return null;
    }
  };

  let globalIndex = 0;

  return (
    <div className="max-w-[700px] mx-auto flex flex-col h-full font-serif pb-16">
      {/* Form Header */}
      <div className="mb-8 bg-white border border-[#E7E7E4] rounded-sm overflow-hidden shadow-sm">
        <div className="h-4 w-full bg-[#1A1A1A]"></div>
        <div className="p-8 md:p-10">
          <h2 className="text-4xl leading-tight mb-4 text-[#1A1A1A]">{form.title}</h2>
          {form.description && <p className="text-[15px] text-[#4A4A47] font-sans leading-relaxed whitespace-pre-wrap">{form.description}</p>}
        </div>
      </div>

      {/* Form Sections */}
      <div className="space-y-6 flex-1 font-sans">
        {form.sections.map((section, sIdx) => {
          return (
            <div key={sIdx} className="space-y-6 shrink-0">
               {section.title && (
                  <div className="bg-transparent border-b border-[#E7E7E4] pb-4 mb-2">
                    <h3 className="text-2xl font-serif text-[#1A1A1A]">{section.title}</h3>
                    {section.description && <p className="text-[15px] text-[#4A4A47] mt-2 italic">{section.description}</p>}
                  </div>
               )}

               {section.fields.map((field) => {
                  globalIndex++;
                  return (
                    <div key={field.id} className="bg-white border border-[#E7E7E4] rounded-sm p-8 shadow-sm hover:border-[#1A1A1A]/30 transition-colors">
                       <div className="flex flex-col">
                         <div className="flex items-start justify-between gap-4 mb-4">
                           <p className="text-[16px] font-medium text-[#1A1A1A] leading-relaxed">
                             {globalIndex}. {field.question}
                             {field.required && <span className="text-red-600 ml-1 font-bold">*</span>}
                           </p>
                           <div className="flex items-center gap-2">
                             <button 
                               onClick={() => {
                                 const newQ = prompt("수정할 질문 내용을 입력하세요:", field.question);
                                 if (newQ && newQ.trim() !== "" && onEditField) {
                                    onEditField(sIdx, field.id, newQ.trim());
                                 }
                               }}
                               className="text-[#8C8C88] hover:text-[#1A1A1A] p-1 transition-colors"
                               title="질문 수정"
                             >
                               <Edit2 className="w-4 h-4" />
                             </button>
                             <button 
                               onClick={() => {
                                 if (confirm("이 질문을 삭제하시겠습니까?") && onDeleteField) {
                                    onDeleteField(sIdx, field.id);
                                 }
                               }}
                               className="text-[#8C8C88] hover:text-red-500 p-1 transition-colors"
                               title="질문 삭제"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                             {field.pageReference && (
                               <button 
                                 onClick={() => onPageClick && onPageClick(field.pageReference!)}
                                 className="text-[10px] uppercase font-bold tracking-widest bg-[#F5F5F4] hover:bg-[#E7E7E4] text-[#4A4A47] px-3 py-1.5 rounded-sm flex items-center gap-1 transition-colors whitespace-nowrap ml-2"
                               >
                                  <span>Page {field.pageReference}</span>
                               </button>
                             )}
                           </div>
                         </div>
                         {renderField(field)}
                         
                         {field.explanation && (
                            <div className="mt-8 pt-4 border-t border-[#E7E7E4] border-dashed">
                              <p className="text-sm text-[#8C8C88] italic">
                                <span className="font-bold uppercase tracking-widest text-[10px] mr-2 not-italic text-[#1A1A1A]">UX 노트</span> 
                                {field.explanation}
                              </p>
                            </div>
                         )}
                       </div>
                    </div>
                  );
               })}
            </div>
          );
        })}
      </div>
      
      {/* Final Action */}
      <div className="mt-12 flex justify-start gap-4">
        <button onClick={onGenerateLink} className="px-8 py-4 bg-[#1A1A1A] text-[#FAFAF9] text-xs font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-[#333] transition-colors shadow-sm">
          링크 생성하기
        </button>
        {onDemoClick && (
          <button onClick={onDemoClick} className="px-8 py-4 bg-[#FAFAF9] text-[#1A1A1A] border-2 border-[#1A1A1A] text-xs font-bold uppercase tracking-[0.2em] rounded-sm hover:bg-[#F5F5F4] transition-colors shadow-sm flex items-center gap-2">
            <span>✨ 데모 시연</span>
          </button>
        )}
      </div>
    </div>
  );
}
