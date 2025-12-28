//CollaboratorHome.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert, Platform, StatusBar, ActivityIndicator, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { collection, query, where, doc, updateDoc, getDoc, onSnapshot } from 'firebase/firestore';
import * as Location from 'expo-location';
import WelcomeModal from './WelcomeModal'; // <--- AGGIUNGI QUESTO

// --- DESIGN SYSTEM ---
const Colors = {
    background: '#000000', surface: '#1C1C1E', primary: '#4CAF50', accent: '#0A84FF',
    textMain: '#FFFFFF', textSub: '#8E8E93', border: '#2C2C2E', error: '#FF453A',
    cyan: '#00D1FF', yellow: '#EAB308', purple: '#BF5AF2'
};

const ColorSchemes = {
    dark: { ...Colors, isDark: true },
    light: {
        background: '#F2F2F7', surface: '#FFFFFF', primary: '#34C759', accent: '#007AFF',
        textMain: '#000000', textSub: '#6E6E73', border: '#D1D1D6', error: '#FF3B30',
        cyan: '#00ACD7', yellow: '#D4A017', isDark: false
    }
};

export default function CollaboratorHome({ onNavigateHistory, onNavigateProfile, onNavigateBoard }) {
  const [theme, setTheme] = useState('dark');
  const CurrentColors = ColorSchemes[theme];
  // const styles = getStyles(CurrentColors); <--- SPOSTATO DOPO LA DEFINIZIONE DI getStyles
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const [invites, setInvites] = useState([]);
  const [myShifts, setMyShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showGuide, setShowGuide] = useState(false);

  // IMPORTANTE: Definiamo gli stili qui dentro o usiamo un useMemo, ma per semplicità ora lo metto qui sotto la definizione
  const styles = getStyles(CurrentColors);

  // Orologio
  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

  const handleLogout = async () => {
      // FIX PER IL WEB: Il browser vuole "confirm", il telefono vuole "Alert"
      if (Platform.OS === 'web') {
          // Popup semplice del browser
          const conferma = confirm("Logout: Vuoi uscire davvero?");
          if (conferma) {
              await signOut(auth);
          }
      } else {
          // Popup bello del telefono
          Alert.alert("Logout", "Vuoi uscire?", [
              { text: "No", style: "cancel" },
              { text: "Esci", style: "destructive", onPress: async () => await signOut(auth) }
          ]);
      }
  };

  const goToProfile = () => { if (onNavigateProfile) onNavigateProfile(); };

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setLoading(true);

    getDoc(doc(db, "users", currentUser.uid)).then(docSnap => { if(docSnap.exists()) setUser(docSnap.data()); });

    const qInvites = query(collection(db, "shifts"), where("collaboratorId", "==", currentUser.uid), where("status", "==", "assegnato"));
    const unsubInvites = onSnapshot(qInvites, (snap) => { setInvites(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });

    const qMyShifts = query(collection(db, "shifts"), where("collaboratorId", "==", currentUser.uid), where("status", "in", ["accettato", "in-corso"]));
   const unsubShifts = onSnapshot(qMyShifts, (snap) => { 
        // 1. Scarichiamo i dati grezzi
        let shifts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 2. Li mettiamo in ordine di data (dal più vicino al più lontano)
        shifts.sort((a, b) => new Date(a.date + 'T' + a.startTime) - new Date(b.date + 'T' + b.startTime));
        
        // 3. Salviamo la lista ordinata
        setMyShifts(shifts); 
        setLoading(false); 
    });

    return () => { unsubInvites(); unsubShifts(); };
  }, []);

  const getShiftDates = (dateStr, timeStr) => {
      if(!dateStr || !timeStr) return new Date();
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes, 0);
  };
  // NUOVA FUNZIONE: Calcola inizio e fine gestendo la notte
  const getSmartDates = (dateStr, startStr, endStr) => {
      const start = getShiftDates(dateStr, startStr);
      let end = getShiftDates(dateStr, endStr);
      // SE la fine è prima dell'inizio (es. 04:00 < 22:00), aggiungi 1 giorno alla fine
      if (end < start) {
          end.setDate(end.getDate() + 1);
      }
      return { start, end };
  };

