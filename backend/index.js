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

// Root Route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Evangadi Forum API is running",
    health: "/api/health",
    database: "/api/health/db",
  });
});

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is healthy",
    service: "evangadi-forum-api",
    timestamp: new Date().toISOString(),
  });
});

// Database + pgvector health check
app.get("/api/health/db", async (req, res) => {
  try {
    // 1. Confirm the pool can run a query.
    await db.query("SELECT 1");

    // 2. Confirm pgvector is enabled in this database.
    const extResult = await db.query(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'",
    );
    const pgvectorEnabled = extResult.rows && extResult.rows.length > 0;

    res.json({
      success: true,
      database: "connected",
      provider: "supabase-postgres",
      pgvector: pgvectorEnabled ? "enabled" : "not_enabled",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      database: "disconnected",
      message: error.message,
      provider: "supabase-postgres",
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
