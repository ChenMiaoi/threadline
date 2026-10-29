use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, Payload},
    KeyInit, XChaCha20Poly1305, XNonce,
};
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use zeroize::Zeroizing;

const MAX_VAULT_BYTES: u64 = 64 * 1024;
const KDF: &str = "argon2id-64m-3t-1p-v1";
// Secrets are never Debug or returned through a command.
#[derive(Clone, Deserialize, Serialize)]
pub struct Credential {
    pub client_id: String,
    pub access_token: String,
    pub expires_at: u64,
    pub refresh_token: String,
    pub refresh_expires_at: u64,
    pub user_id: u64,
}
#[derive(Serialize)]
pub struct VaultStatus {
    pub exists: bool,
    pub unlocked: bool,
}
pub trait CredentialGuard {}
impl CredentialGuard for () {}
impl CredentialGuard for std::fs::File {}
pub trait CredentialStore: Send + Sync {
    fn lock(&self) -> Result<Box<dyn CredentialGuard>, String>;
    fn status(&self) -> Result<VaultStatus, String>;
    fn unlock(&self, password: &str) -> Result<(), String>;
    fn seal(&self) -> Result<(), String>;
    fn read(&self) -> Result<Option<Credential>, String>;
    fn write(&self, credential: &Credential) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    version: u8,
    kdf: String,
    client_id: String,
    salt: String,
    nonce: String,
    ciphertext: String,
}
struct SessionKey {
    salt: [u8; 16],
    key: Zeroizing<[u8; 32]>,
}
pub struct VaultStore {
    client_id: String,
    directory: Option<PathBuf>,
    key: Mutex<Option<SessionKey>>,
}
fn io_error() -> String {
    "GH_VAULT_IO: 无法读写 ThreadLine 加密凭据库。".into()
}
fn corrupt() -> String {
    "GH_VAULT_INVALID: 主密码不正确或凭据库已损坏。".into()
}
fn locked() -> String {
    "GH_VAULT_LOCKED: 请先解锁本地加密凭据库。".into()
}
impl VaultStore {
    pub fn new(client_id: String) -> Self {
        Self {
            client_id,
            directory: dirs::data_local_dir()
                .map(|p| p.join("io.chenmiaoi.threadline").join("vault")),
            key: Mutex::new(None),
        }
    }
    fn directory(&self) -> Result<&Path, String> {
        if !self.client_id.starts_with("Iv")
            || self.client_id.len() > 128
            || !self
                .client_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.')
        {
            return Err("GH_APP_NOT_CONFIGURED".into());
        }
        self.directory.as_deref().ok_or_else(io_error)
    }
    fn path(&self) -> Result<PathBuf, String> {
        Ok(self.directory()?.join(format!("{}.vault", self.client_id)))
    }
    fn envelope(&self) -> Result<Envelope, String> {
        let file = std::fs::File::open(self.path()?).map_err(|_| io_error())?;
        let mut bytes = Vec::new();
        file.take(MAX_VAULT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| io_error())?;
        if bytes.len() as u64 > MAX_VAULT_BYTES {
            return Err(corrupt());
        }
        let envelope: Envelope = serde_json::from_slice(&bytes).map_err(|_| corrupt())?;
        if envelope.version != 1 || envelope.kdf != KDF || envelope.client_id != self.client_id {
            return Err(corrupt());
        }
        Ok(envelope)
    }
    fn derive(password: &str, salt: [u8; 16]) -> Result<SessionKey, String> {
        if password.chars().count() < 12 || password.len() > 1024 {
            return Err(
                "GH_VAULT_PASSWORD: 主密码至少需要 12 个字符，且不能超过 1024 字节。".into(),
            );
        }
        let params = Params::new(65536, 3, 1, Some(32)).map_err(|_| "GH_VAULT_CRYPTO")?;
        let mut key = Zeroizing::new([0u8; 32]);
        Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
            .hash_password_into(password.as_bytes(), &salt, key.as_mut())
            .map_err(|_| "GH_VAULT_CRYPTO")?;
        Ok(SessionKey { salt, key })
    }
    fn aad(&self, salt: &str) -> String {
        format!("ThreadLine:vault:1:{KDF}:{}:{salt}", self.client_id)
    }
    fn decrypt(&self, envelope: &Envelope, key: &SessionKey) -> Result<Option<Credential>, String> {
        let salt = STANDARD.decode(&envelope.salt).map_err(|_| corrupt())?;
        if salt.as_slice() != key.salt {
            return Err(corrupt());
        }
        let nonce = STANDARD.decode(&envelope.nonce).map_err(|_| corrupt())?;
        let ciphertext = STANDARD
            .decode(&envelope.ciphertext)
            .map_err(|_| corrupt())?;
        if nonce.len() != 24 {
            return Err(corrupt());
        }
        let cipher = XChaCha20Poly1305::new_from_slice(key.key.as_ref()).map_err(|_| corrupt())?;
        let plaintext = Zeroizing::new(
            cipher
                .decrypt(
                    XNonce::from_slice(&nonce),
                    Payload {
                        msg: &ciphertext,
                        aad: self.aad(&envelope.salt).as_bytes(),
                    },
                )
                .map_err(|_| corrupt())?,
        );
        let credential: Option<Credential> =
            serde_json::from_slice(&plaintext).map_err(|_| corrupt())?;
        if credential
            .as_ref()
            .is_some_and(|c| c.client_id != self.client_id)
        {
            return Err(corrupt());
        }
        Ok(credential)
    }
    fn persist(&self, key: &SessionKey, credential: Option<&Credential>) -> Result<(), String> {
        if credential.is_some_and(|c| c.client_id != self.client_id) {
            return Err("GH_VAULT_IDENTITY".into());
        }
        let mut nonce = [0u8; 24];
        OsRng
            .try_fill_bytes(&mut nonce)
            .map_err(|_| "GH_VAULT_CRYPTO")?;
        let salt = STANDARD.encode(key.salt);
        let plaintext =
            Zeroizing::new(serde_json::to_vec(&credential).map_err(|_| "GH_VAULT_CRYPTO")?);
        let cipher =
            XChaCha20Poly1305::new_from_slice(key.key.as_ref()).map_err(|_| "GH_VAULT_CRYPTO")?;
        let ciphertext = cipher
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &plaintext,
                    aad: self.aad(&salt).as_bytes(),
                },
            )
            .map_err(|_| "GH_VAULT_CRYPTO")?;
        let envelope = Envelope {
            version: 1,
            kdf: KDF.into(),
            client_id: self.client_id.clone(),
            salt,
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(ciphertext),
        };
        let encoded = serde_json::to_vec(&envelope).map_err(|_| "GH_VAULT_CRYPTO")?;
        let directory = self.directory()?;
        std::fs::create_dir_all(directory).map_err(|_| io_error())?;
        let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|_| io_error())?;
        file.write_all(&encoded).map_err(|_| io_error())?;
        file.as_file().sync_all().map_err(|_| io_error())?;
        file.persist(self.path()?).map_err(|_| io_error())?;
        Ok(())
    }
    fn update(&self, credential: Option<&Credential>) -> Result<(), String> {
        let mut session = self.key.lock().map_err(|_| locked())?;
        let key = session.as_ref().ok_or_else(locked)?;
        let envelope = self.envelope()?;
        if STANDARD
            .decode(&envelope.salt)
            .map_err(|_| corrupt())?
            .as_slice()
            != key.salt
        {
            *session = None;
            return Err(locked());
        }
        // Verify the existing authentication tag before replacing any ciphertext.
        if let Err(error) = self.decrypt(&envelope, key) {
            *session = None;
            return Err(error);
        }
        self.persist(key, credential)
    }
}
impl CredentialStore for VaultStore {
    fn lock(&self) -> Result<Box<dyn CredentialGuard>, String> {
        use fs2::FileExt;
        let directory = self.directory()?;
        std::fs::create_dir_all(directory).map_err(|_| io_error())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
                .map_err(|_| io_error())?;
        }
        let mut options = std::fs::OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options
            .open(directory.join(format!("{}.lock", self.client_id)))
            .map_err(|_| io_error())?;
        file.lock_exclusive().map_err(|_| io_error())?;
        Ok(Box::new(file))
    }
    fn status(&self) -> Result<VaultStatus, String> {
        Ok(VaultStatus {
            exists: self.path()?.try_exists().map_err(|_| io_error())?,
            unlocked: self.key.lock().map_err(|_| locked())?.is_some(),
        })
    }
    fn unlock(&self, password: &str) -> Result<(), String> {
        let existing = self.path()?.try_exists().map_err(|_| io_error())?;
        let key = if existing {
            let envelope = self.envelope()?;
            let salt: [u8; 16] = STANDARD
                .decode(&envelope.salt)
                .map_err(|_| corrupt())?
                .try_into()
                .map_err(|_| corrupt())?;
            let key = Self::derive(password, salt)?;
            self.decrypt(&envelope, &key)?;
            key
        } else {
            let mut salt = [0u8; 16];
            OsRng
                .try_fill_bytes(&mut salt)
                .map_err(|_| "GH_VAULT_CRYPTO")?;
            let key = Self::derive(password, salt)?;
            self.persist(&key, None)?;
            key
        };
        *self.key.lock().map_err(|_| locked())? = Some(key);
        Ok(())
    }
    fn seal(&self) -> Result<(), String> {
        *self.key.lock().map_err(|_| locked())? = None;
        Ok(())
    }
    fn read(&self) -> Result<Option<Credential>, String> {
        let mut session = self.key.lock().map_err(|_| locked())?;
        let key = session.as_ref().ok_or_else(locked)?;
        let result = self.envelope().and_then(|e| self.decrypt(&e, key));
        if result.is_err() {
            *session = None;
        }
        result
    }
    fn write(&self, credential: &Credential) -> Result<(), String> {
        self.update(Some(credential))
    }
    fn clear(&self) -> Result<(), String> {
        self.update(None)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    #[derive(Default)]
    pub struct MemoryStore(pub Mutex<Option<Credential>>);
    impl CredentialStore for MemoryStore {
        fn lock(&self) -> Result<Box<dyn CredentialGuard>, String> {
            Ok(Box::new(()))
        }
        fn status(&self) -> Result<VaultStatus, String> {
            Ok(VaultStatus {
                exists: true,
                unlocked: true,
            })
        }
        fn unlock(&self, _: &str) -> Result<(), String> {
            Ok(())
        }
        fn seal(&self) -> Result<(), String> {
            Ok(())
        }
        fn read(&self) -> Result<Option<Credential>, String> {
            Ok(self.0.lock().unwrap().clone())
        }
        fn write(&self, c: &Credential) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(c.clone());
            Ok(())
        }
        fn clear(&self) -> Result<(), String> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }
    const PASSWORD: &str = "test-only vault master password";
    fn vault(directory: &Path, id: &str) -> VaultStore {
        VaultStore {
            client_id: id.into(),
            directory: Some(directory.into()),
            key: Mutex::new(None),
        }
    }
    fn credential() -> Credential {
        Credential {
            client_id: "Iv1.test".into(),
            access_token: "ghu_private-access-fixture".into(),
            refresh_token: "ghr_private-refresh-fixture".into(),
            expires_at: 9000,
            refresh_expires_at: 90000,
            user_id: 7,
        }
    }
    #[test]
    fn encrypted_vault_roundtrip_wrong_password_lock_restart_clear_and_no_plaintext() {
        let directory = tempfile::tempdir().unwrap();
        let store = vault(directory.path(), "Iv1.test");
        assert!(!store.status().unwrap().exists);
        assert!(store.read().is_err());
        {
            let _guard = store.lock().unwrap();
            store.unlock(PASSWORD).unwrap();
            store.write(&credential()).unwrap();
        }
        let first = std::fs::read_to_string(store.path().unwrap()).unwrap();
        assert!(!first.contains("ghu_"));
        assert!(!first.contains("ghr_"));
        assert!(!first.contains(PASSWORD));
        {
            let _guard = store.lock().unwrap();
            store.write(&credential()).unwrap();
        }
        let second = std::fs::read_to_string(store.path().unwrap()).unwrap();
        assert_ne!(first, second);
        store.seal().unwrap();
        assert!(!store.status().unwrap().unlocked);
        assert!(store.read().is_err());
        assert!(store.unlock("wrong test master password").is_err());
        assert!(!store.status().unwrap().unlocked);
        assert_eq!(
            std::fs::read_to_string(store.path().unwrap()).unwrap(),
            second
        );
        let restarted = vault(directory.path(), "Iv1.test");
        restarted.unlock(PASSWORD).unwrap();
        assert_eq!(restarted.read().unwrap().unwrap().user_id, 7);
        {
            let _guard = restarted.lock().unwrap();
            restarted.clear().unwrap();
        }
        assert!(restarted.read().unwrap().is_none());
        restarted.seal().unwrap();
        restarted.unlock(PASSWORD).unwrap();
        assert!(restarted.read().unwrap().is_none());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(store.path().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }
    #[test]
    fn tampered_ciphertext_is_rejected_without_overwriting_or_revealing_credentials() {
        let directory = tempfile::tempdir().unwrap();
        let store = vault(directory.path(), "Iv1.test");
        {
            let _guard = store.lock().unwrap();
            store.unlock(PASSWORD).unwrap();
            store.write(&credential()).unwrap();
        }
        let mut envelope = store.envelope().unwrap();
        let mut ciphertext = STANDARD.decode(&envelope.ciphertext).unwrap();
        ciphertext[0] ^= 1;
        envelope.ciphertext = STANDARD.encode(ciphertext);
        let bytes = serde_json::to_vec(&envelope).unwrap();
        std::fs::write(store.path().unwrap(), &bytes).unwrap();
        let error = store.read().err().unwrap();
        assert!(error.starts_with("GH_VAULT_INVALID"));
        assert!(!error.contains("ghu_"));
        assert!(!store.status().unwrap().unlocked);
        assert!(store.unlock(PASSWORD).is_err());
        assert_eq!(std::fs::read(store.path().unwrap()).unwrap(), bytes);
    }
    #[test]
    fn rejects_foreign_client_identity_and_unsafe_paths() {
        let directory = tempfile::tempdir().unwrap();
        let store = vault(directory.path(), "Iv1.test");
        {
            let _guard = store.lock().unwrap();
            store.unlock(PASSWORD).unwrap();
            store.write(&credential()).unwrap();
        }
        let other = vault(directory.path(), "Iv1.other");
        std::fs::copy(store.path().unwrap(), other.path().unwrap()).unwrap();
        assert!(other.unlock(PASSWORD).is_err());
        let unsafe_store = vault(directory.path(), "Iv1../../outside");
        assert!(unsafe_store.lock().is_err());
    }
    #[test]
    fn transaction_lock_excludes_other_handles_and_releases_on_drop() {
        use fs2::FileExt;
        let directory = tempfile::tempdir().unwrap();
        let store = vault(directory.path(), "Iv1.test");
        let first = store.lock().unwrap();
        let second = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(directory.path().join("Iv1.test.lock"))
            .unwrap();
        assert!(second.try_lock_exclusive().is_err());
        drop(first);
        second.try_lock_exclusive().unwrap();
    }
}
