/**
 * RagDocuments: "/rag-documents" — private PDF library.
 * Ticket: T-24 / T-25
 *
 * Layout: Library sidebar (upload dropzone + document list) on the left,
 * a 3-tab active view (PDF Preview / Semantic Search / Ask AI) on the right.
 *
 * Assumes this is rendered inside the same app shell that wraps Dashboard
 * (top "Forum" bar, left NAVIGATE sidebar, footer) — this component only
 * renders the inner page content, matching how Dashboard.jsx is structured.
 *
 * Backend: http://localhost:3777/api/rag
 *   GET    /documents                       list
 *   POST   /documents                       upload (multipart, field "file")
 *   GET    /documents/:id                   meta
 *   GET    /documents/:id/file               raw PDF stream (auth required → fetched as blob)
 *   GET    /documents/:id/search?query=&k=   semantic search
 *   POST   /documents/:id/query              { query } → AI answer + citations
 *   DELETE /documents/:id                    delete
 *
 * Note: the upload endpoint is synchronous — by the time the response comes
 * back the document is already "ready" or has failed. The "processing"
 * status row in the UI is therefore an optimistic placeholder shown only
 * while the upload request is in flight.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  Search as SearchIcon,
  Sparkles,
} from "lucide-react";
import styles from "./RagAnswerBody.module.css";

const RAG_API_BASE = "http://localhost:3777/api/rag";

const TABS = [
  { id: "preview", label: "PDF Preview", icon: FileText },
  { id: "search", label: "Semantic Search", icon: SearchIcon },
  { id: "ask", label: "Ask AI", icon: Sparkles },
];

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function statusBadgeClass(status) {
  switch (status) {
    case "ready":
      return styles["badge-ready"];
    case "failed":
      return styles["badge-failed"];
    default:
      return styles["badge-processing"];
  }
}

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: `Bearer ${token}` };
}

export default function RagDocuments() {
  const fileInputRef = useRef(null);

  // ── Library / list state ────────────────────────────────────────────────
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState(null);

  // ── Upload state ─────────────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // ── Selection / tabs ─────────────────────────────────────────────────────
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [activeTab, setActiveTab] = useState("preview");

  // ── Preview tab state ────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  // ── Semantic search tab state ───────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchResults, setSearchResults] = useState(null);

  // ── Ask AI tab state ─────────────────────────────────────────────────────
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState(null);
  const [askAnswer, setAskAnswer] = useState(null);

  const selectedDoc =
    documents.find((d) => d.document_id === selectedDocId) || null;

  // ── Fetch documents ──────────────────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    try {
      setDocsLoading(true);
      setDocsError(null);
      const res = await axios.get(`${RAG_API_BASE}/documents`, {
        headers: authHeaders(),
      });
      setDocuments(res.data?.data ?? []);
    } catch (err) {
      console.error("Failed to load documents:", err);
      setDocsError("Could not load documents.");
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ── Upload handlers ──────────────────────────────────────────────────────
  const handleChooseFile = () => fileInputRef.current?.click();

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setUploadError(null);

    // Optimistic placeholder row — the upload request is synchronous on the
    // server, so this is the only point at which the user sees "processing".
    const tempId = `temp-${Date.now()}`;
    const optimisticDoc = {
      document_id: tempId,
      title: selectedFile.name,
      status: "processing",
      byte_size: selectedFile.size,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setDocuments((prev) => [optimisticDoc, ...prev]);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const res = await axios.post(`${RAG_API_BASE}/documents`, formData, {
        headers: {
          ...authHeaders(),
          "Content-Type": "multipart/form-data",
        },
      });

      const created = res.data?.data;
      setDocuments((prev) =>
        prev.map((d) => (d.document_id === tempId ? created : d)),
      );
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Upload failed:", err);
      setDocuments((prev) => prev.filter((d) => d.document_id !== tempId));
      setUploadError(
        err.response?.data?.message || "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  // ── Delete handler ───────────────────────────────────────────────────────
  const handleDelete = async (documentId, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`${RAG_API_BASE}/documents/${documentId}`, {
        headers: authHeaders(),
      });
      setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
      if (selectedDocId === documentId) {
        setSelectedDocId(null);
        setPreviewUrl(null);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
      setDocsError(err.response?.data?.message || "Could not delete document.");
    }
  };

  // ── Select a document ────────────────────────────────────────────────────
  const handleSelectDocument = (doc) => {
    if (doc._optimistic) return; // not selectable until the server confirms it
    setSelectedDocId(doc.document_id);
    setActiveTab("preview");
    setSearchQuery("");
    setSearchResults(null);
    setSearchError(null);
    setQuestion("");
    setAskAnswer(null);
    setAskError(null);
  };

  // ── Load PDF preview as an authenticated blob ───────────────────────────
  useEffect(() => {
    let objectUrl = null;

    async function loadPreview() {
      if (!selectedDoc || selectedDoc.status !== "ready") {
        setPreviewUrl(null);
        return;
      }
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const res = await axios.get(
          `${RAG_API_BASE}/documents/${selectedDoc.document_id}/file`,
          { headers: authHeaders(), responseType: "blob" },
        );
        objectUrl = URL.createObjectURL(res.data);
        setPreviewUrl(objectUrl);
      } catch (err) {
        console.error("Failed to load preview:", err);
        setPreviewError("Could not load PDF preview.");
      } finally {
        setPreviewLoading(false);
      }
    }

    loadPreview();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.document_id, selectedDoc?.status]);

  // ── Semantic search ──────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!selectedDoc || searchQuery.trim().length < 3 || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await axios.get(
        `${RAG_API_BASE}/documents/${selectedDoc.document_id}/search`,
        {
          headers: authHeaders(),
          params: { query: searchQuery.trim(), k: 5 },
        },
      );
      setSearchResults(res.data?.data?.results ?? []);
    } catch (err) {
      console.error("Search failed:", err);
      setSearchError("Search failed.");
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  };

  // ── Ask AI ───────────────────────────────────────────────────────────────
  const handleAsk = async () => {
    if (!selectedDoc || question.trim().length < 3 || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const res = await axios.post(
        `${RAG_API_BASE}/documents/${selectedDoc.document_id}/query`,
        { query: question.trim() },
        { headers: authHeaders() },
      );
      setAskAnswer(res.data?.data ?? null);
    } catch (err) {
      console.error("Ask failed:", err);
      setAskError("Could not get an answer.");
      setAskAnswer(null);
    } finally {
      setAsking(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`${styles["page-container"]} font-sans text-gray-800`}>
      <header className={styles["page-header"]}>
        <span className={styles.eyebrow}>KNOWLEDGE BASE</span>
        <h1 className={styles["page-title"]}>Private PDF library</h1>
        <p className={styles["page-description"]}>
          Upload study or reference PDFs to your own workspace. Each file is
          indexed for semantic search and optional AI answers that cite passages
          from that document only. File size limits apply on the server; other
          users never see your uploads.
        </p>
      </header>

      {docsError && (
        <div className={styles["page-error-banner"]}>{docsError}</div>
      )}

      <div className={styles["content-grid"]}>
        {/* ── Library panel ─────────────────────────────────────────── */}
        <aside className={styles["library-panel"]}>
          <h2 className={styles["panel-title"]}>Library</h2>
          <p className={styles["panel-subtitle"]}>
            Add PDFs here. Processing runs once per upload.
          </p>

          <div className={styles.dropzone}>
            <p className={styles["dropzone-hint"]}>
              Accepted format: PDF. Maximum file size is enforced by the server.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={handleFileSelected}
            />

            <div className={styles["dropzone-actions"]}>
              <button
                type="button"
                className={styles["choose-file-btn"]}
                onClick={handleChooseFile}
                disabled={uploading}
              >
                <FileText size={16} />
                Choose file
              </button>
              <button
                type="button"
                className={styles["upload-btn"]}
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className={styles.spin} />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload
                  </>
                )}
              </button>
            </div>

            {selectedFile ? (
              <div className={styles["selected-file-row"]}>
                <FileText size={14} />
                <span className={styles["selected-file-name"]}>
                  {selectedFile.name}
                </span>
                <span className={styles["selected-file-size"]}>
                  {formatBytes(selectedFile.size)}
                </span>
              </div>
            ) : (
              <p className={styles["no-file-text"]}>No file selected.</p>
            )}

            {uploadError && (
              <p className={styles["inline-error"]}>{uploadError}</p>
            )}
          </div>

          {docsLoading ? (
            <p className={styles["status-text"]}>Loading your library...</p>
          ) : documents.length === 0 ? (
            <p className={styles["status-text"]}>
              Your library is empty. Upload a PDF to index it for search and
              Q&A.
            </p>
          ) : (
            <ul className={styles["document-list"]}>
              {documents.map((doc) => (
                <li
                  key={doc.document_id}
                  className={`${styles["document-row"]} ${
                    selectedDocId === doc.document_id
                      ? styles["document-row-active"]
                      : ""
                  }`}
                  onClick={() => handleSelectDocument(doc)}
                >
                  <span className={styles["document-title"]}>{doc.title}</span>
                  <div className={styles["document-meta"]}>
                    <span
                      className={`${styles["status-badge"]} ${statusBadgeClass(
                        doc.status,
                      )}`}
                      title={
                        doc.status === "failed"
                          ? doc.error_message || "Processing failed."
                          : undefined
                      }
                    >
                      {(doc.status || "processing").toUpperCase()}
                    </span>
                    {!doc._optimistic && (
                      <button
                        type="button"
                        className={styles["delete-btn"]}
                        onClick={(e) => handleDelete(doc.document_id, e)}
                        aria-label={`Delete ${doc.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* ── Active view panel ─────────────────────────────────────── */}
        <section className={styles["active-view-panel"]}>
          {!selectedDoc ? (
            <div className={styles["placeholder-box"]}>
              Choose a document from the library to open the reader, run
              semantic search over its text, and ask questions with AI-assisted
              answers grounded in that file.
            </div>
          ) : selectedDoc.status !== "ready" ? (
            <div className={styles["placeholder-box"]}>
              This document is not ready for preview or AI tools. Current
              status: <strong>{selectedDoc.status}</strong>.
            </div>
          ) : (
            <>
              <div className={styles["tab-bar"]}>
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`${styles["tab-button"]} ${
                        activeTab === tab.id ? styles["tab-button-active"] : ""
                      }`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon size={15} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div className={styles["tab-content"]}>
                {activeTab === "preview" && (
                  <>
                    <h3 className={styles["tab-section-title"]}>Reader</h3>
                    <p className={styles["tab-section-subtitle"]}>
                      Inline preview of the selected PDF.
                    </p>
                    <div className={styles["reader-frame"]}>
                      {previewLoading ? (
                        <p className={styles["status-text"]}>
                          Loading document preview...
                        </p>
                      ) : previewError ? (
                        <p className={styles["inline-error-banner"]}>
                          {previewError}
                        </p>
                      ) : previewUrl ? (
                        <iframe
                          src={previewUrl}
                          title={selectedDoc.title}
                          className={styles["pdf-iframe"]}
                        />
                      ) : null}
                    </div>
                  </>
                )}

                {activeTab === "search" && (
                  <>
                    <h3 className={styles["tab-section-title"]}>
                      Semantic search
                    </h3>
                    <p className={styles["tab-section-subtitle"]}>
                      Finds passages by meaning (embeddings), not only exact
                      keywords.
                    </p>

                    <label className={styles["field-label"]}>
                      Search query
                    </label>
                    <input
                      type="text"
                      className={styles["text-input"]}
                      placeholder="Describe the topic or phrase you are looking for"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSearch();
                      }}
                    />
                    <button
                      type="button"
                      className={styles["primary-btn"]}
                      onClick={handleSearch}
                      disabled={searching || searchQuery.trim().length < 3}
                    >
                      {searching ? (
                        <Loader2 size={15} className={styles.spin} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      Search
                    </button>

                    {searchError && (
                      <p className={styles["inline-error-banner"]}>
                        {searchError}
                      </p>
                    )}

                    {searchResults && searchResults.length === 0 && (
                      <p className={styles["status-text"]}>
                        No matching passages found.
                      </p>
                    )}

                    {searchResults && searchResults.length > 0 && (
                      <ul className={styles["results-list"]}>
                        {searchResults.map((r) => (
                          <li key={r.chunkId} className={styles["result-item"]}>
                            <div className={styles["result-meta"]}>
                              <span>Chunk {r.chunkIndex}</span>
                              <span>Score {r.score}</span>
                            </div>
                            <p className={styles["result-excerpt"]}>
                              {r.excerpt}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}

                {activeTab === "ask" && (
                  <>
                    <h3 className={styles["tab-section-title"]}>Ask with AI</h3>
                    <p className={styles["tab-section-subtitle"]}>
                      Answers use only retrieved excerpts from this PDF, with
                      citations where possible. When the document includes code,
                      the reply may show it in formatted blocks you can copy.
                    </p>

                    <label className={styles["field-label"]}>Question</label>
                    <textarea
                      className={styles["text-area"]}
                      placeholder="Ask a clear question in plain language. If the document does not cover it, the model should say so."
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles["primary-btn"]}
                      onClick={handleAsk}
                      disabled={asking || question.trim().length < 3}
                    >
                      {asking ? (
                        <Loader2 size={15} className={styles.spin} />
                      ) : (
                        <Sparkles size={15} />
                      )}
                      Ask
                    </button>

                    {askError && (
                      <p className={styles["inline-error-banner"]}>
                        {askError}
                      </p>
                    )}

                    {askAnswer && (
                      <div className={styles["answer-box"]}>
                        <p className={styles["answer-text"]}>
                          {askAnswer.answer}
                        </p>
                        {askAnswer.citations?.length > 0 && (
                          <div className={styles["citations-row"]}>
                            Citations:{" "}
                            {askAnswer.citations
                              .map((c) => `#${c.ref} (chunk ${c.chunkIndex})`)
                              .join(", ")}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
