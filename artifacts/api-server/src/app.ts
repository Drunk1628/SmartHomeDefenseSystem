import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "node:path";

import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const PgSessionStore = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";

if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be configured in the deployment environment.");
}

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(pinoHttp({ logger }));

app.use(
  cors({
    origin: isProduction ? true : "http://localhost:5000",
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgSessionStore({
      pool,
      createTableIfMissing: false,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use("/api", router);

// Serve the built React frontend in production.
if (isProduction) {
  const frontendPath = path.resolve(
    process.cwd(),
    "artifacts/iot-home-protection/dist",
  );

  app.use(express.static(frontendPath));

  // Return index.html for frontend routes, while leaving API routes alone.
  app.get("/{*path}", (_req, res, next) => {
    res.sendFile(path.join(frontendPath, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

export default app;
