import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { LoginPage } from "../features/auth/ui/LoginPage";
import { FirstLoginPage } from "../features/auth/ui/FirstLoginPage";
import { SessionProvider, useSession } from "../features/auth/session/SessionProvider";
import { isManager } from "../features/users/core/users";
import { UsersPage } from "../features/users/ui/UsersPage";
import { AssignPage } from "../features/users/ui/AssignPage";
import { DashboardPage } from "../features/ledger/ui/DashboardPage";
import { StatementPage } from "../features/ledger/ui/StatementPage";
import { InvoicesPage } from "../features/ledger/ui/InvoicesPage";
import { JournalsPage } from "../features/ledger/ui/JournalsPage";
import { AddEntryPage } from "../features/ledger/ui/AddEntryPage";
import { QuickEntryPage } from "../features/ledger/ui/QuickEntryPage";
import { ReviewPage } from "../features/ledger/ui/ReviewPage";
import { LockPage } from "../features/ledger/ui/LockPage";
import { AppShell } from "./AppShell";
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

function OwnerOnly(p: { children: ReactNode }) {
  const { state } = useSession();
  if (state.status !== "signedIn" || state.profile.role !== "owner") return <Navigate to="/" replace />;
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
                { index: true, element: <DashboardPage /> },
                { path: "statement/:sid?", element: <StatementPage /> },
                { path: "invoices/:sid?", element: <InvoicesPage /> },
                { path: "journals/:sid?", element: <JournalsPage /> },
                { path: "add/:sid?", element: <AddEntryPage /> },
                { path: "quick/:sid?", element: <QuickEntryPage /> },
                {
                  path: "review",
                  element: (
                    <ManagersOnly>
                      <ReviewPage />
                    </ManagersOnly>
                  ),
                },
                {
                  path: "lock",
                  element: (
                    <OwnerOnly>
                      <LockPage />
                    </OwnerOnly>
                  ),
                },
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
