import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import helmet from "helmet";
import router from "./routes/index.js";
// Twilio/WhatsApp webhook implementation disabled. Kept commented so it can be restored later.
// import webhookRouter from "./routes/webhook.js";
import { logger } from "./lib/logger.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import { apiLimiter } from "./middlewares/security.js";

const app: Express = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet({ contentSecurityPolicy: false }));

const frontendOrigin = process.env.FRONTEND_URL;
app.use(
  cors({
    credentials: true,
    origin: frontendOrigin ? frontendOrigin : true,
  }),
);
app.use(cookieParser(process.env.SESSION_SECRET || undefined));

// ---------------------------------------------------------------------------
// /webhooks — mounted BEFORE apiLimiter and express.json().
// Twilio sends application/x-www-form-urlencoded; we need the raw body for
// HMAC-SHA1 signature validation, so we parse it as urlencoded here.
// ---------------------------------------------------------------------------
// Twilio/WhatsApp webhook mount disabled. Kept commented so it can be restored later.
// app.use(
//   "/webhooks",
//   express.urlencoded({ extended: false }),
//   webhookRouter,
// );

// ---------------------------------------------------------------------------
// /api — standard JSON API with rate-limiting and auth
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", apiLimiter);
app.use(authMiddleware);
app.use("/api", router);

export default app;
