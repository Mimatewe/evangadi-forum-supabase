import express from "express";

import {
  registerController,
  loginController,
} from "../controller/auth.controller.js";

import {
  registerValidation,
  loginValidation,
} from "../validation/auth.validation.js";

const router = express.Router();

router.post("/register", registerValidation, registerController);

router.post("/login", loginValidation, loginController);

export default router;
