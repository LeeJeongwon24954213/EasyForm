import { GoogleGenAI, Type, Schema } from '@google/genai';
import { GeneratedForm } from '../types';

// Initialize the Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const formSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "The title of the generated form." },
    description: { type: Type.STRING, description: "A brief, user-friendly description of the form's purpose." },
    platformStyle: { type: Type.STRING, description: "The style guidelines applied (e.g., Google Forms, Naver Office)." },
    sections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Title of the logic section" },
          description: { type: Type.STRING, description: "Optional description for the section" },
          fields: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING, description: "A unique identifier for the field (e.g., field_1)" },
                type: { 
                    type: Type.STRING, 
                    enum: ['short_text', 'long_text', 'multiple_choice', 'checkbox', 'dropdown', 'date'],
                    description: "The input field type."
                },
                question: { type: Type.STRING, description: "The UX-optimized, user-friendly question." },
                options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "Options for multiple_choice, checkbox, or dropdown types."
                },
                required: { type: Type.BOOLEAN, description: "Whether this field is mandatory." },
                explanation: { type: Type.STRING, description: "Brief explanation of how the original text was transformed for better UX." },
                pageReference: { type: Type.INTEGER, description: "The page number (e.g. 1) where this field originated from in the parsed document text." }
              },
              required: ["id", "type", "question", "required"]
            }
          }
        },
        required: ["title", "fields"]
      }
    }
  },
  required: ["title", "description", "platformStyle", "sections"]
};

