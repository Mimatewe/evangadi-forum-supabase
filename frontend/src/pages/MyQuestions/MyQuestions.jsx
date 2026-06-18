import { useEffect, useState } from "react";
import axios from "axios";
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

      const token = localStorage.getItem("token");

      const response = await axios.get(
        "http://localhost:3777/api/questions?mine=true",
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      console.log("My Questions Response:", response.data);

      setMyQuestions(response.data.data || []);
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
    <div
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "20px",
      }}
    >
      <h1
        style={{
          marginBottom: "10px",
          fontSize: "2.25rem",
        }}
      >
        My Questions
      </h1>

      <p
        style={{
          color: "#666",
          marginBottom: "30px",
        }}
      >
        View all questions you've posted and track community responses.
      </p>

      {myQuestions.map((question) => (
        <div
          key={question.questionHash}
          onClick={() => navigate(`/questions/${question.questionHash}`)}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            padding: "20px",
            marginBottom: "16px",
            backgroundColor: "#fff",
            cursor: "pointer",
            boxShadow: "0 2px 6px rgba(0,0,0,0.05)",
          }}
        >
          <h3
            style={{
              marginBottom: "10px",
            }}
          >
            {question.title}
          </h3>

          <p
            style={{
              color: "#555",
              lineHeight: "1.6",
            }}
          >
            {question.content?.slice(0, 180)}...
          </p>

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
