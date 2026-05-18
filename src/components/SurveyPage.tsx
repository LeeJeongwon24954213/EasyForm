import { useState, useEffect } from 'react';
import { GeneratedForm, FormField } from '../types';
import { Check, AlertCircle, Loader2 } from 'lucide-react';

interface SurveyPageProps {
  formId: string;
}

export default function SurveyPage({ formId }: SurveyPageProps) {
  const [form, setForm] = useState<GeneratedForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadForm() {
      try {
        const res = await fetch(`/api/forms/${formId}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error('설문을 찾을 수 없습니다. 링크를 다시 확인해주세요.');
          }
          throw new Error('설문을 불러오는 중 오류가 발생했습니다.');
        }
        const data = await res.json();
        setForm(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadForm();
  }, [formId]);

  const updateAnswer = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
    // Clear validation error when user starts typing
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
    if (!form) return false;
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
    if (!form) return;
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
    if (!validate()) {
      // Scroll to first error
      const firstError = document.querySelector('[data-error="true"]');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${formId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      
      if (!res.ok) throw new Error('제출 실패');
      setSubmitted(true);
    } catch (err: any) {
      setError('응답을 제출하는 중 오류가 발생했습니다. 다시 시도해주세요.');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0EBE3] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-[#8C8C88]">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-bold tracking-widest uppercase">설문을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error && !form) {
    return (
      <div className="min-h-screen bg-[#F0EBE3] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-10 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">오류</h2>
          <p className="text-sm text-[#4A4A47]">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F0EBE3] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-10 max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-[#1A1A1A] flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-3">제출 완료!</h2>
          <p className="text-sm text-[#4A4A47] leading-relaxed">
            응답 데이터가 서버에 안전하게 저장되었습니다.<br/>(원본 문서에도 성공적으로 매핑되었습니다.)<br/>참여해 주셔서 감사합니다.
          </p>
        </div>
      </div>
    );
  }

  if (!form) return null;

  let globalIndex = 0;

  return (
    <div className="min-h-screen bg-[#F0EBE3] py-8 px-4">
      <div className="max-w-[680px] mx-auto">
        {/* Form Header */}
        <div className="mb-6 bg-white border border-[#E7E7E4] rounded-lg overflow-hidden shadow-sm">
          <div className="h-3 w-full bg-[#1A1A1A]"></div>
          <div className="p-8 md:p-10">
            <h1 className="text-3xl font-bold leading-tight mb-3 text-[#1A1A1A]">{form.title}</h1>
            {form.description && (
              <p className="text-[15px] text-[#4A4A47] leading-relaxed whitespace-pre-wrap">{form.description}</p>
            )}
            <div className="mt-6 pt-4 border-t border-[#E7E7E4] flex flex-col md:flex-row md:items-center justify-between gap-4">
              <p className="text-xs text-red-500">* 표시는 필수 항목입니다.</p>
              <button 
                onClick={fillDummyData} 
                className="px-4 py-2 bg-[#F5F5F4] text-[#1A1A1A] border border-[#E7E7E4] text-[11px] font-bold tracking-widest uppercase rounded-sm hover:bg-[#E7E7E4] transition-colors flex items-center justify-center gap-2 shrink-0 shadow-sm"
              >
                ✨ 장학생 지원 데모 자동 채우기
              </button>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Sections */}
        {form.sections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-4 mb-6">
            {section.title && (
              <div className="bg-white border border-[#E7E7E4] rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-bold text-[#1A1A1A]">{section.title}</h2>
                {section.description && <p className="text-sm text-[#4A4A47] mt-1 italic">{section.description}</p>}
              </div>
            )}

            {section.fields.map((field) => {
              globalIndex++;
              const hasError = !!validationErrors[field.id];
              return (
                <div 
                  key={field.id} 
                  data-error={hasError}
                  className={`bg-white border rounded-lg p-6 md:p-8 shadow-sm transition-colors ${hasError ? 'border-red-400' : 'border-[#E7E7E4]'}`}
                >
                  <p className="text-[16px] font-medium text-[#1A1A1A] leading-relaxed mb-4">
                    {globalIndex}. {field.question}
                    {field.required && <span className="text-red-500 ml-1 font-bold">*</span>}
                  </p>
                  {renderField(field)}
                  {hasError && (
                    <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {validationErrors[field.id]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Submit */}
        <div className="flex items-center gap-4 mt-8 mb-12">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-3 bg-[#1A1A1A] text-white text-sm font-bold rounded-md hover:bg-[#333] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                제출 중...
              </>
            ) : (
              '제출하기'
            )}
          </button>
          <button
            onClick={() => {
              setAnswers({});
              setValidationErrors({});
            }}
            className="px-6 py-3 text-sm text-[#4A4A47] hover:text-[#1A1A1A] transition-colors"
          >
            양식 지우기
          </button>
        </div>

        {/* Footer */}
        <div className="text-center pb-8">
          <p className="text-[10px] text-[#8C8C88] tracking-widest uppercase">
            EasyForm으로 생성된 설문
          </p>
        </div>
      </div>
    </div>
  );
}
