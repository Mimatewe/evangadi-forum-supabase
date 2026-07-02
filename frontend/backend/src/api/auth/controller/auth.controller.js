import { StatusCodes } from "http-status-codes";

import { registerService, loginService } from "../service/auth.service.js";

export const registerController = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    const user = await registerService({
      firstName,
      lastName,
      email,
      password,
    });

    res.status(StatusCodes.CREATED).json({
      success: true,
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

export const loginController = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await loginService({
      email,
      password,
    });

    res.status(StatusCodes.OK).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};
