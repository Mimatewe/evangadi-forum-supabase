import express from "express";
import authRoutes from "../api/auth/routes/auth.routes.js";

//import questionsRoutes from "./question/routes/question.route.js";

export const mainRoutes = express.Router();

mainRoutes.use("/auth", authRoutes);
// mainRoutes.use("/questions", questionsRoutes);
// mainRoutes.use("/answers", answersRoutes);
// mainRoutes.use("/rag", ragRoutes);
export default mainRoutes;
