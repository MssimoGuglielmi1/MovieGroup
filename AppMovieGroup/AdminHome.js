//AdminHome.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert, Platform, StatusBar, ActivityIndicator, Linking } from 'react-native';
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
    cyan: '#00D1FF', warning: '#FFD700', purple: '#BF5AF2', orange: '#F97316'
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
  // --- STATO AVVISO PROFILO ---
  const [showProfileWarning, setShowProfileWarning] = useState(false);

  useEffect(() => {
    const checkAdminData = async () => {
        const user = auth.currentUser;
        if (user) {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                const data = docSnap.data();
                // Se manca IBAN, CF o Telefono -> SCATTA L'ALLARME
                if (!data.phoneNumber || !data.codiceFiscale || !data.iban) {
                    setShowProfileWarning(true);
                }
            }
        }
    };
    checkAdminData();
  }, []);
  // --- STATO TEMA ---
  const [theme, setTheme] = useState('dark');
  const CurrentColors = ColorSchemes[theme];
  const styles = getStyles(CurrentColors);
  
  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(null);
  
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
  // --- STATO NOTIFICHE BACHECA ---
  const [boardCount, setBoardCount] = useState(0);

  useEffect(() => {
      // Ascoltiamo la bacheca in tempo reale
      const q = query(collection(db, "provisional_shifts"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          setBoardCount(snapshot.size); // Conta quanti post ci sono
      });
      return unsubscribe;
  }, []);

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

    return () => { unsubPending(); unsubActive(); unsubShifts(); };
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
      // 1. Controllo Orario
      const { start } = getSmartDates(s.date, s.startTime, s.endTime);
      const diff = (new Date() - start) / 1000 / 60;
      if (diff < -60) { 
          Alert.alert("Troppo Presto", "Manca più di un'ora all'inizio."); 
          return; 
      }

      // 2. Accendiamo la rotellina per QUESTO turno specifico
      setGpsLoading(s.id); 

      try {
          // 3. Chiediamo permessi GPS
          let { status } = await Location.requestForegroundPermissionsAsync();
          
          // Se negato:
          if (status !== 'granted') { 
              Alert.alert(
                  "GPS NECESSARIO ❌",
                  "L'Admin deve dare il buon esempio! Abilita la posizione per timbrare.",
                  [
                      { text: "Annulla", style: "cancel" },
                      { 
                          text: "APRI IMPOSTAZIONI ⚙️", 
                          onPress: () => Linking.openSettings() 
                      }
                  ]
              );
              setGpsLoading(null); // Spegniamo rotellina
              return; 
          }
          
          // 4. Prendiamo la posizione
          let loc = await Location.getCurrentPositionAsync({});
          
          // 5. Aggiorniamo il Database
          await updateDoc(doc(db, "shifts", s.id), { 
              status: 'in-corso', 
              realStartTime: new Date().toISOString(),
              startLocation: { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
          });

      } catch (e) { 
          Alert.alert("Errore GPS", "Impossibile rilevare posizione."); 
      } finally {
          // 6. Spegniamo la rotellina SEMPRE, sia se va bene, sia se va male
          setGpsLoading(null); 
      }
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
  const goToStaff = () => navigation.navigate('AdminStaffScreen');
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
                CurrentColors.error, // 🔥 MODIFICA: ORA È SEMPRE ROSSO (Come il Founder)
                pendingUsers.length > 0 ? () => navigation.navigate('AdminStaffScreen', { 
                    mode: 'PENDING_ACCESS_ALL',
                    data: pendingUsers,
                    
                    // ACCETTA
                    handleAccept: (id) => handleApprove(id), 
                    
                    // RIFIUTA
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
                    // --- CALCOLO PER BOTTONE GRIGIO/BLU ---
// 1. Recuperiamo l'ora di inizio esatta
                    const { start: scheduledStart } = getSmartDates(shift.date, shift.startTime, shift.endTime);
// 2. Calcoliamo quanti minuti mancano (se negativo, mancano X minuti)
                    const diffMinutes = (currentTime - scheduledStart) / 1000 / 60;
// 3. Se mancano più di 60 minuti, è TROPPO PRESTO
                    const isTooEarly = diffMinutes < -60;
// 4. (Opzionale) Se hai aggiunto lo stato di caricamento GPS
                    const isLoadingThisGPS = gpsLoading === shift.id; 
// È presto se l'ora attuale è minore della fine prevista
                    const isTooEarlyToClose = currentTime < scheduledEnd;

                    return (
                        <View key={shift.id} style={[styles.cardItem, { flexDirection: 'column', alignItems: 'stretch' }]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <View>
                                    <Text style={styles.cardTitle}>{shift.location}</Text>
                                    <Text style={styles.cardSubtitle}>📅 {shift.date} • ⏰ {shift.startTime} - {shift.endTime}</Text>
                                    {/* --- INIZIO BLOCCO PAUSA --- */}
                    {shift.hasBreak && (
                        <View style={{flexDirection:'row', alignItems:'center', marginTop:3}}>
                            <Feather name="coffee" size={12} color={CurrentColors.orange} />
                            <Text style={{color: CurrentColors.orange, fontSize: 11, fontWeight: 'bold', marginLeft: 4}}>
                                PAUSA: {shift.breakStartTime} - {shift.breakEndTime}
                            </Text>
                        </View>
                    )}
                    {/* --- FINE BLOCCO PAUSA --- */}
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
    <TouchableOpacity 
        onPress={() => onStartShift(shift)} 
        // Disabilita se è troppo presto (o se sta caricando)
        disabled={isTooEarly || (typeof gpsLoading !== 'undefined' && gpsLoading === shift.id)} 
        style={[styles.opBtn, { 
            // LOGICA COLORE:
            // Grigio scuro (#4b5563) se è presto
            // Blu (CurrentColors.accent) se è ora
            backgroundColor: isTooEarly ? '#4b5563' : CurrentColors.accent,
            
            // BORDO (Solo estetico per il grigio)
            borderColor: isTooEarly ? '#333' : 'transparent',
            borderWidth: isTooEarly ? 1 : 0
        }]}
    >
        {/* LOGICA TESTO */}
        {(typeof gpsLoading !== 'undefined' && gpsLoading === shift.id) ? (
            <ActivityIndicator size="small" color="#FFF" />
        ) : (
            <Text style={[styles.opBtnText, { color: isTooEarly ? '#aaa' : '#FFF' }]}>
                {isTooEarly ? "NON ANCORA ATTIVO" : "SEGNA LA TUA POSIZIONE (GPS)"}
            </Text>
        )}
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
{/* --- BOTTONE BACHECA CON NOTIFICA 🔴 --- */}
        <TouchableOpacity
            style={{
                backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16, flexDirection: 'row',
                alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, marginTop: 10,
                borderWidth: 1, borderColor: '#BF5AF2'
            }}
            onPress={() => navigation.navigate('Board')} // O 'MostroRivoluzionario'
        >
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(191, 90, 242, 0.2)' }}>
                    <Feather name="radio" size={24} color="#BF5AF2" />
                </View>
                <View style={{marginLeft: 15}}>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Text style={{fontSize: 16, fontWeight: 'bold', color: '#BF5AF2', marginBottom: 2}}>BACHECA TURNI</Text>
                        
                        {/* 🔴 PALLINO NOTIFICA (Se ci sono post) */}
                        {boardCount > 0 && (
                            <View style={{
                                backgroundColor: '#EF4444', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 8,
                                borderWidth: 1, borderColor: '#1C1C1E'
                            }}>
                                <Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>{boardCount} IN LISTA</Text>
                            </View>
                        )}
                    </View>
                    <Text style={{fontSize: 12, color: '#8E8E93'}}>Proponiti per un turno, aggiungi una nota e crea.</Text>
                </View>
            </View>
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
      {/* --- MODAL AVVISO PROFILO INCOMPLETO (ADMIN) --- */}
{/* --- MODAL AVVISO PROFILO INCOMPLETO (ADMIN) --- */}
      {showProfileWarning && (
          <View style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: 'rgba(0,0,0,0.9)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999
          }}>
              <View style={{
                  width: '85%',
                  backgroundColor: Colors.surface, // Sfondo scuro (#1C1C1E)
                  borderRadius: 20,
                  padding: 25,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: Colors.warning
              }}>
                  <Feather name="user-plus" size={40} color={Colors.warning} />
                  
                  <Text style={{
                      color: '#FFFFFF', // <--- ORA È BIANCO PROTAGONISTA
                      fontSize: 18, 
                      fontWeight: '900', 
                      marginTop: 15, 
                      letterSpacing: 1
                  }}>
                      PROFILO INCOMPLETO ⚠️
                  </Text>
                  
                  <Text style={{
                      color: '#FFFFFF', // <--- ORA È BIANCO LEGGIBILE
                      textAlign: 'center', 
                      marginTop: 10, 
                      lineHeight: 20, 
                      fontSize: 14
                  }}>
                      Ciao, mancano dei dati fondamentali (IBAN, CODICE FISCALE E NUMERO DI TELEFONO), compila tramite la sezione in alto a sinistra "PROFILO E DATI".
                  </Text>
                  
                  <TouchableOpacity 
                      style={{
                          backgroundColor: Colors.warning, 
                          paddingVertical: 14, 
                          paddingHorizontal: 30, 
                          borderRadius: 12, 
                          marginTop: 20,
                          width: '100%',
                          alignItems: 'center'
                      }} 
                      onPress={() => {
                          setShowProfileWarning(false);
                          navigation.navigate('CamerinoStaff'); 
                      }}
                  >
                      <Text style={{color: '#000000', fontWeight: 'bold', fontSize: 15}}>COMPLETA ORA 🖋️</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setShowProfileWarning(false)}>
                      <Text style={{
                          color: '#FFFFFF', // <--- ORA È BIANCO LEGGIBILE
                          marginTop: 15, 
                          fontSize: 12,
                          textDecorationLine: 'underline' // Aggiunto per stile link
                      }}>
                          Lo farò più tardi
                      </Text>
                  </TouchableOpacity>
              </View>
          </View>
      )}
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
  timerYellow: { backgroundColor: 'rgba(255, 215, 0, 0.2)',padding: 10, borderRadius: 8, marginTop: 10, alignItems: 'center', borderColor: Colors.warning, borderWidth: 1 },
  timerTextYellow: { color: Colors.warning, fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase' },
  timerGreen: { backgroundColor: 'rgba(76, 175, 80, 0.2)', padding: 10, borderRadius: 8, marginTop: 10, alignItems: 'center', borderColor: '#4CAF50', borderWidth: 1 },
  timerTextGreen: { color: '#4CAF50', fontWeight: 'bold', fontSize: 10, textTransform: 'uppercase' },
  timerBigText: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold', marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  opBtn: { flex: 1, padding: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  opBtnText: { color: '#000', fontWeight: 'bold', fontSize: 12 },
});
