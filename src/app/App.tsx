import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { Home } from "./Home";

// معرض الحقول للتطوير فقط: لا يدخل نسخة الإنتاج (DECISIONS 2026-10-10)
const FieldsGallery = import.meta.env.DEV ? lazy(() => import("../dev/FieldsGallery")) : null;

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Home />} />
        {FieldsGallery ? (
          <Route
            path="/__fields"
            element={
              <Suspense fallback={null}>
                <FieldsGallery />
              </Suspense>
            }
          />
        ) : null}
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
