/** 纯函数便于测试:rate 夹到 [0,1],roll 是外部注入的随机数。 */
export function shouldSample(rate: number, roll: number): boolean {
  const r = Math.min(Math.max(rate, 0), 1);
  return roll < r;
}
