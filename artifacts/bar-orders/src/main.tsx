import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Hardcode the API URL for now
const API_BASE_URL = "https://hi-app-api.onrender.com";

// Monkey patch fetch to use the correct base URL
const originalFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    url = API_BASE_URL + url;
  }
  return originalFetch.call(this, url, options);
};

createRoot(document.getElementById("root")!).render(<App />);
