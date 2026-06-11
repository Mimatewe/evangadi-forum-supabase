/**
 * Route map: public pages live outside `Layout`; forum tools use `Layout` + `ProtectedRoute`.
 * Add new `<Route>` entries here, then wire navigation in `Sidebar.jsx` and
 * `Layout.jsx` (`getTitle` / `getSubtitle`) so the shell stays in sync.
 */
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout/Layout";
import ProtectedRoute from "./components/ProtectedRoute/ProtectedRoute";
import Auth from "./pages/Auth/Auth";
import Dashboard from "./pages/Dashboard/Dashboard";
import Landing from "./pages/Landing/Landing";
import PostQuestion from "./pages/PostQuestion/PostQuestion.jsx";
import QuestionDetail from "./pages/QuestionDetail/QuestionDetail";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
                  <h1>My Questions Page</h1>
                </ProtectedRoute>
              }
            />

            <Route
              path="/rag-documents"
              element={
                <ProtectedRoute>
                  <h1>RAG Documents Page</h1>
                </ProtectedRoute>
              }
            />
          </Route>

          {/* ── Catch-all ────────────────────────────────────────────────── */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
