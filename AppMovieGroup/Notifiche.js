// Notifiche.js
// Il Postino ufficiale di Movie Group 📬 (Versione con Sonda Diagnostica)

import { Platform, Alert } from 'react-native'; // <-- Aggiunto Alert
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from './firebaseConfig';

// 1. CONFIGURAZIONE COMPORTAMENTO (Suoni, badge, alert)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// 2. FUNZIONE PER INVIARE NOTIFICHE
export async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken) {
      console.log("Tentativo invio notifica fallito: Nessun token fornito.");
      return;
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      console.log(`📬 Notifica inviata a: ${title}`);
  } catch (error) {
      console.log("❌ Errore invio notifica:", error);
  }
}

// 3. FUNZIONE PER REGISTRARE IL DISPOSITIVO E DIAGNOSI
export async function registerForPushNotificationsAsync(userUid) {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice || Platform.OS === 'web') {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    try {
        // IL CUORE DEL PROBLEMA: RECUPERO PROJECT ID
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

        // 🚨 SONDA DIAGNOSTICA 1: Manca il Project ID?
        if (!projectId && Platform.OS !== 'web') {
             Alert.alert("🚨 ALLERTA SISTEMA", "Manca il Project ID di Expo! L'app non sa a chi intestare le notifiche. Segnala questo errore.");
        }

        // TENTATIVO DI GENERAZIONE TARGA
        token = (await Notifications.getExpoPushTokenAsync({
            projectId: projectId,
            vapidKey: 'BBpoRY7OZ2Hp4THgYaVg-KIvf4g7yDsrJSopbRPwcw9245mENTCVJfheBvDbEAhd7zLrLyb2GoFEJFefeCL9mBg'
        })).data;

        // SE FUNZIONA, SALVA SU FIREBASE
        if (userUid && token) {
             await updateDoc(doc(db, "users", userUid), {
                 expoPushToken: token
             });
        }

    } catch(e) {
        // 🚨 SONDA DIAGNOSTICA 2: Crash del motore
        if (Platform.OS !== 'web') {
            Alert.alert("🚨 CRASH MOTORE NOTIFICHE", `L'app ha bloccato le notifiche per questo errore interno:\n\n${e.message}\n\nFai uno screenshot e segnalalo!`);
        }
    }
  } else {
    if (Platform.OS !== 'web') {
         Alert.alert("Avviso", "Usa un telefono vero. I simulatori non ricevono notifiche.");
    }
  }

  return token;
}