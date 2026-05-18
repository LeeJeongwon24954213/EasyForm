export interface FormField {
  id: string;
  type: 'short_text' | 'long_text' | 'multiple_choice' | 'checkbox' | 'dropdown' | 'date';
  question: string;
  options?: string[];
  required: boolean;
  explanation?: string; // Why this question was chosen or simplified
  pageReference?: number; // The page number where this field originated from in the document
}

export interface FormSection {
  title: string;
  description?: string;
  fields: FormField[];
}

export interface GeneratedForm {
  title: string;
  description: string;
  platformStyle: string;
  sections: FormSection[];
}