// --- LOGICA FINESTRA TEMPORALE (AGGIORNATA PER LA NOTTE) ---
  const checkShiftStatus = (dateStr, startTimeStr, endTimeStr) => {
      try {
          // Usiamo la funzione intelligente
          const { start, end } = getSmartDates(dateStr, startTimeStr, endTimeStr);
          
          const now = new Date();
          const windowOpen = new Date(start.getTime() - 3600000); // 1 ora prima

          if (now < windowOpen) return 'TOO_EARLY';
          if (now >= windowOpen && now < end) return 'VALID';
          return 'TOO_LATE';
      } catch (e) { return 'ERROR'; }
  };

  const handleAccept = async (invite) => { try { await updateDoc(doc(db, "shifts", invite.id), { status: "accettato" }); } catch (e) { Alert.alert("Errore", "Impossibile accettare."); } };
  const handleDecline = async (id) => { try { await updateDoc(doc(db, "shifts", id), { status: "rifiutato" }); } catch (e) { Alert.alert("Errore", "Impossibile rifiutare."); } };

  const handleEarlyAttempt = (startTime) => {
      Alert.alert(
          "✋ Troppo Presto!",
          `Il turno inizia alle ${startTime}.\nPuoi timbrare la presenza a partire da 1 ora prima.`
      );
  };

  // --- START SHIFT CON GESTIONE ERRORI GPS ---
  const handleStartShift = async (shift) => {
      const statusCheck = checkShiftStatus(shift.date, shift.startTime, shift.endTime);

      if (statusCheck === 'TOO_EARLY') {
          handleEarlyAttempt(shift.startTime);
          return;
      }

      setLoadingLocation(true);
      try {
          // 1. Chiediamo permesso
          let { status } = await Location.requestForegroundPermissionsAsync();

          // 2. Se l'utente ha rifiutato
          if (status !== 'granted') {
              Alert.alert(
                  "GPS Necessario",
                  "Hai negato l'accesso alla posizione. Devi abilitarlo dalle impostazioni per poter timbrare.",
                  [
                      { text: "Annulla", style: "cancel" },
                      { text: "Apri Impostazioni", onPress: () => Linking.openSettings() } 
                  ]
              );
              setLoadingLocation(false);
              return;
          }

          // 3. Se permesso OK, prendiamo posizione
          let loc = await Location.getCurrentPositionAsync({});

          await updateDoc(doc(db, "shifts", shift.id), {
              status: 'in-corso',
              realStartTime: new Date().toISOString(),
              startLocation: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
          });
      } catch (e) { 
          Alert.alert("Errore GPS", "Assicurati che il GPS sia attivo sul telefono."); 
      } finally { 
          setLoadingLocation(false); 
      }
  };

// --- FIX BILINGUE: CHIUSURA MANUALE COLLABORATORE ---
  const handleManualEndShift = async (shift) => {
      const title = "Termina Turno";
      const msg = "Hai finito il lavoro? Confermi la chiusura?";

      const executeEnd = async () => {
          try {
              await updateDoc(doc(db, "shifts", shift.id), {
                  status: 'completato',
                  realEndTime: new Date().toISOString()
              });
              // Feedback visivo su PC
              if (Platform.OS === 'web') alert("Turno terminato con successo!");
          } catch (e) {
              if (Platform.OS === 'web') alert("Errore: " + e.message);
              else Alert.alert("Errore", "Impossibile chiudere il turno.");
          }
      };

      if (Platform.OS === 'web') {
          // WEB
          if (confirm(`${title}: ${msg}`)) {
              executeEnd();
          }
      } else {
          // APP
          Alert.alert(title, msg, [
              { text: "No", style: "cancel" },
              { 
                  text: "Sì, Termina", 
                  style: 'destructive',
                  onPress: executeEnd
              }
          ]);
      }
  };

