/**
 * Navbar: page title, debounced keyword search → `/dashboard?q=…`, AI semantic search.
 * Search state is URL-driven so bookmarks and refresh preserve context.
 */
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, LogOut, Sparkles } from "lucide-react";
import styles from "./Navbar.module.css";

export default function Navbar({ title, subtitle, user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── Initialise from URL so refresh keeps the search term in the input ────────
  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get("q") || params.get("semantic") || "";
  });

  // ─── Keep input in sync when the URL changes externally ──────────────────────
  useEffect(() => {
    if (location.pathname === "/dashboard" || location.pathname === "/") {
      const params = new URLSearchParams(location.search);
      setSearchTerm(params.get("q") || params.get("semantic") || "");
    } else {
      setSearchTerm("");
    }
  }, [location.search, location.pathname]);

  // ─── Debounced keyword search (500 ms) ───────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const hasSemantic = params.has("semantic");

    // If the current URL is already a semantic search for this term, don't
    // overwrite it with a keyword search after the debounce fires.
    if (hasSemantic && params.get("semantic") === searchTerm) {
      return;
    }

    const timer = setTimeout(() => {
      if (searchTerm.trim() !== "") {
        navigate(`/dashboard?q=${encodeURIComponent(searchTerm)}`);
      } else if (
        (location.pathname === "/dashboard" || location.pathname === "/") &&
        !hasSemantic
      ) {
        navigate("/dashboard");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm, navigate, location.pathname, location.search]);

  // ─── Handlers ─────────────────────────────────────────────────────────────────
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/dashboard?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const handleSemanticSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim().length >= 3) {
      navigate(`/dashboard?semantic=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <header className={styles.navbar}>
      <div className={styles.navbar__titleBlock}>
        <h2 className={styles.navbar__pageTitle}>{title}</h2>
        {subtitle && <p className={styles.navbar__pageSubtitle}>{subtitle}</p>}
      </div>

      <form className={styles.navbar__search} onSubmit={handleSearchSubmit}>
        <div className={styles["navbar__search-icon"]}>
          <Search size={16} />
        </div>
        <input
          id="search"
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search questions by keyword…"
          className={styles["navbar__search-input"]}
          aria-label="Search questions by keyword"
        />
        {searchTerm.length >= 3 && (
          <button
            type="button"
            onClick={handleSemanticSearch}
            className={styles["navbar__semantic-button"]}
            title="Use AI Semantic Search"
          >
            <Sparkles size={14} />
            <span className={styles["navbar__semantic-text"]}>AI Search</span>
          </button>
        )}
      </form>

      <div className={styles.navbar__actions}>
        <div className={styles.navbar__user}>
          <span className={styles["navbar__user-name"]}>
            {user ? `${user.firstName} ${user.lastName}` : "Guest"}
          </span>
          <div className={styles["navbar__user-avatar"]}>
            <img
              src={
                user?.avatar ||
                `https://ui-avatars.com/api/?name=${
                  user?.firstName || "User"
                }+${user?.lastName || ""}&background=random`
              }
              alt="avatar"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        {user && (
          <button
            type="button"
            className={styles.navbar__logout}
            onClick={onLogout}
            aria-label="Logout"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        )}
      </div>
    </header>
  );
}
