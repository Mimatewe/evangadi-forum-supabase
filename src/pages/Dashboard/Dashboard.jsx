/**
 * Dashboard: default home after login; question list, quick actions, URL-driven search.
 * Data: Fetched dynamically from GET http://localhost:3777/api/questions
 *
 * Search behaviour:
 *   • ?q=term      — fetches all questions once, then filters client-side in real-time
 *                    as the user types (title + author name match, case-insensitive)
 *   • ?semantic=…  — hits the vector search endpoint; hides top sections
 *   • no params    — shows all questions
 */
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../../contexts/AuthContext";
import {
  Edit3,
  BookOpen,
  Layers,
  MessageSquare,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { TypeAnimation } from "react-type-animation";
import styles from "./Dashboard.module.css";

// ─── Author resolution ────────────────────────────────────────────────────────
function resolveAuthor(q) {
  const nested = q.author ?? q.user ?? q.postedBy ?? q.createdBy ?? null;

  if (nested) {
    const firstName =
      nested.firstName ??
      nested.first_name ??
      (nested.name ? nested.name.split(" ")[0] : "") ??
      "";
    const lastName =
      nested.lastName ??
      nested.last_name ??
      (nested.name ? nested.name.split(" ").slice(1).join(" ") : "") ??
      "";
    if (firstName || lastName) {
      return { id: nested.id ?? nested.userId ?? null, firstName, lastName };
    }
  }

  const flatFirst =
    q.authorFirstName ?? q.author_first_name ?? q.firstName ?? "";
  const flatLast = q.authorLastName ?? q.author_last_name ?? q.lastName ?? "";
  if (flatFirst || flatLast) {
    return {
      id: q.authorId ?? q.author_id ?? q.userId ?? null,
      firstName: flatFirst,
      lastName: flatLast,
    };
  }

  const fullNameStr =
    q.authorName ?? q.author_name ?? q.postedByName ?? nested?.name ?? "";
  if (fullNameStr) {
    const parts = fullNameStr.trim().split(" ");
    return {
      id: q.authorId ?? q.userId ?? nested?.id ?? null,
      firstName: parts[0] ?? "",
      lastName: parts.slice(1).join(" ") ?? "",
    };
  }

  return null;
}

function normaliseQuestion(q, index) {
  const author = resolveAuthor(q);
  if (!author && index === 0) {
    console.warn(
      "[Dashboard] Could not resolve author. Top-level keys:",
      Object.keys(q),
      "\nFull object:",
      q,
    );
  }
  return { ...q, author: author ?? null };
}

// ─── Client-side fuzzy title + author filter ──────────────────────────────────
/**
 * Returns true when the question matches the search term.
 * Checks: title words, author full name — all case-insensitive.
 * Each word in the query must appear somewhere (AND logic), so
 * "react hook" matches "Using React hooks" but not "react tutorial".
 */
function matchesKeyword(question, term) {
  if (!term) return true;
  const haystack = [
    question.title ?? "",
    question.author?.firstName ?? "",
    question.author?.lastName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return term
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const itemsPerPage = 8;

  // Full list from API — never mutated after fetch
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const firstName = user?.firstName?.trim();
  const welcomeLine = firstName
    ? `Good to see you, ${firstName}.`
    : "Welcome to the forum.";

  // ─── URL param helpers ────────────────────────────────────────────────────
  const activeParams = new URLSearchParams(location.search);
  const isFiltered = activeParams.has("q") || activeParams.has("semantic");
  const isSemanticMode = activeParams.has("semantic");
  const keywordParam = activeParams.get("q") ?? "";
  const currentQueryText = activeParams.get("semantic") || keywordParam;

  // ─── Fetch ────────────────────────────────────────────────────────────────
  // For keyword search we always fetch the full list and filter client-side.
  // For semantic search we hit the dedicated vector endpoint.
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const token = localStorage.getItem("token");

        const semanticQuery = new URLSearchParams(location.search).get(
          "semantic",
        );

        // Only call the vector endpoint for semantic; everything else → base URL
        const targetUrl = semanticQuery
          ? `http://localhost:3777/api/questions/search?query=${encodeURIComponent(semanticQuery)}`
          : "http://localhost:3777/api/questions";

        const response = await axios.get(targetUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        console.log(
          "[Dashboard] raw[0]:",
          response.data?.data?.[0] ?? response.data?.[0] ?? response.data,
        );

        const raw =
          response.data?.data ??
          (Array.isArray(response.data) ? response.data : []);

        setQuestions(raw.map(normaliseQuestion));
      } catch (err) {
        console.error("Failed to fetch questions:", err);
        setError("Unable to find matching threads. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();
    // Keyword (?q=) changes are handled by client-side filtering — no re-fetch needed.
    // Re-fetch only when:
    //   • switching between keyword mode and semantic mode  (isSemanticMode changes)
    //   • the semantic query itself changes                 (semanticQuery changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSemanticMode, isSemanticMode && activeParams.get("semantic")]);

  // ─── Client-side filtered list ────────────────────────────────────────────
  // Recalculated on every keystroke via the URL param — zero API calls.
  const visibleQuestions = useMemo(
    () => questions.filter((q) => matchesKeyword(q, keywordParam)),
    [questions, keywordParam],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(visibleQuestions.length / itemsPerPage),
  );
  const paginatedQuestions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return visibleQuestions.slice(startIndex, startIndex + itemsPerPage);
  }, [visibleQuestions, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [keywordParam, isSemanticMode]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  // Metrics always reflect the visible (filtered) set
  const metrics = {
    questions: visibleQuestions.length,
    replies: visibleQuestions.reduce(
      (acc, q) => acc + Number(q.answerCount || 0),
      0,
    ),
    unanswered: visibleQuestions.filter((q) => Number(q.answerCount || 0) === 0)
      .length,
    yours: visibleQuestions.filter((q) => user?.id === q.author?.id).length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`${styles["dashboard-container"]} font-sans text-gray-800`}>
      {/* Top sections — hidden during AI Search or keyword filtering */}
      {!isSemanticMode && !keywordParam && (
        <>
          <header className={styles["dashboard-header"]}>
            <TypeAnimation
              sequence={[
                `Good to see you, ${firstName}.`,
                2000,
                "Ready to help your cohort today?",
                2000,
              ]}
              speed={50}
              repeat={Infinity}
              className={styles["dashboard-welcome"]}
            />
          </header>

          <section className={styles["quick-actions-grid"]}>
            <div
              className={`${styles["action-card"]} ${styles["cursor-pointer"]}`}
              onClick={() => navigate("/questions/ask")}
            >
              <div
                className={styles["action-icon-wrapper"]}
                style={{ color: "#f97316", backgroundColor: "#fff7ed" }}
              >
                <Edit3 size={18} />
              </div>
              <div
                className={styles["action-details"]}
                onClick={() => navigate("/questions/ask")}
              >
                <h3 className={styles["action-title"]}>New question</h3>
                <p className={styles["action-desc"]}>
                  Share context, errors, and what you already tried
                </p>
              </div>
            </div>

            <div
              className={`${styles["action-card"]} ${styles["cursor-pointer"]}`}
              onClick={() => navigate("/my-questions")}
            >
              <div
                className={styles["action-icon-wrapper"]}
                style={{ color: "#d97706", backgroundColor: "#fef3c7" }}
              >
                <Layers size={18} />
              </div>
              <div className={styles["action-details"]}>
                <h3 className={styles["action-title"]}>Your topics</h3>
                <p className={styles["action-desc"]}>
                  Filtered list of threads you authored
                </p>
              </div>
            </div>

          
            <div
              className={`${styles["action-card"]} ${styles["cursor-pointer"]}`}
              onClick={() => navigate("/rag-documents")}
            >
              <div
                className={styles["action-icon-wrapper"]}
                style={{ color: "#ea580c", backgroundColor: "#fff7ed" }}
              >
                <BookOpen size={18} />
              </div>
              <div className={styles["action-details"]}>
                <h3 className={styles["action-title"]}>Knowledge base</h3>
                <p className={styles["action-desc"]}>
                  Course library, uploads, and retrieval-backed context for
                  threads
                </p>
              </div>
            </div>
          </section>

          <div className={styles["feed-info-bar"]}>
            <p>
              Figures below describe the newest threads in this feed (up to 100
              from the API).
            </p>
          </div>

          <section className={styles["metrics-summary-grid"]}>
            <div className={styles["metric-tile"]}>
              <span className={styles["metric-label"]}>Questions</span>
              <span className={styles["metric-counter"]}>
                {metrics.questions}
              </span>
            </div>
            <div className={styles["metric-tile"]}>
              <span className={styles["metric-label"]}>Replies</span>
              <span className={styles["metric-counter"]}>
                {metrics.replies}
              </span>
            </div>
            <div className={styles["metric-tile"]}>
              <span className={styles["metric-label"]}>Unanswered</span>
              <span className={styles["metric-counter"]}>
                {metrics.unanswered}
              </span>
            </div>
            <div className={styles["metric-tile"]}>
              <span className={styles["metric-label"]}>Yours</span>
              <span className={styles["metric-counter"]}>{metrics.yours}</span>
            </div>
          </section>
        </>
      )}

      {/* Discussion feed — always visible */}
      <section
        className={styles["discussion-feed-panel"]}
        style={isSemanticMode || keywordParam ? { marginTop: 0 } : undefined}
      >
        <header className={styles["feed-panel-header"]}>
          <div className={styles["feed-panel-brand"]}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
            >
              <h2 className={styles["feed-panel-title"]}>Discussion feed</h2>
              {isFiltered && (
                <button
                  onClick={() => navigate("/dashboard")}
                  style={{
                    fontSize: "11px",
                    color: "#f97316",
                    backgroundColor: "#fff7ed",
                    border: "1px solid #ffedd5",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Clear search ×
                </button>
              )}
            </div>
            <p className={styles["feed-panel-subtitle"]}>
              {isFiltered
                ? `Showing results matching "${currentQueryText}"`
                : "Your threads use a slim left accent in this list."}
            </p>
          </div>

          <span
            className={styles["feed-active-badge"]}
            style={{ backgroundColor: isSemanticMode ? "#8b5cf6" : "#f97316" }}
          >
            {isSemanticMode ? "AI Search" : "Newest Threads"}
          </span>
        </header>

        <div className={styles["feed-panel-body"]}>
          {isLoading ? (
            <div className={styles["feed-state-message"]}>
              <Loader2 size={24} className={styles["spinner-icon"]} />
              <p>Fetching cohort updates...</p>
            </div>
          ) : error ? (
            <div
              className={styles["feed-state-message"]}
              style={{ color: "#dc2626" }}
            >
              <p>{error}</p>
            </div>
          ) : visibleQuestions.length === 0 ? (
            <div className={styles["empty-feed-state"]}>
              <p className={styles["empty-state-text"]}>
                {keywordParam
                  ? `No questions match "${keywordParam}".`
                  : "No questions found."}
              </p>
            </div>
          ) : (
            <>
              <div className={styles["active-threads-list"]}>
                {paginatedQuestions.map((question) => {
                  const fInitial = question.author?.firstName?.charAt(0) || "";
                  const lInitial = question.author?.lastName?.charAt(0) || "";
                  const initials = `${fInitial}${lInitial}`.toUpperCase();
                  const fullName =
                    `${question.author?.firstName || ""} ${question.author?.lastName || ""}`.trim();
                  const isUserThread = user?.id === question.author?.id;

                  return (
                    <div
                      key={question.id}
                      className={`${styles["thread-row"]} ${isUserThread ? styles["user-owned-thread"] : ""}`}
                      onClick={() =>
                        navigate(`/questions/${question.questionHash}`)
                      }
                    >
                      <div className={styles["thread-left-layout"]}>
                        <div
                          className={styles["avatar-circle"]}
                          aria-hidden="true"
                        >
                          {initials || "?"}
                        </div>

                        <div className={styles["thread-main-content"]}>
                          <h4 className={styles["thread-row-title"]}>
                            {" "}
                            <p className={styles.threadPreview}>
                              {question.content?.slice(0, 120)}
                              {question.content?.length > 120 && "..."}
                            </p>
                            {question.title}
                          </h4>
                          <div className={styles["thread-meta-row"]}>
                            <div className={styles.authorRow}>
                              <span>{fullName || "Anonymous"}</span>

                              {isUserThread && (
                                <span className={styles.youBadge}>You</span>
                              )}
                            </div>
                            <span className={styles["meta-divider"]}>•</span>
                            <span>
                              {question.createdAt
                                ? new Date(
                                    question.createdAt,
                                  ).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : "Recent"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={styles["thread-stats-badge"]}>
                        <MessageSquare size={16} />
                        <span>{question.answerCount || 0} Replies</span>
                        <ChevronRight
                          size={14}
                          className={styles["row-arrow-icon"]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className={styles.paginationBar}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() =>
                      setCurrentPage((page) => Math.max(1, page - 1))
                    }
                    disabled={currentPage === 1}
                  >
                    Back
                  </button>

                  <div className={styles.paginationNumbers}>
                    {Array.from(
                      { length: totalPages },
                      (_, index) => index + 1,
                    ).map((pageNumber) => (
                      <button
                        key={pageNumber}
                        type="button"
                        className={`${styles.paginationNumber} ${
                          pageNumber === currentPage
                            ? styles.paginationNumberActive
                            : ""
                        }`}
                        onClick={() => setCurrentPage(pageNumber)}
                        aria-current={
                          pageNumber === currentPage ? "page" : undefined
                        }
                      >
                        {pageNumber}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages, page + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