// --- AUTO-CLOSE SPIETATO (Chiude esattamente all'orario di fine) ---
  useEffect(() => {
    const checkAutoEnd = () => {
        const now = new Date();
        myShifts.forEach(async (shift) => {
            if (shift.status === 'in-corso') {
                // Usiamo la funzione intelligente per capire quando finisce (gestisce anche la notte)
                const { end } = getSmartDates(shift.date, shift.startTime, shift.endTime);
                
                // NESSUNA TOLLERANZA: Se l'ora attuale ha superato la fine, chiudi.
                if (now >= end) {
                    try {
                        console.log(`Chiusura automatica puntuale: ${shift.id}`);
                        await updateDoc(doc(db, "shifts", shift.id), {
                            status: 'completato',
                            realEndTime: end.toISOString()
                        });
                    } catch(e) {}
                }
            }
        });
    };
    // Controllo ogni 3 secondi per essere precisi
    const interval = setInterval(checkAutoEnd, 3000); 
    return () => clearInterval(interval);
  }, [myShifts]);

  // --- RENDER TIMER ---
  const renderDynamicTimer = (shift) => {
      const scheduledStart = getShiftDates(shift.date, shift.startTime);
      const now = currentTime;
      const realStart = shift.realStartTime ? new Date(shift.realStartTime) : scheduledStart;

      if (realStart < scheduledStart) {
          if (now < scheduledStart) {
              const diffMs = scheduledStart - now;
              const minutes = Math.floor((diffMs / 1000 / 60) % 60);
              const seconds = Math.floor((diffMs / 1000) % 60);

              return (
                  <View style={styles.timerYellow}>
                      <Text style={styles.timerTextYellow}>📍 SUL POSTO (REPERIBILE)</Text>
                      <Text style={styles.timerBigText}>-{minutes}m {seconds}s</Text>
                      <Text style={styles.timerSubText}>Pagamento parte alle {shift.startTime}</Text>
                  </View>
              );
          } else {
              return renderGreenTimer(now, scheduledStart, shift.endTime);
          }
      } else {
          return renderGreenTimer(now, realStart, shift.endTime);
      }
  };

  const renderGreenTimer = (now, startTimeToCount, endTimeStr) => {
      const diffMs = now - startTimeToCount;
      const safeDiff = diffMs > 0 ? diffMs : 0;
      const hours = Math.floor(safeDiff / 1000 / 60 / 60);
      const minutes = Math.floor((safeDiff / 1000 / 60) % 60);
      const seconds = Math.floor((safeDiff / 1000) % 60);

      return (
          <View style={styles.timerGreen}>
              <Text style={styles.timerTextGreen}>✅ AL LAVORO</Text>
              <Text style={styles.timerBigText}>{hours}h {minutes}m {seconds}s</Text>
              <Text style={styles.timerSubText}>Chiusura auto alle: {endTimeStr}</Text>
          </View>
      );
  }
