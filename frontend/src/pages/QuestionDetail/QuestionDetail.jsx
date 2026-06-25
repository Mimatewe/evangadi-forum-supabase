/**
 * QuestionDetail.jsx
 * Fetches from GET /api/questions/:questionHash
 * Response shape: { success, message, question: { id, questionHash, title, content,
 * createdAt, updatedAt, userId, firstName, lastName, answerCount, answers: [...] } }
 */
import React, { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  Share2,
  MessageSquare,
  Clock,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import styles from "./QuestionDetail.module.css";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(firstName, lastName) {
  return (
    `${firstName?.charAt(0) ?? ""}${lastName?.charAt(0) ?? ""}`.toUpperCase() ||
    "?"
  );
}

function formatDate(iso) {
  if (!iso) return "Recent";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Avatar({ firstName, lastName, size = "md" }) {
  return (
    <div className={`${styles.avatar} ${styles[`avatar--${size}`]}`}>
      {getInitials(firstName, lastName)}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function QuestionDetail() {
  const navigate = useNavigate();
  const { questionHash } = useParams();
  const { user } = useAuth();

  const [question, setQuestion] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [fitResult, setFitResult] = useState(null); // { level, note }
  const [isChecking, setIsChecking] = useState(false);
  const canPostAnswer = fitResult?.level === "strong";
  const [relatedQuestions, setRelatedQuestions] = useState([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  useEffect(() => {
    const fetchQuestion = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const token = localStorage.getItem("token");

        const { data } = await axios.get(
          `http://localhost:3777/api/questions/${questionHash}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        setQuestion(data.question);
        setAnswers(data.question?.answers ?? []);
      } catch (err) {
        console.error("Failed to load question:", err);
        setError("Could not load this question. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };

    if (questionHash) fetchQuestion();
  }, [questionHash]);
useEffect(() => {
  const fetchRelated = async () => {
    try {
      setRelatedLoading(true);
      const token = localStorage.getItem("token");
      const { data } = await axios.get(
        `http://localhost:3777/api/questions/${questionHash}/similar`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRelatedQuestions(data.data ?? []);
    } catch (err) {
      console.error("Failed to load related questions:", err);
      setRelatedQuestions([]);
    } finally {
      setRelatedLoading(false);
    }
  };

  if (questionHash) fetchRelated();
}, [questionHash]);

  const handlePostAnswer = async () => {
    if (answerText.trim().length < 20) return;
    try {
      setIsPosting(true);
      setPostError(null);
      const token = localStorage.getItem("token");
      const { data } = await axios.post(
        `http://localhost:3777/api/answers`,
        {
          questionId: question.id,
          content: answerText.trim(),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const newAnswer = data.answer ?? data.data;
      if (newAnswer) {
        setAnswers((prev) => [...prev, newAnswer]);
        setQuestion((prev) => ({
          ...prev,
          answerCount: (prev.answerCount ?? 0) + 1,
        }));
      }
      setAnswerText("");
    } catch (err) {
      console.error("Failed to post answer:", err);
      setPostError("Failed to post your answer. Please try again.");
    } finally {
      setIsPosting(false);
    }
  };

  const handleCheckFit = async () => {
    if (answerText.trim().length < 20) return;
    try {
      setIsChecking(true);
      setFitResult(null);
      const token = localStorage.getItem("token");
      const { data } = await axios.post(
        `http://localhost:3777/api/questions/${questionHash}/answer-fit`,
        { answerText: answerText.trim() },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      // API returns: { success, message, data: { level, note } }
      setFitResult(data.data);
    } catch (err) {
      console.error("Failed to check draft fit:", err);
      setFitResult({
        level: "error",
        note: "Could not assess your answer. Try again.",
      });
    } finally {
      setIsChecking(false);
    }
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={styles.stateWrapper}>
        <Loader2 size={24} className={styles.spinner} />
        <p>Loading question...</p>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error || !question) {
    return (
      <div className={styles.stateWrapper}>
        <p className={styles.errorText}>{error ?? "Question not found."}</p>
        <button
          className={styles.backLink}
          onClick={() => navigate("/dashboard")}
        >
          <ArrowLeft size={14} /> Back to feed
        </button>
      </div>
    );
  }

  const fullName =
    `${question.firstName ?? ""} ${question.lastName ?? ""}`.trim();
  const isOwner = user?.id === question.userId;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      {/* Back link */}
      <button
        className={styles.backLink}
        onClick={() => navigate("/dashboard")}
      >
        <ArrowLeft size={14} />
        Back to feed
      </button>

      <div className={styles.layout}>
        {/* ── Main column ────────────────────────────────────────────────── */}
        <main className={styles.main}>
          {/* Question card */}
          <div className={styles.questionCard}>
            <div className={styles.authorRow}>
              <Avatar
                firstName={question.firstName}
                lastName={question.lastName}
              />
              <div className={styles.authorMeta}>
                <span className={styles.authorName}>
                  {fullName || "Anonymous"}
                </span>
                <span className={styles.postedAt}>
                  <Clock size={11} />
                  Posted {formatDate(question.createdAt)}
                </span>
              </div>
            </div>

            <h1 className={styles.questionTitle}>{question.title}</h1>

            <div className={styles.section}>
              <h3 className={styles.sectionHeading}>Question</h3>
              <p className={styles.sectionText}>{question.content}</p>
            </div>

            <div className={styles.actionRow}>
              <button className={styles.actionBtn}>
                <Share2 size={14} />
                Share
              </button>
              <span className={styles.answerCount}>
                <MessageSquare size={14} />
                {question.answerCount}{" "}
                {question.answerCount === 1 ? "Answer" : "Answers"}
              </span>
            </div>
          </div>

          {/* Community Answers */}
          <div className={styles.answersSection}>
            <h2 className={styles.answersHeading}>
              Community Answers ({answers.length})
            </h2>

            {answers.length === 0 ? (
              <div className={styles.emptyAnswers}>
                <p>No answers yet. Be the first to help!</p>
              </div>
            ) : (
              answers.map((answer) => {
                const answerName =
                  `${answer.firstName ?? ""} ${answer.lastName ?? ""}`.trim();
                return (
                  <div key={answer.id} className={styles.answerCard}>
                    <div className={styles.authorRow}>
                      <Avatar
                        firstName={answer.firstName}
                        lastName={answer.lastName}
                        size="sm"
                      />
                      <div className={styles.authorMeta}>
                        <span className={styles.authorName}>
                          {answerName || "Anonymous"}
                        </span>
                        <span className={styles.postedAt}>
                          <Clock size={11} />
                          {formatDate(answer.createdAt)}
                        </span>
                      </div>
                      <CheckCircle2
                        size={16}
                        className={styles.answeredBadge}
                      />
                    </div>
                    <p className={styles.answerPara}>{answer.content}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Contribute an answer — hidden for question owner */}
          {!isOwner && (
            <div className={styles.contributeCard}>
              <h2 className={styles.contributeHeading}>Contribute an answer</h2>

              <div className={styles.editorToolbar}>
                <button
                  type="button"
                  className={styles.toolbarBtn}
                  title="Bold"
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className={styles.toolbarBtn}
                  title="Italic"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className={styles.toolbarBtn}
                  title="Code"
                >
                  {"</>"}
                </button>
                <button
                  type="button"
                  className={styles.toolbarBtn}
                  title="Link"
                >
                  {"∞"}
                </button>
                <span className={styles.charCount}>
                  {answerText.length} characters
                </span>
              </div>

              <textarea
                className={styles.answerTextarea}
                placeholder="Write your answer here..."
                value={answerText}
                onChange={(e) => {
                  setAnswerText(e.target.value);
                  setFitResult(null);
                }}
                rows={6}
              />

              {/* AI fit result banner */}
              {fitResult && (
                <div
                  className={`${styles.fitBanner} ${styles[`fitBanner--${fitResult.level}`]}`}
                >
                  <span className={styles.fitLevel}>
                    {fitResult.level === "strong" && "✦ Strong fit"}
                    {fitResult.level === "partial" && "◑ Partial fit"}
                    {fitResult.level === "weak" && "○ Weak fit"}
                    {fitResult.level === "error" && "⚠ Error"}
                  </span>
                  <span className={styles.fitNote}>{fitResult.note}</span>
                </div>
              )}

              <div className={styles.contributeFooter}>
                <button
                  type="button"
                  className={styles.checkDraftBtn}
                  onClick={handleCheckFit}
                  disabled={isChecking || answerText.trim().length < 20}
                >
                  {isChecking ? "Checking…" : "✦ Check draft fit"}
                </button>
                <span className={styles.draftHint}>
                  Relevance only. Not grading correctness. You need at least 20
                  characters.
                </span>
                {postError && (
                  <span className={styles.postError}>{postError}</span>
                )}
                {canPostAnswer ? (
                  <button
                    type="button"
                    className={styles.postingBtn}
                    onClick={handlePostAnswer}
                    disabled={isPosting || answerText.trim().length < 20}
                  >
                    {isPosting ? "Posting…" : "Post Answer"}
                  </button>
                ) : (
                  <span className={styles.postGateHint}>
                    Post Answer appears only after a strong-fit check.
                  </span>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className={styles.sidebar}>
          <h3 className={styles.sidebarHeading}>Related Questions</h3>
          {relatedLoading ? (
            <p className={styles.emptyRelated}>Loading…</p>
          ) : relatedQuestions.length === 0 ? (
            <p className={styles.emptyRelated}>No related questions found.</p>
          ) : (
            <ul className={styles.relatedList}>
              {relatedQuestions.map((rq) => (
                <li key={rq.id ?? rq.questionId} className={styles.relatedItem}>
                  <button
                    type="button"
                    className={styles.relatedTitle}
                    onClick={() => navigate(`/questions/${rq.questionHash}`)}
                  >
                    {rq.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
