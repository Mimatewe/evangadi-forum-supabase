import { StatusCodes } from "http-status-codes";

export const errorHandler = (err, req, res, next) => {
  console.error("Error Handler:", {
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? "🥞" : err.stack,
    code: err.code,
    statusCode: err.statusCode,
  });

  const customError = {
    statusCode: err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR,
    msg: err.message || "Something went wrong",
  };

  if (err.code === "ER_DUP_ENTRY") {
    customError.statusCode = StatusCodes.BAD_REQUEST;

    customError.msg = "Duplicate value entered";
  }

  return res.status(customError.statusCode).json({
    success: false,
    message: customError.msg,
  });
};