// --- FILTRO INTELLIGENTE PER LISTE SEPARATE ---
    // Definiamo "URGENTE" un turno che è in corso O che inizia entro 24 ore
    const isUrgent = (shift) => {
        if(shift.status === 'in-corso') return true;
        const { start } = getSmartDates(shift.date, shift.startTime, shift.endTime);
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000); 
        return start < tomorrow; 
    };

    // Creiamo le due liste separate
    const activeShifts = myShifts.filter(s => isUrgent(s));
    const futureShifts = myShifts.filter(s => !isUrgent(s));
  if (loading) return <View style={[styles.safeArea, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator size="large" color={CurrentColors.cyan}/></View>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle={theme === 'dark' ? "light-content" : "dark-content"} backgroundColor={CurrentColors.background} />

      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={goToProfile}>
            <Text style={styles.welcomeText}>{user?.firstName ? `Ciao, ${user.firstName}` : "Home Staff"}</Text>
            <Text style={styles.subHeader}>Profilo e Dati ⚙️</Text>
        </TouchableOpacity>

        <View style={styles.headerActions}>
            {/* TASTO GUIDA */}
<TouchableOpacity onPress={() => setShowGuide(true)} style={styles.iconButton}>
    <Feather name="help-circle" size={22} color={CurrentColors.cyan} />
</TouchableOpacity>
            <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
                <Feather name={theme === 'dark' ? "sun" : "moon"} size={22} color={CurrentColors.textMain} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
                <Feather name="log-out" size={22} color={CurrentColors.error} />
            </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <TouchableOpacity style={styles.historyWidget} onPress={() => onNavigateHistory ? onNavigateHistory() : null}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles.iconCircle, {backgroundColor: CurrentColors.cyan + '20'}]}>
                    <Feather name="clock" size={24} color={CurrentColors.cyan} />
                </View>
                <View style={{marginLeft: 15}}>
                    <Text style={styles.widgetTitle}>Storico Turni</Text>
                    <Text style={styles.widgetSubtitle}>Vedi i tuoi turni completati</Text>
                </View>
            </View>
            <Feather name="chevron-right" size={24} color={CurrentColors.textSub} />
        </TouchableOpacity>

        <TouchableOpacity
            style={[styles.historyWidget, {borderColor: Colors.purple, borderWidth: 1, marginTop: 10}]}
            onPress={() => onNavigateBoard ? onNavigateBoard() : Alert.alert("Info", "Presto disponibile")}
        >
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles.iconCircle, {backgroundColor: Colors.purple + '20'}]}>
                    <Feather name="radio" size={24} color={Colors.purple} />
                </View>
                <View style={{marginLeft: 15}}>
                    <Text style={[styles.widgetTitle, {color: Colors.purple}]}>BACHECA TURNI</Text>
                    <Text style={styles.widgetSubtitle}>Proponiti per un turno, aggiungi una nota.</Text>
                </View>
            </View>
            <Feather name="chevron-right" size={24} color={Colors.purple} />
        </TouchableOpacity>

