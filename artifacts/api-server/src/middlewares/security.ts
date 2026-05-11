import type { Request, Response, NextFunction } from "express";

type LimiterOptions = {
  windowMs: number;
  limit: number;
  skipSuccessfulRequests?: boolean;
};

type Bucket = {
  count: number;
  resetAt: number;
};

function createRateLimiter(options: LimiterOptions) {
  const buckets = new Map<string, Bucket>();

  return function limiter(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    } else {
      current.count += 1;
      buckets.set(key, current);
    }

    const bucket = buckets.get(key)!;
    const remaining = Math.max(options.limit - bucket.count, 0);

    res.setHeader("RateLimit-Limit", options.limit.toString());
    res.setHeader("RateLimit-Remaining", remaining.toString());
    res.setHeader("RateLimit-Reset", Math.ceil(bucket.resetAt / 1000).toString());

    if (options.skipSuccessfulRequests) {
      res.on("finish", () => {
        if (res.statusCode < 400) {
          const latest = buckets.get(key);
          if (!latest) return;
          latest.count = Math.max(latest.count - 1, 0);
          buckets.set(key, latest);
        }
      });
    }

    if (bucket.count > options.limit) {
      res.status(429).json({
        success: false,
        error: "Too many requests. Please try again later.",
      });
      return;
    }

    next();
  };
}

export const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
});

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
});