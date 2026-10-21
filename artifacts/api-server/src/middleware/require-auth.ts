import type { RequestHandler } from "express";

const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session?.userId) {
    res.status(401).json({
      error: "Authentication required. Please log in.",
    });
    return;
  }

  next();
};

export default requireAuth;
