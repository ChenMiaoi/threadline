const messages: Record<string, string> = {
  GH_AUTH_REQUIRED: 'GitHub 登录已失效，请重新授权后继续。',
  GH_ACCOUNT_CHANGED: 'GitHub 账号已变更，请重新连接并选择仓库。',
  GH_FORBIDDEN: '暂时无法访问此仓库，请检查 GitHub App 的仓库授权后重试。',
  GH_NOT_FOUND: '找不到此仓库或记录，请确认仓库名称与访问权限。',
  GH_REQUEST_FAILED: '暂时无法连接 GitHub，请检查网络后重试。',
  GH_TIMEOUT: 'GitHub 响应超时，请稍后重试。',
  GH_RATE_LIMIT: 'GitHub 请求额度暂时用尽，请稍后重试。',
  GH_API_ERROR: 'GitHub 未能完整返回数据，请稍后重试；若持续失败，请检查仓库授权。',
  GH_RESPONSE_ERROR: 'GitHub 返回的数据暂时无法读取，请稍后重试。',
  GH_HEAD_CHANGED: '此 PR 已有新提交，请刷新概览后重新打开详情。',
  GH_SEARCH_LIMIT: '匹配的记录超过 GitHub 的读取上限，请缩小仓库范围后重试。',
  GH_APP_PERMISSIONS_UNSAFE: '当前 GitHub App 权限不符合只读要求，请检查应用配置后重新授权。',
  GH_APP_IDENTITY_MISMATCH: 'GitHub App 配置不匹配，请检查应用配置后重新授权。',
  GH_APP_NOT_CONFIGURED: 'GitHub 登录尚未配置完成，请检查应用配置后重试。',
  GH_SECURE_STORAGE: '无法访问本机登录存储，请重新打开应用后重试。',
  GH_VAULT_IO: '无法读写本机登录信息，请重新打开应用后重试。',
  GH_VAULT_INVALID: '本机保存的登录信息无法读取，请清除本机登录后重新授权。',
  GH_LOGIN_DENIED: '已取消 GitHub 授权，需要连接时可重新登录。',
  GH_LOGIN_TIMEOUT: '登录验证码已过期，请重新获取验证码。',
  GH_LOGIN_FAILED: 'GitHub 授权未完成，请重试登录。',
  NOTIFICATION_QUEUE_WRITE_FAILED: '无法保存待提醒记录，请检查本地存储空间；同步将自动重试。',
  NOTIFICATION_QUEUE_FULL: '待提醒记录较多，请先恢复系统通知投递；同步将自动重试。',
  LOCAL_SYNC_STORAGE_FAILED: '无法保存同步数据，请检查本地存储空间；同步将自动重试。',
  INVALID_REPOSITORY: '请输入有效的仓库名称，例如 owner/repository。',
};

/** Keep transport codes available to the application, but explain failures at the UI boundary. */
export function githubErrorMessage(reason: unknown): string {
  const raw = String(reason);
  const readable = raw.replace(/^Error: /, '');
  if (
    [
      '登录已超时，请重试。',
      '无法确认后台登录已停止，请重新打开应用后再试。',
      '请在 ThreadLine 桌面应用中连接 GitHub。',
    ].includes(readable)
  )
    return readable;
  const code = raw.match(
    /\b(GH_[A-Z_]+|NOTIFICATION_QUEUE_[A-Z_]+|LOCAL_SYNC_STORAGE_FAILED|INVALID_REPOSITORY)\b/,
  )?.[0];
  if (raw.includes('GH_VAULT_IO') && raw.includes('\n'))
    return '无法清除本机登录，请重新打开应用后重试。';
  if (code === 'GH_AUTH_REQUIRED' && raw.includes('登录存储已升级'))
    return '本机登录存储已升级，请重新登录 GitHub。';
  if (code === 'GH_AUTH_REQUIRED' && raw.includes('不匹配'))
    return '本机登录信息与当前应用不匹配，请重新授权 GitHub。';
  if (code) return messages[code] ?? 'GitHub 操作暂时未完成，请稍后重试。';
  return '操作暂时未完成，请检查网络后重试。';
}
