import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert, Platform, StatusBar, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { collection, query, where, doc, updateDoc, getDoc, onSnapshot } from 'firebase/firestore';
import * as Location from 'expo-location';

// --- 1. DEFINIZIONE DEI DUE TEMI (DARK & LIGHT) ---
const ColorSchemes = {
    dark: {
        background: '#000000',
        surface: '#1C1C1E',
        primary: '#4CAF50', // Verde
        accent: '#0A84FF',  // Blu
        textMain: '#FFFFFF',
        textSub: '#8E8E93',
        border: '#2C2C2E',
        error: '#FF453A',
        cyan: '#00D1FF',
        yellow: '#EAB308',
        isDark: true
    },
    light: {
        background: '#F2F2F7', // Grigio chiarissimo tipico iOS
        surface: '#FFFFFF',    // Bianco puro per le card
        primary: '#34C759',    // Verde leggermente più scuro per contrasto
        accent: '#007AFF',     // Blu standard
        textMain: '#000000',   // Testo Nero
        textSub: '#6E6E73',    // Testo Grigio scuro
        border: '#D1D1D6',     // Bordi grigi chiari
        error: '#FF3B30',
        cyan: '#00ACD7',       // Ciano più leggibile su bianco
        yellow: '#D4A017',     // Giallo più scuro
        isDark: false
    }
};

