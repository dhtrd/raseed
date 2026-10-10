import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./shared/design/global.css";

// GitHub Pages لا يدعم ترويسة frame-ancestors: نمنع عرض النظام داخل إطار موقع آخر (clickjacking).
if (window.top !== window.self) {
  document.documentElement.textContent = "";
  throw new Error("رصيد لا يعمل داخل إطار.");
}

const root = document.getElementById("root");
if (!root) throw new Error("عنصر #root غير موجود في index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
