import React, { useEffect, useState } from "react";
import { apiClient } from "../../services/core/api.client";
import styles from "./MyAnswers.module.css";
import { Trash2, Edit } from "lucide-react";
import { useNavigate } from "react-router-dom";

function formatDate(iso) {
  if (!iso) return "Recent";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MyAnswers() {
  const [myAnswers, setMyAnswers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingAnswerId, setDeletingAnswerId] = useState(null);
  const [editingAnswerId, setEditingAnswerId] = useState(null);
  const [editContent,setEditContent] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    fetchMyAnswers();
  }, []);

//   function to fetch the my answers
  const fetchMyAnswers = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get("/api/answers/myAnswer");
      setMyAnswers(
        Array.isArray(response.data?.data) ? response.data.data : [],
      );
    } catch (err) {
      console.log(err);
      setError("Failed to fetch my answers");
    } finally {
      setIsLoading(false);
    }
  };

// edit answer function handler
const handleEditClick=(answer,e)=>{
    e.stopPropagation();
    setEditingAnswerId(answer.id);
    setEditContent(answer.content);
}

const handleCancelEdit=(e)=>{
e.stopPropagation();
setEditingAnswerId(null);
setEditContent("");
}
const handleSaveEdit=async(answerId,e)=>{
  e.stopPropagation();
  try {
    await apiClient.put(`/api/answers/${answerId}`,{
      content:editContent,
    });
    setMyAnswers((prev) =>
      prev.map((ans) =>
        ans.id === answerId ? { ...ans, content: editContent } : ans
      ),
    );
    setEditingAnswerId(null);
    
  } catch (error) {
    console.log(error);
    alert("Failed to save answer");
  }
}





//   functions to handle the delete answer
 
const handleDeleteClick=(answerId,e)=>{
    e.stopPropagation();
    setDeletingAnswerId(answerId);
}
const confirmDelete = async()=>{
    if (!deletingAnswerId) return;
    try {
        await apiClient.delete(`/api/answers/${deletingAnswerId}`);
        setMyAnswers((prevAnswers) =>
            prevAnswers.filter((ans) => ans.id !== deletingAnswerId),
        );
        setDeletingAnswerId(null);
    } catch (error) {
        console.log(error);
        alert("Failed to delete answer");
    }
}





  // to show the loading state
  if (isLoading) {
    return (
      <div className={styles.stateCard}>
        <p>Loading your answers...</p>
      </div>
    );
  }
  // if there is an err
  if (error) {
    return (
      <div className={styles.stateCard}>
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }
  // if there is no answer my the login user
  if (myAnswers.length === 0) {
    return (
      <div className={styles.pageShell}>
        <div className={styles.headerCard}>
          <p className={styles.eyebrow}>Your workspace</p>
          <h1 className={styles.pageTitle}>Your Answers</h1>
          <p className={styles.pageDescription}>
            Answers you've given on the forum.
          </p>
        </div>
        <div className={styles.stateCard}>
          <h2 className={styles.emptyTitle}>No Answers Yet</h2>
          <p>You haven't answered any questions yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageShell}>
      {/* header part */}
      <div className={styles.headerCard}>
        <p className={styles.eyebrow}>Your Workspace</p>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>Your Answers</h1>
            <p className={styles.pageDescription}>
              Answers you've given on the Forum . Open one to view the full
              discussion.
            </p>
          </div>
        </div>
      </div>
      {/* Main part */}
      <div className={styles.listCard}>
        {myAnswers.map((answer) => (
          <div
            key={answer.id}
            className={styles.answerRow}
            onClick={() => navigate(`/questions/${answer.question.hash}`)}
          >
            <div className={styles.answerContent}>
              {/* show question title */}
              <div className={styles.answerTopLine}>
                <span className={styles.questionTitle}>
                  {/* title for the question */}
                  Question: {answer.question?.title || "Unknown Question"}
                </span>
                {/* date of the question */}
                <span className={styles.answerDate}>
                  {formatDate(answer.createdAt)}
                </span>
              </div>
              
              {/* Show Textbox if Editing, otherwise show normal text */}
              <div className={styles.yourAnswerBox}>
                {editingAnswerId === answer.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea
                      className={styles.editTextArea}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <div className={styles.editActions}>
                      <button
                        className={styles.cancelEditButton}
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </button>
                      <button
                        className={styles.saveEditButton}
                        onClick={(e) => handleSaveEdit(answer.id, e)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={styles.answerExcerpt}>
                    <strong>Your Answer: </strong>
                    {answer.content}
                  </p>
                )}
              </div>

              {/* Edit and Delete Icons */}
              <div className={styles.answerFooter}>
                {editingAnswerId !== answer.id && (
                  <button
                    onClick={(e) => handleEditClick(answer, e)}
                    className={styles.editButton}
                  >
                    <Edit size={16} />
                    <span>Edit Answer</span>
                  </button>
                )}

                <button
                  onClick={(e) => handleDeleteClick(answer.id, e)}
                  className={styles.deleteButton}
                >
                  <Trash2 size={16} />
                  <span>Delete Answer</span>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* handling the confirm delete  */}
      {deletingAnswerId && (
        <div
          className={styles.modalOverlay}
          onClick={() => setDeletingAnswerId(null)}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.modalTitle}>Delete Answer</h3>
            <p className={styles.modalText}>
              Are you sure you want to delete this answer? This action cannot be
              undone.
            </p>
            {/* button are you sure and cancle button */}
            <div className={styles.modalActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setDeletingAnswerId(null)}
              >
                Cancel
              </button>
              <button
                className={styles.confirmDeleteButton}
                onClick={confirmDelete}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyAnswers;
