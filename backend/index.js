import "dotenv/config";
import { errorHandler } from "./src/middleware/error-handler.js";
import express from "express";
import cors from "cors";
import { db } from "./db/config.js";
import { mainRoutes } from "./src/api/routes.js";
const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
]
  .filter(Boolean)
  .flatMap((origin) => origin.split(","))
  .map((origin) => origin.trim())
  .filter(Boolean);

console.log("Allowed Origins:", allowedOrigins);

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes("*")) {
        callback(null, true);
      } else {
        console.error(`CORS blocked for origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
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
  res.json({ status: "ok", message: "Backend is running" });
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
    const dbUrl = process.env.DATABASE_URL || "";
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ":****@");
    console.log(`Connecting to database: ${maskedUrl}`);

    // pg Pool uses connect()/release(); mysql2 used getConnection()/release().
    const connection = await db.connect();

    console.log("Database connection established successfully");
    connection.release();

    app.listen(PORT, "0.0.0.0", (err) => {
      if (err) {
        console.error("Failed to start the server:", err.message);
        process.exit(1);
      }
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

startServer();
