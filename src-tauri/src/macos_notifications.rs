use block2::{DynBlock, RcBlock};
use objc2::{define_class, msg_send, rc::Retained, runtime::ProtocolObject, ClassType};
use objc2_foundation::{NSBundle, NSError, NSObject, NSObjectProtocol, NSString, NSUUID};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNMutableNotificationContent, UNNotification,
    UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationSettings,
    UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};
use std::{cell::OnceCell, ptr::NonNull, sync::mpsc, time::Duration};

// The delegate has no mutable state and may be called from the system's notification queue.
define_class!(
    #[unsafe(super = NSObject)]
    struct NotificationDelegate;

    unsafe impl NSObjectProtocol for NotificationDelegate {}

    unsafe impl UNUserNotificationCenterDelegate for NotificationDelegate {
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion
                .call((UNNotificationPresentationOptions::Banner
                    | UNNotificationPresentationOptions::List,));
        }
    }
);

thread_local! {
    // UNUserNotificationCenter keeps only a weak reference; the app's main thread owns it.
    static DELEGATE: OnceCell<Retained<NotificationDelegate>> = const { OnceCell::new() };
}

pub fn setup() {
    if NSBundle::mainBundle().bundleIdentifier().is_none() {
        return;
    }
    DELEGATE.with(|cell| {
        let delegate = cell.get_or_init(|| {
            // NSObject's initializer is valid for this stateless subclass.
            unsafe { msg_send![NotificationDelegate::class(), new] }
        });
        UNUserNotificationCenter::currentNotificationCenter()
            .setDelegate(Some(ProtocolObject::from_ref(&**delegate)));
    });
}

fn center() -> Result<Retained<UNUserNotificationCenter>, String> {
    if NSBundle::mainBundle().bundleIdentifier().is_none() {
        return Err("请在安装的 ThreadLine 桌面程序中测试系统通知。".into());
    }
    Ok(UNUserNotificationCenter::currentNotificationCenter())
}

fn permitted(status: UNAuthorizationStatus) -> bool {
    matches!(
        status,
        UNAuthorizationStatus::Authorized | UNAuthorizationStatus::Provisional
    )
}

fn permission(request: bool) -> Result<bool, String> {
    let center = center()?;
    let (send, receive) = mpsc::channel();
    let callback = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        // The system lends settings for the lifetime of this callback.
        let status = unsafe { settings.as_ref() }.authorizationStatus();
        let _ = send.send(status);
    });
    center.getNotificationSettingsWithCompletionHandler(&callback);
    let status = receive
        .recv_timeout(Duration::from_secs(10))
        .map_err(|_| "读取系统通知权限超时，请重试。".to_owned())?;
    if permitted(status) || !request || status != UNAuthorizationStatus::NotDetermined {
        return Ok(permitted(status));
    }
    let (send, receive) = mpsc::channel();
    let callback = RcBlock::new(move |granted: objc2::runtime::Bool, error: *mut NSError| {
        // NSError is optional and valid only during the completion callback.
        let result = unsafe { error.as_ref() }.map_or_else(
            || Ok(granted.as_bool()),
            |error| Err(error.localizedDescription().to_string()),
        );
        let _ = send.send(result);
    });
    center.requestAuthorizationWithOptions_completionHandler(
        UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
        &callback,
    );
    receive
        .recv_timeout(Duration::from_secs(120))
        .map_err(|_| "等待通知权限超时，请完成系统授权后重试。".to_owned())?
}

#[tauri::command]
pub async fn macos_notification_permission(request: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || permission(request))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn macos_notify(title: String, body: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !permission(false)? {
            return Err("系统通知权限不可用，请在通知设置中重新开启桌面通知。".into());
        }
        let content = UNMutableNotificationContent::new();
        content.setTitle(&NSString::from_str(&title));
        content.setBody(&NSString::from_str(&body));
        let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
            &NSUUID::new().UUIDString(),
            &content,
            None,
        );
        let (send, receive) = mpsc::channel();
        let callback = RcBlock::new(move |error: *mut NSError| {
            // The completion's NSError is borrowed from UserNotifications.
            let result = unsafe { error.as_ref() }.map_or(Ok(()), |error| {
                Err(error.localizedDescription().to_string())
            });
            let _ = send.send(result);
        });
        center()?.addNotificationRequest_withCompletionHandler(&request, Some(&callback));
        receive
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| "发送系统通知超时，请重试。".to_owned())?
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permission_policy_rejects_denied_pending_and_unknown_states() {
        assert!(permitted(UNAuthorizationStatus::Authorized));
        assert!(permitted(UNAuthorizationStatus::Provisional));
        assert!(!permitted(UNAuthorizationStatus::Denied));
        assert!(!permitted(UNAuthorizationStatus::NotDetermined));
        assert!(!permitted(UNAuthorizationStatus(99)));
    }
}