{/* --- SEZIONE 1: INVITI (Si vede solo se ce ne sono) --- */}
        {invites.length > 0 && (
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, {color: CurrentColors.yellow}]}>⚠️ DA CONFERMARE ({invites.length})</Text>
                {invites.map(invite => (
                    <View key={invite.id} style={[styles.card, {borderColor: CurrentColors.yellow}]}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.cardTitle}>{invite.location}</Text>
                            <Text style={[styles.cardSubtitle, {color: CurrentColors.cyan}]}>{invite.date} • {invite.startTime}</Text>
                        </View>
                        <View style={styles.buttonRow}>
                            <TouchableOpacity onPress={()=>handleDecline(invite.id)} style={[styles.actionButton, {borderColor: CurrentColors.error, borderWidth:1}]}><Text style={{color: CurrentColors.error, fontWeight:'bold'}}>Rifiuta</Text></TouchableOpacity>
                            <TouchableOpacity onPress={()=>handleAccept(invite)} style={[styles.actionButton, {backgroundColor: CurrentColors.primary}]}><Text style={{color: '#000', fontWeight:'bold'}}>Accetta</Text></TouchableOpacity>
                        </View>
                    </View>
                ))}
            </View>
        )}

        {/* --- SEZIONE 2: IN ARRIVO / OGGI (Urgenti) --- */}
        {activeShifts.length > 0 && (
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, {color: CurrentColors.accent}]}>🔥 IN ARRIVO / OGGI</Text>
                {activeShifts.map(shift => {
                    // Logica interna della Card
                    const statusCheck = checkShiftStatus(shift.date, shift.startTime, shift.endTime);
                    const canStart = statusCheck === 'VALID';
                    const isInProgress = shift.status === 'in-corso';
                    const btnColor = canStart ? CurrentColors.primary : CurrentColors.border;
                    const textColor = canStart ? (CurrentColors.isDark ? '#000' : '#FFF') : CurrentColors.textSub;

                    return (
                        <View key={shift.id} style={[styles.card, {borderColor: CurrentColors.accent, borderWidth: 1}]}>
                             <View style={styles.cardHeader}>
                                <View><Text style={styles.cardTitle}>{shift.location}</Text><Text style={styles.cardSubtitle}>{shift.date} • {shift.startTime} - {shift.endTime}</Text></View>
                            </View>
                            
                            {isInProgress ? (
                                <View>
                                    {renderDynamicTimer(shift)}
                                    {/* TASTO TERMINA TURNO */}
                                    <TouchableOpacity onPress={() => handleManualEndShift(shift)} style={{backgroundColor: CurrentColors.error, padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: CurrentColors.error}}>
                                        <View style={{flexDirection:'row', alignItems:'center'}}>
                                            <Feather name="stop-circle" size={18} color="#FFF" style={{marginRight: 8}}/>
                                            <Text style={{color: '#FFF', fontWeight: 'bold'}}>TERMINA TURNO</Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={{marginTop: 15}}>
                                    {/* TASTO TIMBRA */}
                                    <TouchableOpacity disabled={loadingLocation} onPress={()=>handleStartShift(shift)} style={{backgroundColor: btnColor, padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: btnColor}}>
                                        {loadingLocation ? <ActivityIndicator color={textColor}/> : 
                                            <View style={{flexDirection:'row', alignItems:'center'}}>
                                                <Feather name={canStart ? "map-pin" : "clock"} size={16} color={textColor} style={{marginRight: 8}}/>
                                                <Text style={{color: textColor, fontWeight: 'bold'}}>{canStart ? "TIMBRA PRESENZA (GPS)" : "ATTENDI ORARIO (1H PRIMA)"}</Text>
                                            </View>
                                        }
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    );
                })}
            </View>
        )}

        {/* --- SEZIONE 3: PROGRAMMA FUTURO (Il resto) --- */}
        <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 PROGRAMMA FUTURO</Text>
            {futureShifts.length === 0 ? 
                <View style={{padding: 20, alignItems:'center', borderStyle:'dashed', borderWidth:1, borderColor:Colors.border, borderRadius:12}}>
                    <Text style={{color:Colors.textSub, fontStyle:'italic'}}>Nessun altro turno in programma.</Text>
                </View> 
                :
                futureShifts.map(shift => (
                    <View key={shift.id} style={styles.card}>
                        <View style={styles.cardHeader}>
                            <View><Text style={styles.cardTitle}>{shift.location}</Text><Text style={styles.cardSubtitle}>{shift.date} • {shift.startTime} - {shift.endTime}</Text></View>
                        </View>
                        <View style={{marginTop: 10, padding: 10, backgroundColor: CurrentColors.surface, borderRadius: 8}}>
                             <Text style={{color: CurrentColors.textSub, fontSize: 12}}>🕑 Programmato - Apparirà in alto quando sarà il momento.</Text>
                        </View>
                    </View>
                ))
            }
        </View>
      </ScrollView>
      <WelcomeModal 
          visible={showGuide} 
          onClose={() => setShowGuide(false)} 
          userRole="COLLABORATORE" 
      />
    </SafeAreaView>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerActions: { flexDirection: 'row' },
  welcomeText: { fontSize: 20, fontWeight: 'bold', color: Colors.textMain },
  subHeader: { fontSize: 14, color: Colors.textSub, textDecorationLine:'underline' },
  iconButton: { marginLeft: 15, padding: 5 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textSub, textTransform: 'uppercase', marginBottom: 12 },
  card: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textMain },
  cardSubtitle: { fontSize: 13, color: Colors.textSub },
  historyWidget: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  iconCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  widgetTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textMain, marginBottom: 2 },
  widgetSubtitle: { fontSize: 12, color: Colors.textSub },
  emptyBox: { backgroundColor: Colors.surface, borderRadius: 16, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  emptyText: { color: Colors.textSub, marginTop: 10, fontStyle:'italic' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  timerYellow: { backgroundColor: Colors.yellow+'20', padding: 15, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: Colors.yellow, alignItems:'center' },
  timerTextYellow: { color: Colors.yellow, fontWeight: 'bold', fontSize: 14 },
  timerGreen: { backgroundColor: Colors.primary+'20', padding: 15, borderRadius: 8, marginTop: 10, borderWidth: 1, borderColor: Colors.primary, alignItems:'center' },
  timerTextGreen: { color: Colors.primary, fontWeight: 'bold', fontSize: 12 },
  timerBigText: { color: Colors.textMain, fontSize: 22, fontWeight:'bold', marginTop: 4 },
  timerSubText: { color: Colors.textMain, fontSize: 12, marginTop: 4 },
});