const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':         { input: 3.0,  output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0  },
  'claude-opus-4-8':           { input: 15.0, output: 75.0 },
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING['claude-sonnet-4-6']
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}
