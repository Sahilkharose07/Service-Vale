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
import { Query, Client, ID, Messaging } from 'appwrite';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Audio } from 'expo-av';
import styles from '../constants/userapp/notification';

const DATABASE_ID = '681c428b00159abb5e8b';
const COLLECTION_ID = 'admin_id';
const PROVIDER_ID = 'noti_id';
const TOPIC_ID = 'create_noti'; 

const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('681c428b00159abb5e8b'); 

const messaging = new Messaging(client);

const AdminNotificationPage = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [previousCount, setPreviousCount] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    const loadSound = async () => {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/notification.mp3')
      );
      soundRef.current = sound;
    };

    registerForPushNotificationsAsync();
    loadSound();

    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const registerForPushNotificationsAsync = async () => {
    try {
      if (!Device.isDevice) {
        Alert.alert('Error', 'Must use physical device for push notifications');
        return;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        Alert.alert('Error', 'Failed to get push token');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync();
      const pushToken = tokenData.data;

      await messaging.createTarget({
        providerId: PROVIDER_ID,
        identifier: pushToken,
        name: 'admin-device-' + ID.unique(),
        type: 'token',
        topicId: TOPIC_ID,
      });
    } catch (error) {
      console.error('Push registration failed:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
        Query.orderDesc('$createdAt'),
      ]);

      const newNotifications = res.documents.filter((doc) => !doc.isRead);

      if (newNotifications.length > previousCount) {
        playNotificationSound();
      }

      setNotifications(newNotifications);
      setPreviousCount(newNotifications.length);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch notifications');
    } finally {
      setRefreshing(false);
    }
  };

  const playNotificationSound = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.replayAsync();
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

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.notificationCard}>
      <View style={styles.notificationHeader}>
        <Ionicons name="notifications" size={20} color="#5E72E4" />
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
        {notifications.length > 0 ? (
          <TouchableOpacity onPress={deleteAllNotifications}>
            <MaterialIcons name="delete" size={24} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
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
            <Text style={styles.noNotificationText}>No new notifications</Text>
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
