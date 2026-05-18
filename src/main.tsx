import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import SurveyPage from './components/SurveyPage.tsx';
import './index.css';

function Router() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Match /survey/:id
  const surveyMatch = path.match(/^\/survey\/([a-z0-9]+)$/);
  if (surveyMatch) {
    return <SurveyPage formId={surveyMatch[1]} />;
  }

  // Default: main app
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
