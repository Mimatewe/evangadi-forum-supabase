import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function MyQuestions() {
  const [myQuestions, setMyQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    fetchMyQuestions();
  }, []);

  const fetchMyQuestions = async () => {
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

  if (isLoading) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "60px",
        }}
      >
        Loading your questions...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          textAlign: "center",
          color: "red",
          padding: "60px",
        }}
      >
        {error}
      </div>
    );
  }

  if (myQuestions.length === 0) {
    return (
      <div
        style={{
          maxWidth: "900px",
          margin: "40px auto",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <h2>No Questions Yet</h2>
        <p>You haven't asked any questions yet.</p>
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

          <div
            style={{
              marginTop: "12px",
              color: "#f97316",
              fontWeight: "600",
            }}
          >
            {question.answerCount || 0} Replies
          </div>
        </div>
      ))}
    </div>
  );
}
