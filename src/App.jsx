/**
 * Route map: public pages live outside `Layout`; forum tools use `Layout` + `ProtectedRoute`.
 * Add new `<Route>` entries here, then wire navigation in `Sidebar.jsx` and
 * `Layout.jsx` (`getTitle` / `getSubtitle`) so the shell stays in sync.
 */
import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout/Layout";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";

// ── Lazy-loaded pages ────────────────────────────────────────────────────────
const Auth = lazy(() => import("./pages/Auth/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const Landing = lazy(() => import("./pages/Landing/Landing"));
const PostQuestion = lazy(() => import("./pages/PostQuestion/PostQuestion.jsx"));
const QuestionDetail = lazy(() => import("./pages/QuestionDetail/QuestionDetail"));
const MyQuestions = lazy(() => import("./pages/MyQuestions/MyQuestions"));
const RagDocuments = lazy(() => import("./components/RagAnswerBody/RagAnswerBody.jsx"));
const MyAnswers = lazy(() => import("./pages/MyAnswers/MyAnswers.jsx"));

// Loading fallback component
const PageLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-gray-50/50">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ── Public routes ───────────────────────────────────────────── */}
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />

            {/* ── Protected routes (all share the Layout shell) ────────────── */}
            <Route element={<Layout />}>
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/questions/ask"
                element={
                  <ProtectedRoute>
                    <PostQuestion />
                  </ProtectedRoute>
                }
              />

              {/* Single question view — wired to QuestionDetail.jsx */}
              <Route
                path="/questions/:questionHash"
                element={
                  <ProtectedRoute>
                    <QuestionDetail />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/my-questions"
                element={
                  <ProtectedRoute>
                    <MyQuestions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-answers"
                element={
                  <ProtectedRoute>
                    <MyAnswers />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/rag-documents"
                element={
                  <ProtectedRoute>
                    <RagDocuments />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* ── Catch-all ────────────────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
