import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/index.css';

// Last-resort net: module-evaluation errors and unhandled rejections happen
// outside React's tree, so the boundary cannot see them.
window.addEventListener('error', event => {
  document.body.innerHTML =
    '<pre style="padding:24px;color:#ffb3ba;font:13px ui-monospace,monospace;white-space:pre-wrap">' +
    String((event.error && event.error.stack) || event.message) +
    '</pre>';
});

window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  document.body.innerHTML =
    '<pre style="padding:24px;color:#ffb3ba;font:13px ui-monospace,monospace;white-space:pre-wrap">' +
    'Unhandled promise rejection:\n' +
    String((reason && reason.stack) || reason) +
    '</pre>';
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
