// lib/pushNotificationConfig.js
import PushNotification from 'react-native-push-notification';
import { Platform } from 'react-native';

PushNotification.configure({
  onNotification: function (notification) {
    console.log('LOCAL NOTIFICATION:', notification);
  },
  requestPermissions: Platform.OS === 'ios',
});

export const showLocalNotification = (title, message) => {
  PushNotification.localNotification({
    title,
    message,
    playSound: true,
    soundName: 'default',
    importance: 'high',
    vibrate: true,
  });
};
