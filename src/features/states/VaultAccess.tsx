import { useState } from 'react';
import type { GitHubWorkspace } from '../../lib/useGitHub';

export function VaultAccess({ github }: { github: GitHubWorkspace }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [validation, setValidation] = useState('');
  const creating = !github.vault.exists;
  if (github.connecting) return null;
  if (github.vault.unlocked) {
    return (
      <div className="vault-access">
        <p className="dim">本地凭据库已解锁，解密密钥仅在本次运行中保留。</p>
        <button
          className="chip"
          disabled={github.vaultBusy}
          onClick={() => void github.lockVault()}
        >
          锁定凭据库
        </button>
        {github.vaultError && <p role="alert">{github.vaultError}</p>}
      </div>
    );
  }
  return (
    <form
      className="vault-access"
      aria-label={creating ? '创建加密凭据库' : '解锁加密凭据库'}
      onSubmit={(event) => {
        event.preventDefault();
        setValidation('');
        if (creating && password !== confirmation) {
          setValidation('两次输入的主密码不一致。');
          return;
        }
        void github.unlockVault(password).then(() => {
          setPassword('');
          setConfirmation('');
        });
      }}
    >
      <h3>{creating ? '创建本地加密凭据库' : '解锁本地凭据库'}</h3>
      <p className="dim">
        主密码仅用于本机加密，不会保存或发送给 GitHub。每次启动需要解锁，解锁后无需重新登录 GitHub。
        请妥善保管主密码；忘记后需要重建凭据库并重新授权。
      </p>
      <label>
        主密码
        <input
          type="password"
          aria-label="主密码"
          autoComplete={creating ? 'new-password' : 'current-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={12}
          maxLength={1024}
          required
          disabled={github.vaultBusy}
        />
      </label>
      {creating && (
        <label>
          确认主密码
          <input
            type="password"
            aria-label="确认主密码"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={12}
            maxLength={1024}
            required
            disabled={github.vaultBusy}
          />
        </label>
      )}
      <p className="dim">至少 12 个字符。</p>
      <button type="submit" className="chip accent" disabled={github.vaultBusy}>
        {github.vaultBusy ? '正在处理…' : creating ? '创建凭据库' : '解锁凭据库'}
      </button>
      {(validation || github.vaultError) && <p role="alert">{validation || github.vaultError}</p>}
    </form>
  );
}
