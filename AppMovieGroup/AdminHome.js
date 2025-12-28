//AdminHome.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert, Platform, StatusBar, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { collection, query, where, doc, updateDoc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore';
import * as Location from 'expo-location'; // IMPORTANTE: Serve per il GPS dell'Admin
import WelcomeModal from './WelcomeModal'; // <--- AGGIUNGI QUESTO

// --- 1. MOTORE COLORI ---
const Colors = {
    background: '#000000', surface: '#1C1C1E', primary: '#4CAF50', accent: '#0A84FF',
    textMain: '#FFFFFF', textSub: '#8E8E93', border: '#2C2C2E', error: '#FF453A',
    cyan: '#00D1FF', warning: '#FFD700', purple: '#BF5AF2'
};

const ColorSchemes = {
    dark: { ...Colors, isDark: true },
    light: {
        background: '#F2F2F7', surface: '#FFFFFF', primary: '#34C759', accent: '#007AFF',
        textMain: '#000000', textSub: '#6E6E73', border: '#D1D1D6', error: '#FF3B30',
        cyan: '#00ACD7', warning: '#D4A017', purple: '#AF52DE', isDark: false
    }
};

export default function AdminHome({ navigation }) {
  // --- STATO TEMA ---
  const [theme, setTheme] = useState('dark');
  const CurrentColors = ColorSchemes[theme];
  const styles = getStyles(CurrentColors);
  
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  
  // STATI DATI
  const [pendingUsers, setPendingUsers] = useState([]);
  const [activeCollaborators, setActiveCollaborators] = useState([]); 
  const [staffList, setStaffList] = useState([]); 
  
  // STATI TURNI (Gestione Admin)
  const [shiftsPending, setShiftsPending] = useState([]);
  const [shiftsActive, setShiftsActive] = useState([]);
  const [shiftsCompleted, setShiftsCompleted] = useState([]);

  // STATO TOTALE (Per separare i miei da quelli degli altri)
  const [allRawShifts, setAllRawShifts] = useState([]); 

  // --- I MIEI TURNI PERSONALI (Filtro Pulito) ---
  // Mostra SOLO quelli attivi. Nasconde Rifiutati e Completati.
  const myPersonalShifts = allRawShifts.filter(s => 
      s.collaboratorId === auth.currentUser?.uid && 
      ['assegnato', 'accettato', 'in-corso'].includes(s.status)
  );

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    getDoc(doc(db, "users", currentUser.uid)).then(snap => {
        if (snap.exists()) setAdminName(snap.data().firstName);
    });

    const qPending = query(collection(db, "users"), where("isApproved", "==", false));
    const unsubPending = onSnapshot(qPending, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.id !== currentUser.uid);
        setPendingUsers(list);
    });

    const qActive = query(collection(db, "users"), where("isApproved", "==", true), where("role", "==", "COLLABORATORE"));
    const unsubActive = onSnapshot(qActive, (snap) => setActiveCollaborators(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qStaff = query(collection(db, "users"), where("isApproved", "==", true));
    const unsubStaff = onSnapshot(qStaff, (snap) => setStaffList(snap.docs.map(d => ({id: d.id, ...d.data()})).filter(d => d.role !== 'FOUNDER')));

const qShifts = query(collection(db, "shifts"));
    const unsubShifts = onSnapshot(qShifts, (snap) => {
        // 1. Scarichiamo
        let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // 2. ORDINAMENTO: Mettiamo in ordine di data (Urgenti in cima)
        list.sort((a, b) => new Date(a.date + 'T' + a.startTime) - new Date(b.date + 'T' + b.startTime));

        // 3. Salviamo TUTTO (Ordinato)
        setAllRawShifts(list);

        // 4. Filtriamo SOLO I TURNI DEGLI ALTRI per i Widget
        const othersShifts = list.filter(s => s.collaboratorId !== currentUser.uid);

        setShiftsPending(othersShifts.filter(s => ['assegnato'].includes(s.status)));
        setShiftsActive(othersShifts.filter(s => ['accettato', 'in-corso'].includes(s.status)));
        setShiftsCompleted(othersShifts.filter(s => ['completato', 'rifiutato'].includes(s.status)));
        
        setLoading(false);
    });

    return () => { unsubPending(); unsubActive(); unsubStaff(); unsubShifts(); };
  }, []);

  // --- LOGICA OPERATIVA (Timer, GPS, Azioni per Admin Operativo) ---
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

  const getSmartDates = (dateStr, startStr, endStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const [hS, mS] = startStr.split(':').map(Number);
      const [hE, mE] = endStr.split(':').map(Number);
      const start = new Date(y, m - 1, d, hS, mS);
      let end = new Date(y, m - 1, d, hE, mE);
      if (end < start) end.setDate(end.getDate() + 1); 
      return { start, end };
  };

  // --- AUTO-CLOSE ADMIN (Spietato) ---
  useEffect(() => {
    const checkAutoEnd = () => {
        const now = new Date();
        // Controlla solo i miei turni personali attivi
        myPersonalShifts.forEach(async (shift) => {
            if (shift.status === 'in-corso') {
                const { end } = getSmartDates(shift.date, shift.startTime, shift.endTime);
                
                // Se l'ora attuale >= ora di fine prevista -> CHIUDI SUBITO
                if (now >= end) {
                    try {
                        console.log(`ADMIN AUTO-CLOSE: Turno scaduto ${shift.id}`);
                        await updateDoc(doc(db, "shifts", shift.id), {
                            status: 'completato',
                            realEndTime: end.toISOString()
                        });
                    } catch(e) {}
                }
            }
        });
    };
    const interval = setInterval(checkAutoEnd, 3000); 
    return () => clearInterval(interval);
  }, [myPersonalShifts]);

  const onAcceptShift = async (s) => { try { await updateDoc(doc(db, "shifts", s.id), { status: 'accettato' }); } catch(e){ Alert.alert("Errore", e.message)} };
  
  const onRejectShift = async (s) => {
      Alert.alert("Rifiuta", "Non puoi coprire questo turno?", [
          { text: "Annulla", style: "cancel" },
          { text: "Rifiuta", style: "destructive", onPress: async () => await updateDoc(doc(db, "shifts", s.id), { status: 'rifiutato' }) }
      ]);
  };

  const onStartShift = async (s) => {
      const { start } = getSmartDates(s.date, s.startTime, s.endTime);
      const diff = (new Date() - start) / 1000 / 60;
      if (diff < -60) { Alert.alert("Troppo Presto", "Manca più di un'ora all'inizio."); return; }

      try {
          let { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') { Alert.alert("Serve GPS", "Abilita la posizione."); return; }
          let loc = await Location.getCurrentPositionAsync({});
          await updateDoc(doc(db, "shifts", s.id), { 
              status: 'in-corso', 
              realStartTime: new Date().toISOString(),
              startLocation: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
          });
      } catch (e) { Alert.alert("Errore GPS", "Impossibile rilevare posizione."); }
  };

// --- FIX BILINGUE: TERMINA TURNO ADMIN ---
  const onEndShift = async (s) => {
      // Funzione che esegue la chiusura
      const doEnd = async () => { 
          try {
              await updateDoc(doc(db, "shifts", s.id), { 
                  status: 'completato', 
                  realEndTime: new Date().toISOString() 
              }); 
          } catch (e) {
              console.error("Errore chiusura:", e);
          }
      };

      if (Platform.OS === 'web') {
          // VERSIONE PC: Usa il confirm del browser
          if (confirm("Termina: Hai finito il turno?")) {
              doEnd();
          }
      } else {
          // VERSIONE APP: Usa Alert nativo
          Alert.alert("Termina", "Hai finito il turno?", [
              { text: "No", style: "cancel" },
              { text: "Sì, Termina", style: "destructive", onPress: doEnd }
          ]);
      }
  };

// --- RENDER TIMER (Sostituisci quello vecchio) ---
  const renderTimer = (s) => {
      // Usiamo la tua funzione esistente per ottenere l'orario previsto
      const { start: scheduledStart } = getSmartDates(s.date, s.startTime, s.endTime);
      const now = currentTime;
      const realStart = s.realStartTime ? new Date(s.realStartTime) : scheduledStart;

      if (s.status === 'in-corso') {
          // A. SE SIAMO IN ANTICIPO: Timer Giallo (Conto alla rovescia)
          if (realStart < scheduledStart) {
              if (now < scheduledStart) {
                  const diffMs = scheduledStart - now;
                  const minutes = Math.floor((diffMs / 1000 / 60) % 60);
                  const seconds = Math.floor((diffMs / 1000) % 60);
                  
                  return (
                      <View style={styles.timerYellow}>
                          <Text style={styles.timerTextYellow}>📍 SUL POSTO (REPERIBILE)</Text>
                          <Text style={[styles.timerBigText, {color: CurrentColors.warning}]}>-{minutes}m {seconds}s</Text>
                          <Text style={{color: CurrentColors.textSub, fontSize: 10, marginTop:2}}>Il lavoro parte alle {s.startTime}</Text>
                      </View>
                  );
              }
          }

          // B. SE SIAMO OPERATIVI: Timer Verde (Conteggio lavoro effettivo)
          // Si calcola da "scheduledStart" se siamo arrivati prima, o da "realStart" se siamo arrivati dopo.
          const effectiveStart = realStart < scheduledStart ? scheduledStart : realStart;
          const diffMs = now - effectiveStart;
          
          const h = Math.floor(diffMs / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          const sec = Math.floor((diffMs % 60000) / 1000);

          return (
              <View style={styles.timerGreen}>
                  <Text style={styles.timerTextGreen}>✅ AL LAVORO DA:</Text>
                  <Text style={styles.timerBigText}>{h}h {m}m {sec}s</Text>
              </View>
          );
      }
      return null;
  };

  // --- AZIONI NORMALI ADMIN ---
  const handleLogout = () => {
    if (Platform.OS === 'web') {
        if (confirm("Logout: Vuoi uscire?")) signOut(auth);
    } else {
        Alert.alert("Logout", "Vuoi uscire?", [{ text: "No", style: "cancel" }, { text: "Esci", style: "destructive", onPress: () => signOut(auth) }]);
    }
  };

  const handleApprove = async (userId) => { try { await updateDoc(doc(db, "users", userId), { isApproved: true }); } catch (e) { Alert.alert("Errore", e.message); } };

  const handleReject = async (userId) => {
    const doDelete = async () => { try { await deleteDoc(doc(db, "users", userId)); } catch (e) { Alert.alert("Errore", e.message); } };
    if (Platform.OS === 'web') { if (confirm("Rifiuta Utente: Sei sicuro?")) doDelete(); } 
    else { Alert.alert("Rifiuta Utente", "Sei sicuro?", [{ text: "Annulla", style: "cancel" }, { text: "Elimina", style: "destructive", onPress: doDelete }]); }
  };

  const goToShiftMgmt = () => navigation.navigate('ShiftManagementScreen', { shiftsPending, shiftsActive, shiftsCompleted });
  const goToStaff = () => navigation.navigate('WidgetListaStaffAttivoAdmin', { staffData: staffList }); 
  const handleCreateShift = () => navigation.navigate('CreateShiftScreen', { activeCollaborators: activeCollaborators });
  const goToProfile = () => navigation.navigate('CamerinoStaff');

  const renderTile = (label, value, icon, color, onPress) => (
    <TouchableOpacity 
        style={[styles.tile, { borderLeftColor: color }]} 
        onPress={onPress} 
        disabled={!onPress}
    >
        <View style={styles.tileHeader}>
            <Text style={styles.tileLabel}>{label}</Text>
            <Feather name={icon} size={20} color={color} />
        </View>
        <Text style={styles.tileValue}>{value}</Text>
    </TouchableOpacity>
  );

  if (loading) return <View style={[styles.safeArea, {justifyContent:'center', alignItems:'center'}]}><ActivityIndicator color={CurrentColors.primary} size="large"/></View>;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: CurrentColors.background }]}>
      <StatusBar barStyle={theme === 'dark' ? "light-content" : "dark-content"} backgroundColor={CurrentColors.background} />
      
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={goToProfile} style={styles.headerLeft}> 
            <Text style={styles.headerTitle}>{adminName ? `Ciao, ${adminName}` : "Admin Dashboard"}</Text>
            <Text style={styles.headerSubtitle}>Profilo e Dati ⚙️</Text>
        </TouchableOpacity>

        <View style={styles.headerIconsContainer}>
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

        <View style={styles.tilesGrid}>
{renderTile(
                "Registrazioni", 
                pendingUsers.length, 
                "user-plus", 
                pendingUsers.length > 0 ? CurrentColors.error : CurrentColors.cyan, 
                pendingUsers.length > 0 ? () => navigation.navigate('AdminStaffScreen', { 
                    mode: 'PENDING_ACCESS_ALL',
                    data: pendingUsers,
                    
                    // ACCETTA: Va bene così (non chiede conferma nella Home)
                    handleAccept: (id) => handleApprove(id), 
                    
                    // RIFIUTA (MODIFICATO): Cancellazione DIRETTA (senza chiedere conferma 2 volte)
// Dentro AdminHome.js, nel renderTile delle Richieste Accesso:
handleReject: async (id) => {
    try {
        await deleteDoc(doc(db, "users", id));
    } catch (e) {
        console.error("Errore eliminazione:", e);
    }
}
                }) : null
            )}
            {renderTile("Turni Attivi", shiftsPending.length + shiftsActive.length, "calendar", CurrentColors.primary, goToShiftMgmt)}
            {renderTile("Lo staff", staffList.length, "users", CurrentColors.purple, goToStaff)}
        </View>

        {/* --- SEZIONE: I MIEI TURNI PERSONALI (Interattiva e Filtrata) --- */}
{myPersonalShifts.map(shift => {
                    const isWorking = shift.status === 'in-corso';
                    const isAssigned = shift.status === 'assegnato';
                    const isAccepted = shift.status === 'accettato';

                    // CALCOLO ORARIO CHIUSURA
                    const { end: scheduledEnd } = getSmartDates(shift.date, shift.startTime, shift.endTime);
                    // È presto se l'ora attuale è minore della fine prevista
                    const isTooEarlyToClose = currentTime < scheduledEnd;

                    return (
                        <View key={shift.id} style={[styles.cardItem, { flexDirection: 'column', alignItems: 'stretch' }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <View>
                                    <Text style={styles.cardTitle}>{shift.location}</Text>
                                    <Text style={styles.cardSubtitle}>📅 {shift.date} • ⏰ {shift.startTime} - {shift.endTime}</Text>
                                </View>
                                <View style={{ backgroundColor: isWorking ? CurrentColors.primary : CurrentColors.surface, padding: 5, borderRadius: 5 }}>
                                    <Feather name={isWorking ? "activity" : "clock"} size={20} color={isWorking ? '#000' : CurrentColors.textSub} />
                                </View>
                            </View>

                            {renderTimer(shift)}

                            <View style={styles.btnRow}>
                                {isAssigned && (
                                    <>
                                        <TouchableOpacity onPress={() => onRejectShift(shift)} style={[styles.opBtn, { backgroundColor: CurrentColors.error }]}>
                                            <Text style={[styles.opBtnText, { color: '#FFF' }]}>RIFIUTA</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => onAcceptShift(shift)} style={[styles.opBtn, { backgroundColor: CurrentColors.primary }]}>
                                            <Text style={styles.opBtnText}>ACCETTA</Text>
                                        </TouchableOpacity>
                                    </>
                                )}
                                {isAccepted && (
                                    <TouchableOpacity onPress={() => onStartShift(shift)} style={[styles.opBtn, { backgroundColor: CurrentColors.accent }]}>
                                        <Text style={[styles.opBtnText, { color: '#FFF' }]}>SEGNA LA TUA POSIZIONE (GPS)</Text>
                                    </TouchableOpacity>
                                )}
                                
{/* TASTO TERMINA ADMIN (Sempre Attivo) */}
                                {isWorking && (
                                    <TouchableOpacity 
                                        onPress={() => onEndShift(shift)} 
                                        // NESSUN DISABLED: Cliccabile sempre
                                        style={[styles.opBtn, { 
                                            backgroundColor: CurrentColors.error, // Sempre ROSSO
                                            borderWidth: 1,
                                            borderColor: CurrentColors.error,
                                            // Aggiungiamo ombra per uniformità
                                            shadowColor: "#000",
                                            shadowOffset: { width: 0, height: 2 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 3,
                                            elevation: 4
                                        }]}
                                    >
                                        <View style={{flexDirection:'row', alignItems:'center'}}>
                                            {/* Icona STOP fissa */}
                                            <Feather name="stop-circle" size={14} color="#FFF" style={{marginRight:5}}/>
                                            <Text style={[styles.opBtnText, { color: '#FFF' }]}>
                                                TERMINA TURNO
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    );
                })}
{/* --- BOTTONE BACHECA (IDENTICO A COLLABORATOR) --- */}
      <TouchableOpacity
        style={{
          backgroundColor: '#1C1C1E', // Colore Surface ufficiale
          borderRadius: 16,
          padding: 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20, // Spazio dal tasto verde
          marginTop: 10,    // Spazio dai widget
          borderWidth: 1,
          borderColor: '#BF5AF2' // Colore Purple ufficiale
        }}
        onPress={() => navigation.navigate('Board')}
      >
          <View style={{flexDirection:'row', alignItems:'center'}}>
            {/* CERCHIO ICONA */}
            <View style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(191, 90, 242, 0.2)' // Purple al 20% di opacità
            }}>
                <Feather name="radio" size={24} color="#BF5AF2" />
            </View>

            {/* TESTI */}
            <View style={{marginLeft: 15}}>
                <Text style={{fontSize: 16, fontWeight: 'bold', color: '#BF5AF2', marginBottom: 2}}>
                    BACHECA TURNI
                </Text>
                <Text style={{fontSize: 12, color: '#8E8E93'}}>
                    Proponiti per un turno, aggiungi una nota.
                </Text>
            </View>
        </View>

        {/* FRECCIA A DESTRA */}
        <Feather name="chevron-right" size={24} color="#BF5AF2" />
      </TouchableOpacity>

        <TouchableOpacity style={styles.mainFab} onPress={handleCreateShift}>
          <Feather name="plus" size={24} color="#000" />
          <Text style={styles.fabText}>ASSEGNA UN TURNO</Text>
        </TouchableOpacity>

      </ScrollView>
<WelcomeModal 
          visible={showGuide} 
          onClose={() => setShowGuide(false)} 
          userRole="AMMINISTRATORE" 
      />
    </SafeAreaView>
  );
}

