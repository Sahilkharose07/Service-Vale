import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { databases } from '../lib/appwrite';
import { Query, Client, ID } from 'appwrite';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Audio } from 'expo-av';
import styles from '../constants/userapp/notification';


// Appwrite configuration
const DATABASE_ID = '681c428b00159abb5e8b';
const COLLECTION_ID = 'admin_id';
const PROVIDER_ID = 'noti_id'; // Verify this matches your Appwrite provider
const TOPIC_ID = 'create_noti'; 

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('681c428b00159abb5e8b')


const messaging = new Messaging(client);

// Configure notification handler

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  }),
}); 

const AdminNotificationPage = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [previousCount, setPreviousCount] = useState(0);
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const soundRef = useRef<Audio.Sound | null>(null);
 const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) setExpoPushToken(token);
    });

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      fetchNotifications();
      playNotificationSound();
    });

    // Listen for notification responses
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
    });

    // Initial fetch
    fetchNotifications();

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const registerForPushNotificationsAsync = async () => {
    try {
      console.log('Starting push notification registration...');
      
      if (!Device.isDevice) {
        console.log('Must use physical device!');
        Alert.alert('Error', 'Must use physical device for push notifications');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      console.log('Existing permission status:', existingStatus);
      
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        console.log('Requested permission status:', status);
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Permission not granted!');
        Alert.alert('Error', 'Failed to get push token');
        return null;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenData.data;
      console.log('Expo push token:', pushToken);

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // Register with Appwrite
      try {
        console.log('Creating Appwrite target with:', {
          providerId: PROVIDER_ID,
          identifier: pushToken,
          topicId: TOPIC_ID
        });

        const target = await messaging.createTarget({
          providerId: PROVIDER_ID,
          identifier: pushToken,
          name: 'admin-device-' + ID.unique(),
          type: 'token',
          topicId: TOPIC_ID,
        });

        console.log('Appwrite target created:', target);
      } catch (appwriteError) {
        console.error('Appwrite target creation failed:', appwriteError);
      }

      return pushToken;
    } catch (error) {
      console.error('Push registration failed:', error);
      return null;
    }
  };

  const fetchNotifications = async () => {
    try {
      setRefreshing(true);
      const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.orderDesc('$createdAt'),
      ]);

      const newNotifications = res.documents.filter((doc) => !doc.isRead);
      console.log('Fetched notifications:', newNotifications.length);

      if (newNotifications.length > previousCount) {
        playNotificationSound();
      }

      setNotifications(res.documents); // Show all notifications, not just unread
      setPreviousCount(newNotifications.length);
    } catch (error) {
      console.error('Fetch error:', error);
      Alert.alert('Error', 'Failed to fetch notifications');
    } finally {
      setRefreshing(false);
    }
  };

  const playNotificationSound = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.replayAsync();
      } else {
        const { sound } = await Audio.Sound.createAsync(
          require('../assets/sounds/notification.mp3')
        );
        soundRef.current = sound;
        await soundRef.current.playAsync();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.log('Error playing sound', error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await databases.updateDocument(DATABASE_ID, COLLECTION_ID, id, {
        isRead: true,
      });
      fetchNotifications();
    } catch (error) {
      Alert.alert('Error', 'Failed to mark as read');
    }
  };

  const deleteAllNotifications = async () => {
    Alert.alert('Delete All Notifications', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const deletePromises = notifications.map((notification) =>
              databases.deleteDocument(DATABASE_ID, COLLECTION_ID, notification.$id)
            );
            await Promise.all(deletePromises);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            fetchNotifications();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete notifications');
          }
        },
      },
    ]);
  };

  const sendTestNotification = async () => {
    try {
      if (!expoPushToken) {
        Alert.alert('Error', 'No push token available');
        return;
      }

      console.log('Sending test notification to:', expoPushToken);
      
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: expoPushToken,
          title: 'Test Notification',
          body: 'This is a test notification from your app!',
          sound: 'default',
        }),
      });

      const result = await response.json();
      console.log('Test notification result:', result);

      if (response.ok) {
        Alert.alert('Success', 'Test notification sent!');
      } else {
        Alert.alert('Error', result.message || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const renderItem = ({ item }: { item: any }) => (
    <View style={[styles.notificationCard, !item.isRead && styles.unreadCard]}>
      <View style={styles.notificationHeader}>
        <Ionicons name="notifications" size={20} color="#5E72E4" />
        {!item.isRead && <View style={styles.unreadBadge} />}
      </View>
      <Text style={styles.description}>{item.description}</Text>
      <View style={styles.footer}>
        <Text style={styles.time}>
          {new Date(item.$createdAt).toLocaleString()}
        </Text>
        <TouchableOpacity onPress={() => markAsRead(item.$id)} style={styles.dismissButton}>
          <Text style={styles.close}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/home')}>
          <MaterialIcons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={sendTestNotification} style={styles.testButton}>
            <MaterialIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
          {notifications.length > 0 && (
            <TouchableOpacity onPress={deleteAllNotifications}>
              <MaterialIcons name="delete" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5E72E4" />
        }
      >
        {notifications.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off" size={48} color="#ccc" />
            <Text style={styles.noNotificationText}>No notifications</Text>
            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
          </View>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={notifications}
            keyExtractor={(item) => item.$id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContainer}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default AdminNotificationPage;