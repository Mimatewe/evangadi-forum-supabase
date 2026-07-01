import "dotenv/config";
import { errorHandler } from "./src/middleware/error-handler.js";
import express from "express";
import cors from "cors";
import { db } from "./db/config.js";
import { mainRoutes } from "./src/api/routes.js";
const app = express();
const port = process.env.PORT || 3777;
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
  }),
);
// app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// Database + pgvector health check
// Verifies the Supabase PostgreSQL connection and that the pgvector
// extension is installed. Does not require authentication.
app.get("/api/health/db", async (req, res) => {
  try {
    // 1. Confirm the pool can run a query.
    const result = await db.query("SELECT 1 AS ok");

    // 2. Confirm pgvector is enabled in this database.
    const extResult = await db.query(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    const pgvectorEnabled = extResult.rows && extResult.rows.length > 0;

    return res.status(200).json({
      success: true,
      database: "connected",
      provider: "supabase-postgres",
      pgvector: pgvectorEnabled ? "enabled" : "not_enabled",
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      database: "disconnected",
      provider: "supabase-postgres",
      error: error?.message || "Unable to connect to the database",
    });
  }
});

app.use("/api", mainRoutes);

app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // pg Pool uses connect()/release(); mysql2 used getConnection()/release().
    const connection = await db.connect();

    console.log("Database connection established successfully");
    connection.release();

    app.listen(port, (err) => {
      if (err) {
        console.error("Failed to start the server:", err.message);
        process.exit(1);
      }
      console.log(`Server running on port http://localhost:${port}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

startServer();
