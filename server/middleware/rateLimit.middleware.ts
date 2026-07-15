import type { NextFunction, Request, Response } from 'express';

type RateLimitOptions = {
    windowMs: number;
    maxRequests: number;
};

type Bucket = {
    count: number;
    resetAt: number;
};

export function createRateLimit({ windowMs, maxRequests }: RateLimitOptions) {
    const buckets = new Map<string, Bucket>();

    return (req: Request, res: Response, next: NextFunction): void => {
        const now = Date.now();
        if (buckets.size > 10_000) {
            for (const [bucketKey, bucket] of buckets) {
                if (bucket.resetAt <= now) buckets.delete(bucketKey);
            }
        }
        const key = req.ip || req.socket.remoteAddress || 'unknown';
        const current = buckets.get(key);

        if (!current || current.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            next();
            return;
        }

        current.count += 1;
        if (current.count > maxRequests) {
            res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
            res.status(429).json({ error: 'Demasiados intentos. Intente nuevamente más tarde.' });
            return;
        }

        next();
    };
}
