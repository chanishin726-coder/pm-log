/**
 * API 에러 응답은 항상 { error: string } 형식입니다.
 * res.ok가 false일 때 이 함수로 메시지를 추출해 사용하세요.
 */
export async function getApiErrorMessage(
  res: Response,
  fallback: string = '오류가 발생했습니다.'
): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}
