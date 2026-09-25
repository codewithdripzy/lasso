let permissionRequest: Promise<NotificationPermission> | null = null;

export function requestAgentNotificationPermission(): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "default" || permissionRequest) return;
  permissionRequest = Notification.requestPermission().finally(() => {
    permissionRequest = null;
  });
}

export async function notifyAgent(title: string, body: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  let permission = Notification.permission;
  if (permission === "default") permission = await (permissionRequest || Notification.requestPermission());
  if (permission !== "granted") return;
  try {
    const notification = new Notification(title, { body: body.slice(0, 240) });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Notifications are optional; the in-overlay status remains authoritative.
  }
}
