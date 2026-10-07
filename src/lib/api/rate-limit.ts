/*
 * Limite de tentativas em memória (janela fixa por chave). Simples de propósito: vale por processo do
 * servidor; com várias instâncias (serverless), cada uma conta a sua. Para produção com escala, trocar
 * por um armazenamento compartilhado (Redis/KV) mantendo esta interface.
 */

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export type RateLimiter = {
  hit: (key: string, now?: number) => RateLimitResult;
  reset: (key: string) => void;
};

export function createRateLimiter({ max, windowMs, maxKeys = 10_000 }: { max: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  const prune = (now: number) => {
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
    // Ainda cheio (ataque com muitas chaves): descarta as mais antigas.
    while (hits.size >= maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  };

  return {
    hit(key, now = Date.now()) {
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size >= maxKeys) prune(now);
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;
      const ok = entry.count <= max;
      return { ok, remaining: Math.max(0, max - entry.count), retryAfterSec: ok ? 0 : Math.ceil((entry.resetAt - now) / 1000) };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
