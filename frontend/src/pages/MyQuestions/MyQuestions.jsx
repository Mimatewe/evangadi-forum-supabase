import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../services/core/api.client";
import styles from "./MyQuestions.module.css";

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

function resolveAuthor(question) {
  const author = question.author ?? {};
  return {
    firstName: author.firstName ?? question.firstName ?? "",
    lastName: author.lastName ?? question.lastName ?? "",
  };
}

export default function MyQuestions() {
  const [myQuestions, setMyQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const navigate = useNavigate();
  const itemsPerPage = 7;

  useEffect(() => {
    fetchMyQuestions(currentPage);
  }, [currentPage]);

  const fetchMyQuestions = async (page) => {
    try {
      setIsLoading(true);

      const offset = (page - 1) * itemsPerPage;
      const response = await apiClient.get("/api/questions", {
        params: { mine: true, limit: itemsPerPage, offset },
      });

      setMyQuestions(
        Array.isArray(response.data?.data) ? response.data.data : [],
      );
      setTotalCount(response.data?.meta?.total || 0);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch questions.");
    } finally {
      setIsLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  if (isLoading) {
    return (
      <div className={styles.stateCard}>
        <p>Loading your questions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.stateCard}>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  if (myQuestions.length === 0) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.headerCard}>
          <p className={styles.eyebrow}>Your workspace</p>
          <h1 className={styles.pageTitle}>Your topics</h1>
          <p className={styles.pageDescription}>
            Only questions you created appear here.
          </p>
        </div>

        <div className={styles.stateCard}>
          <h2 className={styles.emptyTitle}>No Questions Yet</h2>
          <p>You haven't asked any questions yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageShell}>
      <div className={styles.headerCard}>
        <p className={styles.eyebrow}>Your workspace</p>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>Your topics</h1>
            <p className={styles.pageDescription}>
              Only questions you created. Open one to read answers or add
              follow-ups.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.listCard}>
        {myQuestions.map((question) => {
          const author = resolveAuthor(question);
          const fullName = `${author.firstName} ${author.lastName}`.trim();

          return (
            <button
              key={question.questionHash}
              type="button"
              className={styles.questionRow}
              onClick={() => navigate(`/questions/${question.questionHash}`)}
            >
              <div className={styles.profileAvatar} aria-hidden="true">
                {getInitials(author.firstName, author.lastName)}
              </div>

              <div className={styles.questionContent}>
                <div className={styles.questionTopLine}>
                  <div className={styles.profileMeta}>
                    <span className={styles.profileName}>
                      {fullName || "Anonymous"}
                    </span>
                    <span className={styles.profileRole}>Learner</span>
                  </div>
                  <span className={styles.questionDate}>
                    {formatDate(question.createdAt)}
                  </span>
                </div>

                <h3 className={styles.questionTitle}>{question.title}</h3>

                <p className={styles.questionExcerpt}>
                  {question.content?.slice(0, 180)}
                  {question.content && question.content.length > 180
                    ? "..."
                    : ""}
                </p>

                <div className={styles.questionFooter}>
                  <span className={styles.replyCount}>
                    {question.answerCount || 0} Replies
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationBar}>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Back
          </button>

          <div className={styles.paginationNumbers}>
            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`${styles.paginationNumber} ${
                    pageNumber === currentPage
                      ? styles.paginationNumberActive
                      : ""
                  }`}
                  onClick={() => setCurrentPage(pageNumber)}
                  aria-current={pageNumber === currentPage ? "page" : undefined}
                >
                  {pageNumber}
                </button>
              ),
            )}
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
    </div>
  );
}