export async function generateFormDesign(rawText: string, platform: string): Promise<GeneratedForm> {
  const systemInstruction = `너는 복잡한 문서(PDF, HWP 등)를 분석하여 사용자가 가장 입력하기 편한 형태의 '디지털 폼(Digital Form)'으로 재설계하는 **UX/UI 폼 기획 전문가**야.

# Objective
제공된 텍스트 데이터에서 사용자가 작성해야 할 항목(질문, 빈칸, 체크박스 등)을 정확히 추출하고, 이를 선택된 플랫폼 스타일("${platform}")의 인터페이스 가이드라인에 맞춰 최적화된 질문지로 변환한다.

# Instructions
1. **데이터 추출:** 문서 내의 성명, 소속, 학과, 학번, 날짜, 서명, 의견 작성란 등 사용자의 입력이 필요한 **모든 요소**를 단 하나도 누락 없이 식별하라.
2. **UX 최적화:** 
   - 딱딱한 행정 용어("성명", "주민번호")를 부드러운 대화형("이름을 입력해주세요", "주민등록번호 13자리를 입력해주세요")으로 변경하라.
   - 문서 여러 곳에 동일한 항목(예: 성명, 서명)이 중복해서 들어가야 한다면, 폼 질문은 사용자 편의를 위해 **단 1개만** 만들고 나중에 문서 전체에 자동 복사되도록 해라.
3. **구조화:** 연관된 질문들(예: 개인정보, 설문응답)을 논리적인 섹션(sections)으로 묶어라.
4. **스타일 적용:** 유저가 선택한 폼 형식(${platform})의 시그니처 레이아웃 특징을 반영하여 응답한다.

6. **페이지 추적 (Page Reference):** 제공된 문서 텍스트에 \`--- [PAGE X] ---\` 와 같이 페이지 번호가 포함되어 있는 경우, 해당 텍스트를 바탕으로 만들어진 항목에 반드시 \`pageReference: X\` (숫자만) 을 추가하여 사용자가 나중에 원본 문서를 쉽게 찾아볼 수 있도록 하라.

# Constraints
- 결과물은 제공된 JSON Schema를 엄격하게 따르는 프론트엔드에서 렌더링하기 쉬운 구조여야 한다.
- 원문의 의미를 훼손하지 않되, 사용자 친화적인 톤앤매너를 유지하라.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro', // Using a strong reasoning model
    contents: [
        { role: 'user', parts: [{ text: `Extract and design a form from this raw document text:\n\n${rawText}` }] }
    ],
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: formSchema,
      temperature: 0.2, // Keep it slightly deterministic for structured output
    }
  });

  if (!response.text) {
      throw new Error("Failed to generate form data.");
  }

  return JSON.parse(response.text) as GeneratedForm;
}

export async function fillDocument(rawText: string, form: GeneratedForm, answers: Record<string, any>): Promise<string> {
  const systemInstruction = `너는 원본 문서(PDF/HWP에서 추출된 텍스트)의 빈칸과 질문란에 사용자가 응답한 내용을 알맞게 채워넣는 텍스트 복원 전문가야.

# Objective
주어진 '원본 텍스트'와 '폼 설정(질문들)', 그리고 '사용자 응답 데이터(answers)'를 바탕으로, 원본 텍스트의 빈칸이나 질문 위치에 사용자의 응답을 채워 넣은 '완성된 마크다운 문서'를 생성하라.

# Instructions
1. 원본 텍스트의 흐름을 최대한 유지하라.
2. 사용자의 응답 데이터(JSON)를 확인하여, 해당 질문이 원문 어디에 해당하는지 파악하라 (form.sections.fields 참조).
3. 원문의 (     ) 같은 빈칸이나 밑줄(____), 혹은 질문 뒤에 사용자의 응답을 자연스럽게 삽입하라.
4. 체크박스나 다중 선택의 경우 사용자가 선택한 값만 명시하거나, 기존 선택지에 [X] 나 (O) 같은 기호로 표시하라.
5. 문서의 전체적인 마크다운 포맷(제목, 목록 등)을 보기 좋게 유지하라.
6. 원문의 페이지 번호나 불필요한 메타데이터(\`--- [PAGE X] ---\`)는 제거하고 자연스러운 하나의 문서로 만들어라.

최종 결과물은 텍스트(Markdown) 형태여야 한다.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [
        { role: 'user', parts: [{ text: `[원본 텍스트]\n${rawText}\n\n[폼 구조]\n${JSON.stringify(form, null, 2)}\n\n[사용자 응답]\n${JSON.stringify(answers, null, 2)}\n\n위 데이터를 바탕으로 응답이 모두 채워진 완성된 문서를 마크다운 형식으로 작성해줘.` }] }
    ],
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.3,
    }
  });

  if (!response.text) {
      throw new Error("Failed to generate filled document.");
  }

  return response.text;
}

export async function analyzeFieldCoordinates(imageBase64: string, fields: {id: string, question: string}[]): Promise<Record<string, {x: number, y: number}[]>> {
  const systemInstruction = `너는 폼 문서의 구조를 분석하여 답변이 들어갈 정확한 위치(좌표)를 찾아내는 시각 분석 전문가야.
# Objective
주어진 문서 이미지와 질문 리스트를 바탕으로, 각 질문에 대한 답변이 작성되어야 할 빈칸(밑줄, 박스 등)의 '좌측 중앙(Left-Middle)' 좌표(x, y)를 찾아내라.

# Instructions
1. 좌표는 이미지의 좌측 상단을 (0, 0), 우측 하단을 (1, 1)로 하는 백분율(비율) 값으로 반환하라.
2. 각 질문 텍스트 근처에 있는 빈칸, 밑줄(____), 괄호(   ), 빈 박스 등을 찾아라.
   - 좌우(x) 기준: 박스/밑줄의 가장 왼쪽 끝부분 (글씨가 시작될 좌측 정렬 위치)
   - 상하(y) 기준: 박스/밑줄의 상하 정중앙 위치
3. 만약 하나의 질문(예: 이름, 서명)이 이 페이지 내의 **여러 곳**에 작성되어야 한다면, 해당 빈칸들의 모든 좌표를 찾아 배열에 넣어라. 빈칸이 없으면 빈 배열을 반환하라.
4. 반드시 제공된 JSON 구조로만 응답하라.

# Output Format
{
  "field_1": [ { "x": 0.25, "y": 0.15 } ],
  "field_2": [ { "x": 0.80, "y": 0.40 }, { "x": 0.80, "y": 0.90 } ]
}`;

  const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: [
        { 
          role: 'user', 
          parts: [
            { text: `다음 필드들에 대한 답변 입력 좌표를 찾아주세요:\n${JSON.stringify(fields, null, 2)}` },
            { inlineData: { data: base64Data, mimeType: 'image/png' } }
          ] 
        }
    ],
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  });

  if (!response.text) {
      throw new Error("Failed to analyze coordinates.");
  }

  return JSON.parse(response.text);
}
