// Notifiche.js
// Il Postino ufficiale di Movie Group 📬 (Versione Web Potenziata)

import { Platform } from 'react-native';
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

// 3. FUNZIONE PER REGISTRARE IL DISPOSITIVO (ORA ANCHE WEB!)
export async function registerForPushNotificationsAsync(userUid) {
  let token;

  // Configurazione Canale Android (obbligatorio per Android)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // Controllo se è un dispositivo fisico (o browser web)
  if (Device.isDevice || Platform.OS === 'web') {
    
    // A. Chiediamo il permesso
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Permesso notifiche mancante! L\'utente ha detto NO.');
      return null;
    }

    // B. Otteniamo il token (QUI C'È LA MODIFICA PER IL WEB!)
    try {
        const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        
        // ATTENZIONE: Incolla qui sotto la chiave presa da Firebase!
        token = (await Notifications.getExpoPushTokenAsync({ 
            projectId,
            vapidKey: 'BBpoRY7OZ2Hp4THgYaVg-KIvf4g7yDsrJSopbRPwcw9245mENTCVJfheBvDbEAhd7zLrLyb2GoFEJFefeCL9mBg' 
        })).data;
        
        console.log("Token ottenuto:", token);

        // Se abbiamo l'ID utente, salviamo subito il token nel DB
        if (userUid && token) {
             await updateDoc(doc(db, "users", userUid), {
                 expoPushToken: token
             });
             console.log("Token salvato nel profilo utente.");
        }

    } catch(e) {
        console.log("Errore recupero token:", e);
    }
  } else {
    console.log('Le notifiche push non funzionano su emulatori PC vecchi.');
  }

  return token;
}