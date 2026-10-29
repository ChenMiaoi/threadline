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
    sync::Arc,
};
use zeroize::Zeroizing;

const MAX_VAULT_BYTES: u64 = 64 * 1024;
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
pub trait CredentialGuard {}
impl CredentialGuard for () {}
impl CredentialGuard for std::fs::File {}
pub trait CredentialStore: Send + Sync {
    fn lock(&self) -> Result<Box<dyn CredentialGuard>, String>;
    fn read(&self) -> Result<Option<Credential>, String>;
    fn write(&self, credential: &Credential) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}
// The application owns the ciphertext; the OS protects its random encryption key.
// Keeping this boundary injectable allows restart/failure tests without touching a user's keychain.
trait VaultKeys: Send + Sync {
    fn read(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String>;
    fn write(&self, key: &[u8]) -> Result<(), String>;
    fn clear(&self) -> Result<(), String>;
}
struct NativeKeys {
    client_id: String,
}
fn secure_error() -> String {
    "GH_SECURE_STORAGE: 无法访问 ThreadLine 的系统安全存储，请允许本应用访问后重试。".into()
}
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl NativeKeys {
    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new("io.chenmiaoi.threadline.vault-key.v2", &self.client_id)
            .map_err(|_| secure_error())
    }
}
#[cfg(any(target_os = "macos", target_os = "windows"))]
impl VaultKeys for NativeKeys {
    fn read(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
        match self.entry()?.get_secret() {
            Ok(key) => Ok(Some(Zeroizing::new(key))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(secure_error()),
        }
    }
    fn write(&self, key: &[u8]) -> Result<(), String> {
        self.entry()?.set_secret(key).map_err(|_| secure_error())
    }
    fn clear(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(secure_error()),
        }
    }
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl VaultKeys for NativeKeys {
    fn read(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
        let _ = &self.client_id;
        Err(secure_error())
    }
    fn write(&self, _: &[u8]) -> Result<(), String> {
        Err(secure_error())
    }
    fn clear(&self) -> Result<(), String> {
        Err(secure_error())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    version: u8,
    client_id: String,
    nonce: String,
    ciphertext: String,
}
pub struct VaultStore {
    client_id: String,
    directory: Option<PathBuf>,
    keys: Arc<dyn VaultKeys>,
}
fn io_error() -> String {
    "GH_VAULT_IO: 无法读写 ThreadLine 加密凭据库。".into()
}
fn corrupt() -> String {
    "GH_VAULT_INVALID: 本地登录凭据已损坏，请退出登录后重新授权。".into()
}
impl VaultStore {
    pub fn new(client_id: String) -> Self {
        Self {
            keys: Arc::new(NativeKeys {
                client_id: client_id.clone(),
            }),
            client_id,
            directory: dirs::data_local_dir()
                .map(|p| p.join("io.chenmiaoi.threadline").join("vault")),
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
        Ok(self
            .directory()?
            .join(format!("{}.session.vault", self.client_id)))
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
        if envelope.version != 2 || envelope.client_id != self.client_id {
            return Err(corrupt());
        }
        Ok(envelope)
    }
    fn aad(&self) -> String {
        format!("ThreadLine:session-vault:2:{}", self.client_id)
    }
    fn key(&self) -> Result<Zeroizing<Vec<u8>>, String> {
        self.keys
            .read()?
            .filter(|k| k.len() == 32)
            .ok_or_else(secure_error)
    }
    fn decrypt(&self, envelope: &Envelope, key: &[u8]) -> Result<Credential, String> {
        let nonce = STANDARD.decode(&envelope.nonce).map_err(|_| corrupt())?;
        let ciphertext = STANDARD
            .decode(&envelope.ciphertext)
            .map_err(|_| corrupt())?;
        if nonce.len() != 24 {
            return Err(corrupt());
        }
        let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| secure_error())?;
        let plaintext = Zeroizing::new(
            cipher
                .decrypt(
                    XNonce::from_slice(&nonce),
                    Payload {
                        msg: &ciphertext,
                        aad: self.aad().as_bytes(),
                    },
                )
                .map_err(|_| corrupt())?,
        );
        let credential: Credential = serde_json::from_slice(&plaintext).map_err(|_| corrupt())?;
        if credential.client_id != self.client_id {
            return Err(corrupt());
        }
        Ok(credential)
    }
    fn persist(&self, key: &[u8], credential: &Credential) -> Result<(), String> {
        let mut nonce = [0u8; 24];
        OsRng
            .try_fill_bytes(&mut nonce)
            .map_err(|_| "GH_VAULT_CRYPTO")?;
        let plaintext =
            Zeroizing::new(serde_json::to_vec(credential).map_err(|_| "GH_VAULT_CRYPTO")?);
        let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| secure_error())?;
        let ciphertext = cipher
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: &plaintext,
                    aad: self.aad().as_bytes(),
                },
            )
            .map_err(|_| "GH_VAULT_CRYPTO")?;
        let envelope = Envelope {
            version: 2,
            client_id: self.client_id.clone(),
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(ciphertext),
        };
        let encoded = serde_json::to_vec(&envelope).map_err(|_| "GH_VAULT_CRYPTO")?;
        let mut file =
            tempfile::NamedTempFile::new_in(self.directory()?).map_err(|_| io_error())?;
        file.write_all(&encoded).map_err(|_| io_error())?;
        file.as_file().sync_all().map_err(|_| io_error())?;
        file.persist(self.path()?).map_err(|_| io_error())?;
        Ok(())
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
    fn read(&self) -> Result<Option<Credential>, String> {
        // A fresh install never touches the keychain or asks for a password.
        if !self.path()?.try_exists().map_err(|_| io_error())? {
            return Ok(None);
        }
        let envelope = self.envelope()?;
        self.decrypt(&envelope, &self.key()?).map(Some)
    }
    fn write(&self, credential: &Credential) -> Result<(), String> {
        if credential.client_id != self.client_id {
            return Err("GH_VAULT_IDENTITY".into());
        }
        if self.path()?.try_exists().map_err(|_| io_error())? {
            let key = self.key()?;
            // Do not overwrite a damaged vault or silently replace a missing key.
            self.decrypt(&self.envelope()?, &key)?;
            return self.persist(&key, credential);
        }
        let (key, created) = match self.keys.read()? {
            Some(key) if key.len() == 32 => (key, false),
            Some(_) => return Err(secure_error()),
            None => {
                let mut key = Zeroizing::new(vec![0u8; 32]);
                OsRng
                    .try_fill_bytes(&mut key)
                    .map_err(|_| "GH_VAULT_CRYPTO")?;
                self.keys.write(&key)?;
                (key, true)
            }
        };
        let result = self.persist(&key, credential);
        if result.is_err() && created {
            let _ = self.keys.clear();
        }
        result
    }
    fn clear(&self) -> Result<(), String> {
        match std::fs::remove_file(self.path()?) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(io_error()),
        }
        self.keys.clear()
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::sync::Mutex;
    #[derive(Default)]
    pub struct MemoryStore(pub Mutex<Option<Credential>>);
    impl CredentialStore for MemoryStore {
        fn lock(&self) -> Result<Box<dyn CredentialGuard>, String> {
            Ok(Box::new(()))
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
    #[derive(Default)]
    struct TestKeys {
        key: Mutex<Option<Vec<u8>>>,
        fail: Mutex<bool>,
    }
    impl VaultKeys for TestKeys {
        fn read(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
            if *self.fail.lock().unwrap() {
                return Err(secure_error());
            }
            Ok(self.key.lock().unwrap().clone().map(Zeroizing::new))
        }
        fn write(&self, key: &[u8]) -> Result<(), String> {
            if *self.fail.lock().unwrap() {
                return Err(secure_error());
            }
            *self.key.lock().unwrap() = Some(key.to_vec());
            Ok(())
        }
        fn clear(&self) -> Result<(), String> {
            *self.key.lock().unwrap() = None;
            Ok(())
        }
    }
    fn vault(directory: &Path, id: &str, keys: Arc<TestKeys>) -> VaultStore {
        VaultStore {
            client_id: id.into(),
            directory: Some(directory.into()),
            keys,
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
    fn remembers_login_after_restart_without_a_password_and_logout_removes_both_parts() {
        let directory = tempfile::tempdir().unwrap();
        let keys = Arc::new(TestKeys::default());
        let store = vault(directory.path(), "Iv1.test", keys.clone());
        assert!(store.read().unwrap().is_none());
        {
            let _guard = store.lock().unwrap();
            store.write(&credential()).unwrap();
        }
        let first = std::fs::read_to_string(store.path().unwrap()).unwrap();
        assert!(!first.contains("ghu_"));
        assert!(!first.contains("ghr_"));
        assert!(!first.contains(&STANDARD.encode(keys.key.lock().unwrap().as_ref().unwrap())));
        {
            let _guard = store.lock().unwrap();
            store.write(&credential()).unwrap();
        }
        assert_ne!(
            first,
            std::fs::read_to_string(store.path().unwrap()).unwrap()
        );
        let restarted = vault(directory.path(), "Iv1.test", keys.clone());
        assert_eq!(restarted.read().unwrap().unwrap().user_id, 7);
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
        {
            let _guard = restarted.lock().unwrap();
            restarted.clear().unwrap();
        }
        assert!(keys.key.lock().unwrap().is_none());
        assert!(store.read().unwrap().is_none());
        assert!(vault(directory.path(), "Iv1.test", keys)
            .read()
            .unwrap()
            .is_none());
    }
    #[test]
    fn unavailable_or_missing_key_never_erases_or_overwrites_saved_credentials() {
        let directory = tempfile::tempdir().unwrap();
        let keys = Arc::new(TestKeys::default());
        let store = vault(directory.path(), "Iv1.test", keys.clone());
        {
            let _guard = store.lock().unwrap();
            store.write(&credential()).unwrap();
        }
        let bytes = std::fs::read(store.path().unwrap()).unwrap();
        *keys.fail.lock().unwrap() = true;
        assert!(store.read().is_err());
        assert!(store.write(&credential()).is_err());
        *keys.fail.lock().unwrap() = false;
        assert_eq!(store.read().unwrap().unwrap().user_id, 7);
        keys.clear().unwrap();
        assert!(store.read().is_err());
        assert!(store.write(&credential()).is_err());
        assert!(keys.key.lock().unwrap().is_none());
        assert_eq!(std::fs::read(store.path().unwrap()).unwrap(), bytes);
    }
    #[test]
    fn cannot_create_a_plaintext_or_memory_fallback_when_key_storage_fails() {
        let directory = tempfile::tempdir().unwrap();
        let keys = Arc::new(TestKeys::default());
        *keys.fail.lock().unwrap() = true;
        let store = vault(directory.path(), "Iv1.test", keys);
        assert!(store.read().unwrap().is_none());
        let _guard = store.lock().unwrap();
        assert!(store.write(&credential()).is_err());
        assert!(!store.path().unwrap().exists());
    }
    #[test]
    fn rejects_tampering_foreign_identity_and_unsafe_paths_without_overwriting() {
        let directory = tempfile::tempdir().unwrap();
        let keys = Arc::new(TestKeys::default());
        let store = vault(directory.path(), "Iv1.test", keys.clone());
        {
            let _guard = store.lock().unwrap();
            store.write(&credential()).unwrap();
        }
        let other = vault(directory.path(), "Iv1.other", keys.clone());
        std::fs::copy(store.path().unwrap(), other.path().unwrap()).unwrap();
        assert!(other.read().is_err());
        let mut envelope = store.envelope().unwrap();
        let mut ciphertext = STANDARD.decode(&envelope.ciphertext).unwrap();
        ciphertext[0] ^= 1;
        envelope.ciphertext = STANDARD.encode(ciphertext);
        let bytes = serde_json::to_vec(&envelope).unwrap();
        std::fs::write(store.path().unwrap(), &bytes).unwrap();
        assert!(store.read().is_err());
        assert!(store.write(&credential()).is_err());
        assert_eq!(std::fs::read(store.path().unwrap()).unwrap(), bytes);
        assert!(vault(directory.path(), "Iv1../../outside", keys)
            .lock()
            .is_err());
    }
    #[test]
    fn transaction_lock_excludes_other_handles_and_releases_on_drop() {
        use fs2::FileExt;
        let directory = tempfile::tempdir().unwrap();
        let store = vault(directory.path(), "Iv1.test", Arc::new(TestKeys::default()));
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
