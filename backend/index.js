import "dotenv/config";
import { errorHandler } from "./src/middleware/error-handler.js";
import express from "express";
import cors from "cors";
import { db } from "./db/config.js";
import { mainRoutes } from "./src/api/routes.js";
const app = express();
const port = process.env.PORT;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173"],
  }),
);
// app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.use("/api", mainRoutes);

app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    const connection = await db.getConnection();

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
