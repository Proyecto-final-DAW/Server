export async function sleepMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function sleepJitterMs(
  minMs: number,
  maxMs: number
): Promise<void> {
  const min = Math.max(0, Math.floor(minMs));
  const max = Math.max(min, Math.floor(maxMs));
  const ms = min + Math.floor(Math.random() * (max - min + 1));
  await sleepMs(ms);
}
