import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { LoginPage } from "../features/auth/ui/LoginPage";
import { FirstLoginPage } from "../features/auth/ui/FirstLoginPage";
import { SessionProvider, useSession } from "../features/auth/session/SessionProvider";
import { isManager } from "../features/users/core/users";
import { UsersPage } from "../features/users/ui/UsersPage";
import { AssignPage } from "../features/users/ui/AssignPage";
import { AppShell } from "./AppShell";
import { Home } from "./Home";
import { ErrorScreen, LoadingScreen, RouteError } from "./Screens";

// معرض الحقول للتطوير فقط: لا يدخل نسخة الإنتاج (DECISIONS 2026-10-10)
const FieldsGallery = import.meta.env.DEV ? lazy(() => import("../dev/FieldsGallery")) : null;

/** لا شاشة قبل الدخول، ولا شاشة قبل تغيير الكلمة المؤقتة (DECISIONS 2026-10-10). */
function RequireSession() {
  const { state, endSession } = useSession();
  if (state.status === "configError")
    return (
      <ErrorScreen title="إعدادات Firebase ناقصة" body={`المتغيرات الناقصة: ${state.missing.join("، ")}`} />
    );
  if (state.status === "error")
    return (
      <ErrorScreen
        title="تعذّر فتح حسابك"
        body={state.message}
        action={{ label: "خروج", run: () => void endSession() }}
      />
    );
  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "signedOut") return <Navigate to="/login" replace />;
  if (state.profile.mustChangePassword) return <Navigate to="/first-login" replace />;
  return <Outlet />;
}

function ManagersOnly(p: { children: ReactNode }) {
  const { state } = useSession();
  if (state.status !== "signedIn" || !isManager(state.profile.role)) return <Navigate to="/" replace />;
  return p.children;
}

function PublicOnly(p: { children: ReactNode }) {
  const { state } = useSession();
  if (state.status === "configError")
    return (
      <ErrorScreen title="إعدادات Firebase ناقصة" body={`المتغيرات الناقصة: ${state.missing.join("، ")}`} />
    );
  return p.children;
}

const router = createBrowserRouter(
  [
    {
      errorElement: <RouteError />,
      children: [
        {
          path: "/login",
          element: (
            <PublicOnly>
              <LoginPage />
            </PublicOnly>
          ),
        },
        { path: "/first-login", element: <FirstLoginPage /> },
        ...(FieldsGallery
          ? [
              {
                path: "/__fields",
                element: (
                  <Suspense fallback={null}>
                    <FieldsGallery />
                  </Suspense>
                ),
              },
            ]
          : []),
        {
          element: <RequireSession />,
          children: [
            {
              element: <AppShell />,
              children: [
                { index: true, element: <Home /> },
                {
                  path: "users/:uid?",
                  element: (
                    <ManagersOnly>
                      <UsersPage />
                    </ManagersOnly>
                  ),
                },
                {
                  path: "assign/:uid?",
                  element: (
                    <ManagersOnly>
                      <AssignPage />
                    </ManagersOnly>
                  ),
                },
              ],
            },
          ],
        },
        { path: "*", element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/" },
);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