export default function CollaboratorHome({ onNavigateHistory }) {
  // STATO DEL TEMA: Parte in 'dark', ma può cambiare
  const [theme, setTheme] = useState('dark');
  const Colors = ColorSchemes[theme]; // Seleziona i colori giusti
 
  // Funzione per cambiare tema
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const [invites, setInvites] = useState([]);
  const [myShifts, setMyShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Otteniamo gli stili dinamici in base ai colori correnti
  const styles = getStyles(Colors);

  // Orologio
  useEffect(() => {
      const timer = setInterval(() => setCurrentTime(new Date()), 1000);
      return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    Alert.alert("Logout", "Vuoi uscire?", [{ text: "No", style: "cancel" }, { text: "Esci", style: "destructive", onPress: async () => await signOut(auth) }]);
  };

  // Caricamento Dati
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setLoading(true);

    getDoc(doc(db, "users", currentUser.uid)).then(docSnap => {
        if(docSnap.exists()) setUser(docSnap.data());
    });

    const qInvites = query(collection(db, "shifts"), where("collaboratorId", "==", currentUser.uid), where("status", "==", "assegnato"));
    const unsubInvites = onSnapshot(qInvites, (snap) => {
        setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    });

    const qMyShifts = query(collection(db, "shifts"), where("collaboratorId", "==", currentUser.uid), where("status", "in", ["accettato", "in-corso"]));
    const unsubShifts = onSnapshot(qMyShifts, (snap) => {
        setMyShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
    });

    return () => { unsubInvites(); unsubShifts(); };
  }, []);

  const handleAccept = async (invite) => {
    try { await updateDoc(doc(db, "shifts", invite.id), { status: "accettato" }); }
    catch (e) { Alert.alert("Errore", "Impossibile accettare."); }
  };

  const handleDecline = async (id) => {
    try { await updateDoc(doc(db, "shifts", id), { status: "rifiutato" }); }
    catch (e) { Alert.alert("Errore", "Impossibile rifiutare."); }
  };

  const getShiftDates = (dateStr, timeStr) => {
      if(!dateStr || !timeStr) return new Date();
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes, 0);
  };

  const isShiftTimeValid = (dateStr, startTimeStr) => {
      try {
          const start = getShiftDates(dateStr, startTimeStr);
          const windowOpen = new Date(start.getTime() - 3600000);
          return new Date() >= windowOpen;
      } catch (e) { return false; }
  };

  const handleStartShift = async (shift) => {
      setLoadingLocation(true);
      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') { Alert.alert("Errore", "Serve il GPS per timbrare."); setLoadingLocation(false); return; }
         
          let loc = await Location.getCurrentPositionAsync({});
          const realStartISO = new Date().toISOString();
         
          await updateDoc(doc(db, "shifts", shift.id), {
              status: 'in-corso',
              realStartTime: realStartISO,
              startLocation: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
          });
      } catch (e) { Alert.alert("Errore GPS", "Assicurati di avere il GPS attivo."); }
      finally { setLoadingLocation(false); }
  };

  useEffect(() => {
    const checkAutoEnd = () => {
        const now = new Date();
        myShifts.forEach(async (shift) => {
            if (shift.status === 'in-corso') {
                const end = getShiftDates(shift.date, shift.endTime);
                if (now >= new Date(end.getTime() + 900000)) {
                    try {
                        await updateDoc(doc(db, "shifts", shift.id), { status: 'completato', realEndTime: new Date().toISOString() });
                    } catch(e) { console.log("Auto-close fail", e); }
                }
            }
        });
    };
    const interval = setInterval(checkAutoEnd, 10000);
    return () => clearInterval(interval);
  }, [myShifts]);

  const renderDynamicTimer = (shift) => {
      const scheduledStart = getShiftDates(shift.date, shift.startTime);
      const now = currentTime;
      const realStart = shift.realStartTime ? new Date(shift.realStartTime) : scheduledStart;
      const effectivePayStart = realStart > scheduledStart ? realStart : scheduledStart;

      if (now < scheduledStart) {
          return (
              <View style={styles.timerYellow}>
                  <Text style={styles.timerTextYellow}>⏳ PRESENZA REGISTRATA</Text>
                  <Text style={styles.timerSubText}>In attesa orario inizio...</Text>
              </View>
          );
      }
     
      const diffMs = now - effectivePayStart;
      const hours = Math.floor(diffMs / 1000 / 60 / 60);
      const minutes = Math.floor((diffMs / 1000 / 60) % 60);
      const seconds = Math.floor((diffMs / 1000) % 60);

      return (
          <View style={styles.timerGreen}>
              <Text style={styles.timerTextGreen}>✅ AL LAVORO DA:</Text>
              <Text style={styles.timerBigText}>{hours}h {minutes}m {seconds}s</Text>
              <Text style={styles.timerSubText}>Fine turno prevista: {shift.endTime}</Text>
          </View>
      );
  };

  if (loading) return <View style={[styles.safeArea, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color={Colors.cyan}/></View>;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* La StatusBar cambia colore del testo in base al tema */}
      <StatusBar barStyle={theme === 'dark' ? "light-content" : "dark-content"} backgroundColor={Colors.background} />
     
      <View style={styles.headerContainer}>
        <View>
            <Text style={styles.welcomeText}>{user?.firstName ? `Ciao, ${user.firstName}` : "Home Staff"}</Text>
            <Text style={styles.subHeader}>Pronto a lavorare?</Text>
        </View>
        <View style={styles.headerActions}>
            {/* TASTO CAMBIO TEMA (SOLE/LUNA) */}
            <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
                <Feather name={theme === 'dark' ? "sun" : "moon"} size={22} color={Colors.textMain} />
            </TouchableOpacity>
           
            <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
                <Feather name="log-out" size={22} color={Colors.error} />
            </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
       
        {/* WIDGET STORICO */}
        <TouchableOpacity
            style={styles.historyWidget}
            onPress={() => onNavigateHistory ? onNavigateHistory() : Alert.alert("Info", "Funzione storico in arrivo")}
        >
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles.iconCircle, {backgroundColor: Colors.cyan + '20'}]}>
                    <Feather name="clock" size={24} color={Colors.cyan} />
                </View>
                <View style={{marginLeft: 15}}>
                    <Text style={styles.widgetTitle}>Storico Turni</Text>
                    <Text style={styles.widgetSubtitle}>Vedi i tuoi turni completati</Text>
                </View>
            </View>
            <Feather name="chevron-right" size={24} color={Colors.textSub} />
        </TouchableOpacity>

        {/* INVITI */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>NUOVI INVITI ({invites.length})</Text>
            {invites.length === 0 ? (
                <View style={styles.emptyBox}>
                    <Feather name="inbox" size={30} color={Colors.textSub}/>
                    <Text style={styles.emptyText}>Nessun invito in attesa.</Text>
                </View>
            ) : (
                invites.map(invite => (
                    <View key={invite.id} style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>{invite.location}</Text>
                            <Text style={[styles.cardSubtitle, {color: Colors.cyan}]}>{invite.date} • {invite.startTime}</Text>
                        </View>
                        <View style={styles.buttonRow}>
                            <TouchableOpacity onPress={()=>handleDecline(invite.id)} style={[styles.actionButton, {borderColor: Colors.error, borderWidth:1}]}>
                                <Text style={{color: Colors.error, fontWeight:'bold'}}>Rifiuta</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={()=>handleAccept(invite)} style={[styles.actionButton, {backgroundColor: Colors.primary}]}>
                                <Text style={{color: '#000', fontWeight:'bold'}}>Accetta</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))
            )}
        </View>

        {/* TURNI ATTIVI */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>I TUOI TURNI ATTIVI</Text>
            {myShifts.length === 0 ? (
                <Text style={styles.emptyText}>Nessun turno attivo oggi.</Text>
            ) : (
                myShifts.map(shift => {
                    const canStart = isShiftTimeValid(shift.date, shift.startTime);
                    const isInProgress = shift.status === 'in-corso';
                    return (
                        <View key={shift.id} style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View>
                                    <Text style={styles.cardTitle}>{shift.location}</Text>
                                    <Text style={styles.cardSubtitle}>{shift.date} • {shift.startTime} - {shift.endTime}</Text>
                                </View>
                            </View>

                            {isInProgress ? renderDynamicTimer(shift) : (
                                <View style={{marginTop: 15}}>
                                    <TouchableOpacity disabled={!canStart || loadingLocation} onPress={()=>handleStartShift(shift)} style={{backgroundColor: canStart ? Colors.primary : Colors.surface, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: canStart ? Colors.primary : Colors.border}}>
                                        {loadingLocation ? <ActivityIndicator color={Colors.isDark ? "#000" : "#FFF"}/> : (
                                            <View style={{flexDirection:'row', alignItems:'center'}}>
                                                <Feather name="map-pin" size={16} color={canStart ? (Colors.isDark ? '#000' : '#FFF') : Colors.textSub} style={{marginRight: 8}}/>
                                                <Text style={{color: canStart ? (Colors.isDark ? '#000' : '#FFF') : Colors.textSub, fontWeight: 'bold'}}>
                                                    {canStart ? "TIMBRA PRESENZA (GPS)" : "NON ANCORA ATTIVO"}
                                                </Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                    {!canStart && <Text style={{color: Colors.textSub, fontSize: 11, textAlign: 'center', marginTop: 8}}>Attivo 1 ora prima</Text>}
                                </View>
                            )}
                        </View>
                    );
                })
            )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- GENERATORE DI STILI DINAMICI ---
const getStyles = (Colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerActions: { flexDirection: 'row' },
  welcomeText: { fontSize: 20, fontWeight: 'bold', color: Colors.textMain },
  subHeader: { fontSize: 14, color: Colors.textSub },
  iconButton: { marginLeft: 15, padding: 5 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textSub, textTransform: 'uppercase', marginBottom: 12 },
 
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textMain },
  cardSubtitle: { fontSize: 13, color: Colors.textSub },

  historyWidget: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 25, borderWidth: 1, borderColor: Colors.border },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  widgetTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textMain, marginBottom: 2 },
  widgetSubtitle: { fontSize: 12, color: Colors.textSub },

  emptyBox: { backgroundColor: Colors.surface, borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  emptyText: { color: Colors.textSub, marginTop: 10, fontStyle:'italic' },

  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  timerYellow: { backgroundColor: Colors.yellow+'20', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: Colors.yellow, alignItems:'center' },
  timerTextYellow: { color: Colors.yellow, fontWeight: 'bold' },
  timerSubText: { color: Colors.textMain, fontSize: 12, marginTop: 4 },
  timerGreen: { backgroundColor: Colors.primary+'20', padding: 10, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: Colors.primary, alignItems:'center' },
  timerTextGreen: { color: Colors.primary, fontWeight: 'bold' },
  timerBigText: { color: Colors.textMain, fontSize: 18, fontWeight:'bold', marginTop: 4 },
});