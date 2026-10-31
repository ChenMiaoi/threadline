import { describe, expect, it } from 'vitest';
import { githubErrorMessage } from './github-errors';

describe('GitHub error explanations', () => {
  it.each([
    ['GH_AUTH_REQUIRED', '重新授权'],
    ['GH_REQUEST_FAILED', '检查网络后重试'],
    ['GH_TIMEOUT', '稍后重试'],
    ['GH_RATE_LIMIT', '额度'],
    ['NOTIFICATION_QUEUE_WRITE_FAILED', '存储'],
    ['NOTIFICATION_QUEUE_FULL', '投递'],
    ['LOCAL_SYNC_STORAGE_FAILED', '存储'],
    ['GH_FORBIDDEN', '仓库授权'],
    ['GH_NOT_FOUND', '仓库名称与访问权限'],
    ['GH_HEAD_CHANGED', '刷新概览'],
    ['GH_VAULT_INVALID', '清除本机登录'],
    ['GH_VAULT_IO', '无法读写本机登录信息'],
    ['GH_APP_PERMISSIONS_UNSAFE', '只读要求'],
    ['INVALID_REPOSITORY', 'owner/repository'],
  ])('explains %s without exposing technical codes', (code, action) => {
    const text = githubErrorMessage(new Error(`${code}: internal diagnostic`));
    expect(text).toContain(action);
    expect(text).not.toMatch(/GH_|Error:|internal diagnostic/);
  });
  it.each([
    ['GH_AUTH_REQUIRED: 登录存储已升级，请重新登录。', '登录存储已升级'],
    ['GH_AUTH_REQUIRED: 凭据与应用不匹配，请重新登录。', '与当前应用不匹配'],
    ['GH_SECURE_STORAGE\nError: GH_VAULT_IO', '无法清除本机登录'],
    ['请在 ThreadLine 桌面应用中连接 GitHub。', '桌面应用'],
    ['无法确认后台登录已停止，请重新打开应用后再试。', '重新打开应用'],
  ])('keeps known recovery instructions specific', (reason, explanation) => {
    expect(githubErrorMessage(reason)).toContain(explanation);
  });
  it.each(['GH_FUTURE_ERROR: private detail', new Error('Unexpected private content')])(
    'keeps unknown diagnostics out of the user message',
    (reason) => {
      expect(githubErrorMessage(reason)).toContain('重试');
      expect(githubErrorMessage(reason)).not.toMatch(/GH_|private|Error:/);
    },
  );
});
