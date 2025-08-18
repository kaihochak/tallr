import { 
  isPermissionGranted, 
  requestPermission, 
  sendNotification 
} from '@tauri-apps/plugin-notification';
import { invoke } from '@tauri-apps/api/core';

export interface NotificationPayload {
  title: string;
  body: string;
}

class NotificationService {
  private permissionGranted: boolean = false;

  async initialize(): Promise<void> {
    try {
      this.permissionGranted = await isPermissionGranted();
      
      if (!this.permissionGranted) {
        const permission = await requestPermission();
        this.permissionGranted = permission === 'granted';
      }
    } catch (error) {
      console.error('Failed to initialize notifications:', error);
      this.permissionGranted = false;
    }
  }

  async showNotification(payload: NotificationPayload): Promise<void> {
    if (!this.permissionGranted) {
      console.warn('Notification permission not granted');
      return;
    }

    try {
      await sendNotification(payload);
    } catch (error) {
      console.error('Failed to send notification via plugin, trying Rust command:', error);
      try {
        await invoke('send_notification', {
          title: payload.title,
          body: payload.body
        });
      } catch (rustError) {
        console.error('Failed to send notification via Rust command:', rustError);
      }
    }
  }

  isEnabled(): boolean {
    return this.permissionGranted;
  }
}

export const notificationService = new NotificationService();