const getStyles = (Colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  
  headerLeft: { flex: 1, marginRight: 10, zIndex: 1 },
  headerIconsContainer: { flexDirection: 'row', alignItems: 'center', gap: 20, zIndex: 999, elevation: 10, position: 'relative' },
  iconButton: { padding: 5, cursor: 'pointer' },
  
  headerTitle: { fontSize: 22, fontWeight: '900', color: Colors.textMain, letterSpacing: 1 },
  headerSubtitle: { fontSize: 14, color: Colors.textSub, textDecorationLine:'underline' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  tilesGrid: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  
  tile: { flex: 1, backgroundColor: Colors.surface, borderRadius: 12, padding: 10, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border, minHeight: 100, justifyContent:'center', cursor: 'pointer' },
  tileHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  tileLabel: { fontSize: 9, fontWeight: 'bold', color: Colors.textSub, textTransform:'uppercase' },
  tileValue: { fontSize: 24, fontWeight: 'bold', color: Colors.textMain },
  
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: Colors.textSub, textTransform: 'uppercase', marginBottom: 10 },
  cardItem: { backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textMain },
  cardSubtitle: { fontSize: 12, color: Colors.textSub, marginTop: 2 },
  
  actionsRow: { flexDirection: 'row' },
  actionBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  
  mainFab: { backgroundColor: Colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 30, marginTop: 10, shadowColor: Colors.primary, shadowOpacity: 0.3, shadowRadius: 10, elevation: 5, cursor: 'pointer' },
  fabText: { color: '#000', fontWeight: '900', fontSize: 16, marginLeft: 8, letterSpacing: 1 },
  // AGGIUNGI QUESTI SOTTO A fabText o dove vuoi:
  timerYellow: { 
      backgroundColor: 'rgba(255, 215, 0, 0.2)', // Giallo trasparente
      padding: 10, 
      borderRadius: 8, 
      marginTop: 10, 
      alignItems: 'center', 
      borderColor: Colors.warning, 
      borderWidth: 1 
  },
  timerTextYellow: { 
      color: Colors.warning, 
      fontWeight: 'bold', 
      fontSize: 10, 
      textTransform: 'uppercase' 
  },

  // --- STILI OPERATIVI (Nuovi) ---
  timerGreen: { backgroundColor: 'rgba(76, 175, 80, 0.2)', padding: 10, borderRadius: 8, marginTop: 10, alignItems: 'center', borderColor: '#4CAF50', borderWidth: 1 },
  timerTextGreen: { color: '#4CAF50', fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase' },
  timerBigText: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginTop: 2 },
  
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  opBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  opBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
});