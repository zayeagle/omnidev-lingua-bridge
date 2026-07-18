/** Map browser/extension internals to short user-facing Chinese. */
export function friendlyError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '');
  const stagePrefix = msg.match(/^\[[^\]]+\]/)?.[0];
  const withStage = (text: string) =>
    stagePrefix && !text.startsWith('[') ? `${stagePrefix} ${text}` : text;

  if (/extension context invalidated/i.test(msg)) {
    return withStage('扩展已更新，请刷新本页后再用');
  }
  if (/receiving end does not exist|could not establish connection/i.test(msg)) {
    return withStage('扩展连接已断开，请刷新本页');
  }
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return withStage('网络请求失败，请稍后重试或检查设置');
  }
  return msg || '操作失败';
}
