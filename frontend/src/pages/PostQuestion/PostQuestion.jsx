import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./PostQuestion.css";
import {
  Bold,
  Italic,
  Code,
  Link2,
  Sparkles,
  Send,
  AlertCircle,
  CheckCircle,
  Lightbulb,
  Check,
  TrendingUp,
} from "lucide-react";

export default function PostQuestion() {
  const navigate = useNavigate();

  // 1. State Management
  const [formData, setFormData] = useState({ title: "", content: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCoaching, setIsCoaching] = useState(false);
  const [coachResponse, setCoachResponse] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");

  // UX Separation: Distinct states for global system errors vs field validation errors
  const [systemError, setSystemError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({ title: "", content: "" });

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    // Clear field errors dynamically as the user types
    if (fieldErrors[id]) {
      setFieldErrors((prev) => ({ ...prev, [id]: "" }));
    }
  };

  const validateForm = () => {
    let errors = { title: "", content: "" };
    let isValid = true;

    if (
      formData.title.trim().length < 5 ||
      formData.title.trim().length > 255
    ) {
      errors.title = "Title must be between 5 and 255 characters long.";
      isValid = false;
    }
    if (formData.content.trim().length < 10) {
      errors.content =
        "Question details must contain a minimum of 10 characters.";
      isValid = false;
    }

    setFieldErrors(errors);
    return isValid;
  };

  // 2. Form Submission (Final Save to DB)
  const handlePublish = async (e) => {
    e.preventDefault();
    setSystemError("");
    setSuccessMessage("");

    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem("token");

      const response = await axios.post(
        "http://localhost:3777/api/questions",
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data.success) {
        setSuccessMessage("Question published successfully!");
        setFormData({ title: "", content: "" });

        const { questionHash } = response.data.data;
        navigate(`/questions/${questionHash}`);
      }
    } catch (error) {
      console.error("Error posting question:", error);
      setSystemError(
        error.response?.data?.message || "Failed to publish your question.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. AI Draft Coach Request Engine
  const handleGetAICoachFeedback = async () => {
    setSystemError("");
    setCoachResponse(null);

    // Local validation stops here inline without forcing page scroll
    if (!validateForm()) return;

    try {
      setIsCoaching(true);
      const token = localStorage.getItem("token");

      const response = await axios.post(
        "http://localhost:3777/api/questions/draft-coach",
        formData,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data?.data) {
        setCoachResponse(response.data.data);
      }
    } catch (error) {
      console.error("AI Draft Coach network failure:", error);
      setSystemError(
        error.response?.data?.message ||
          "The AI Coach could not analyze your draft.",
      );
    } finally {
      setIsCoaching(false);
    }
  };

  return (
    <div className="w-full font-sans text-gray-800">
      {/* Global Server Alerts (Handles network/server drops) */}
      {systemError && (
        <div className="mb-6 p-4 border border-red-200 bg-red-50 rounded-lg flex items-start space-x-2 text-sm text-red-700 animate-fade-in">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <span>{systemError}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 border border-green-200 bg-green-50 rounded-lg flex items-start space-x-2 text-sm text-green-700">
          <CheckCircle size={18} className="mt-0.5 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Header Section */}
      <section className="publish-header-section">
        <p className="publish-tag">ASK THE COHORT</p>
        <h3 className="publish-title">PUBLISH TO THE FORUM</h3>
        <p className="publish-description">
          Public threads help the whole cohort. Write as if a classmate will
          debug your issue tomorrow. They only know what you put on the page.
        </p>
      </section>

      {/* 📋 RESTORATION DETECTED: Guidelines & Checklists completely re-integrated */}
      {/* Guidelines Section */}
      <section className="guidelines-section">
        {/* Unified Card Container */}
        <div className="guidelines-split-card">
          <header className="guidelines-card-header">
            <h2 className="guidelines-title">
              Write questions people can answer in one pass
            </h2>
            <p className="guidelines-subtitle">
              Mentors volunteer their time. Give them runnable context, expected
              vs actual behavior, and a tight scope so they can reproduce the
              issue without guessing your setup.
            </p>
          </header>

          {/* Split Content Columns */}
          <div className="guidelines-split-body">
            {/* Left Column: Checklist */}
            <div className="guidelines-block">
              <h3 className="guidelines-heading">Checklist before you post</h3>
              <ul className="guidelines-list">
                <li>
                  <strong>Title as a headline</strong> that states the symptom
                  and tech stack (e.g., "React 19: state resets after
                  navigation").
                </li>
                <li>
                  <strong>Repro steps</strong> numbered, with environment (OS,
                  browser, Node version) when it matters.
                </li>
                <li>
                  <strong>Minimal code</strong> in fenced markdown blocks; trim
                  unrelated lines so readers scan faster.
                </li>
                <li>
                  <strong>Exact errors</strong> copied verbatim, including stack
                  trace snippets when debugging backend routes.
                </li>
              </ul>
            </div>

            {/* Right Column: Validation Rules */}
            <div className="guidelines-block">
              <h3 className="guidelines-heading">
                Validation rules (enforced by the form)
              </h3>
              <ul className="guidelines-list">
                <li>
                  <strong>Title length:</strong> Must be between 5 and 255
                  characters.
                </li>
                <li>
                  <strong>Body length:</strong> Must contain a minimum of 10
                  characters detailing your problem.
                </li>
                <li>
                  <strong>Single topic:</strong> Split unrelated bugs into
                  separate threads so search and embeddings stay precise.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Form Submission Entry System */}
      <main className="publish-form">
        <form onSubmit={handlePublish} className="publish-form-inner">
          {/* Title with Inline Context Errors */}
          <div className="form-group">
            <label htmlFor="title" className="form-label">
              Title
            </label>
            <small className="text-muted">
              Be specific and imagine you're asking a question to another person
            </small>
            <input
              type="text"
              id="title"
              value={formData.title}
              onChange={handleInputChange}
              disabled={isSubmitting || isCoaching}
              placeholder="e.g. How do I handle state management using Context API in React?"
              className={`form-input ${fieldErrors.title ? "input-field-error" : ""}`}
            />
            {fieldErrors.title && (
              <span className="inline-error-msg">
                <AlertCircle size={12} /> {fieldErrors.title}
              </span>
            )}
          </div>

          {/* Content with Inline Context Errors */}
          <div className="form-group">
            <label htmlFor="content" className="form-label">
              What are the details of your problem?
            </label>
            <small className="text-muted">
              Introduce the problem and expand on what you put in the title.
              Minimum 10 characters
            </small>
            <div
              className={`editor-box ${fieldErrors.content ? "input-field-error" : ""}`}
            >
              <div className="editor-toolbar">
                <div className="editor-tools">
                  <Bold size={14} />
                  <Italic size={14} />
                  <Code size={14} />
                  <Link2 size={14} />
                </div>
                <span className="char-count">
                  {formData.content.length} characters
                </span>
              </div>

              <textarea
                id="content"
                rows={8}
                value={formData.content}
                onChange={handleInputChange}
                disabled={isSubmitting || isCoaching}
                placeholder="Provide code snippets or terminal logs here..."
                className="form-textarea"
              />
            </div>
            {fieldErrors.content && (
              <span className="inline-error-msg">
                <AlertCircle size={12} /> {fieldErrors.content}
              </span>
            )}
          </div>

          {/* AI Action */}
          <div className="ai-actions">
            <button
              type="button"
              onClick={handleGetAICoachFeedback}
              disabled={isSubmitting || isCoaching}
              className="ai-button"
            >
              <Sparkles
                size={13}
                className={isCoaching ? "spin-animation" : ""}
              />
              <span>
                {isCoaching ? "Coaching Draft..." : "Get AI Feedback"}
              </span>
            </button>
            <p className="ai-note">
              Suggestions only. Review your draft before final submission.
            </p>
          </div>

          {/* Premium Modern AI Card Rendered Directly Below Action Row */}
          {coachResponse && (
            <div className="coach-card animate-fade-in">
              <header className="coach-card-header">
                <div className="coach-brand">
                  <div className="coach-avatar-glow">
                    <Sparkles size={15} />
                  </div>
                  <div>
                    <h3 className="coach-card-title">AI Draft Coach</h3>
                    <p className="coach-card-subtitle">
                      Real-time Quality Index
                    </p>

                    {/* this one div is added separately */}

                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`strength-badge ${coachResponse.strength}`}
                      >
                        {coachResponse.strength?.toUpperCase()}
                      </span>

                      <span className="score-badge">
                        {coachResponse.score}/100
                      </span>
                    </div>


                  </div>
                </div>
                <div className="coach-badge">Optimization Engine Active</div>
              </header>

              <div className="coach-card-body">
                {/* Friction Points Section */}
                {coachResponse.feedback &&
                  coachResponse.feedback.length > 0 && (
                    <div className="coach-data-column">
                      <h4 className="column-heading text-amber-700">
                        <Lightbulb size={14} />
                        <span>Friction Points Detected</span>
                      </h4>
                      <ul className="coach-list">
                        {coachResponse.feedback.map((item, idx) => (
                          <li
                            key={idx}
                            className="coach-item bg-amber-50/30 text-amber-900 border-amber-100/50"
                          >
                            <span className="bullet-indicator bg-amber-400" />
                            <p>{item}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {/* Recommendations Section */}
                {coachResponse.suggestions &&
                  coachResponse.suggestions.length > 0 && (
                    <div className="coach-data-column">
                      <h4 className="column-heading text-emerald-700">
                        <TrendingUp size={14} />
                        <span>Recommended Formulations</span>
                      </h4>
                      <ul className="coach-list">
                        {coachResponse.suggestions.map((item, idx) => {
                          const cleanItem = item.replace(
                            /^\*\*(.*?)\*\*:/g,
                            "$1 —",
                          );
                          return (
                            <li
                              key={idx}
                              className="coach-item bg-emerald-50/40 text-emerald-900 border-emerald-100/50"
                            >
                              <div className="bullet-success">
                                <Check size={10} />
                              </div>
                              <p>{cleanItem}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          )}

          <hr className="form-divider" />

          {/* Footer Actions */}
          <div className="form-footer">
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              disabled={isSubmitting || isCoaching}
              className="btn-cancel"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting || isCoaching}
              className="btn-primary"
            >
              <span>{isSubmitting ? "Posting..." : "Post Question"}</span>
              {!isSubmitting && <Send size={12} />}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
