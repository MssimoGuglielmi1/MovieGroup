//FounderHome.js
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Platform,
  StatusBar,
  Modal,
  TextInput,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { db, auth } from './firebaseConfig';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, getDoc, setDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';

const { width } = Dimensions.get('window');

const ColorSchemes = {
  dark: { background: '#0D1117', surface: '#161B22', textPrimary: '#F0F6FC', textSecondary: '#C9D1D9', textFaded: '#8B949E', accentCyan: '#00D1FF', accentGreen: '#238636', accentRed: '#DA3633', accentPurple: '#A371F7', divider: '#30363D', warning: '#D29922' },
  light: { background: '#FFFFFF', surface: '#F6F8FA', textPrimary: '#24292F', textSecondary: '#57606A', textFaded: '#6E7781', accentCyan: '#0969DA', accentGreen: '#1A7F37', accentRed: '#CF222E', accentPurple: '#8250DF', divider: '#D0D7DE', warning: '#9A6700' },
};

// --- HEADER LIVE: GERARCHIA E OPERATIONS ---
const Header = ({ workingCount, adminCount, collabCount, theme, toggleTheme, onLogout, Colors }) => (
  <View style={styles(Colors).headerContainer}>
    <View>
        <Text style={styles(Colors).headerTitle}>LIVE OPERATIONS</Text>
        
        {/* RIGA 1: IL BATTITO CARDIACO (CHI LAVORA ORA) */}
        <Text style={{color: Colors.accentGreen, fontSize: 13, fontWeight: 'bold', marginBottom: 3}}>
            🟢 {workingCount} IN TURNO ORA
        </Text>

        {/* RIGA 2: LA STRUTTURA (GIALLO E CELESTE) */}
        <View style={{flexDirection:'row', alignItems:'center'}}>
            <Text style={{color: '#F59E0B', fontSize: 11, fontWeight: 'bold'}}> {/* Giallo Admin */}
                🟡 {adminCount} ADMIN
            </Text>
            <Text style={{color: Colors.divider, fontSize: 11, marginHorizontal: 6}}>|</Text>
            <Text style={{color: '#38BDF8', fontSize: 11, fontWeight: 'bold'}}> {/* Celeste Collab */}
                🔵 {collabCount} DIPENDENTI
            </Text>
        </View>
    </View>
    
    <View style={styles(Colors).headerActions}>
      <TouchableOpacity onPress={toggleTheme} style={styles(Colors).iconButton}>
        <Feather name={theme === 'dark' ? "sun" : "moon"} size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onLogout} style={styles(Colors).iconButton}>
        <Feather name="log-out" size={22} color={Colors.accentRed} />
      </TouchableOpacity>
    </View>
  </View>
);

// TILE QUADRATA PER LA GRIGLIA
const GridTile = ({ label, value, icon, color, Colors, onPress }) => (
    <TouchableOpacity style={[styles(Colors).gridTile, { borderTopColor: color }]} onPress={onPress} activeOpacity={0.7}>
      <View style={{flexDirection:'row', justifyContent:'space-between', width:'100%', marginBottom:10}}>
          <Feather name={icon} size={24} color={color} />
          <Text style={styles(Colors).gridValue}>{value}</Text>
      </View>
      <Text style={styles(Colors).gridLabel}>{label}</Text>
    </TouchableOpacity>
);

export default function FounderHome({ navigation }) {
  const [theme, setTheme] = useState('dark');
  const Colors = ColorSchemes[theme];
  const toggleTheme = useCallback(() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark')), []);

  const [isLoading, setIsLoading] = useState(true);
  const [pendingAdmins, setPendingAdmins] = useState([]);
  const [activeStaff, setActiveStaff] = useState([]);
  const [pendingAccess, setPendingAccess] = useState([]);
  const [shiftsPending, setShiftsPending] = useState([]);
  const [shiftsActive, setShiftsActive] = useState([]);
  const [shiftsCompleted, setShiftsCompleted] = useState([]);

  // --- STATI BANCA ---
  const [modalVisible, setModalVisible] = useState(false);
  const [globalRate, setGlobalRate] = useState('');
  // Nota: Lo stato c'è ma lo forziamo nel salvataggio a 'minute'
  const [globalType, setGlobalType] = useState('minute'); 
  const [savingSettings, setSavingSettings] = useState(false);
  // --- STATO REAZIONI BACHECA ---
  const [totalReactions, setTotalReactions] = useState(0);

  useEffect(() => {
      const q = query(collection(db, "provisional_shifts"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          let count = 0;
          snapshot.docs.forEach(doc => {
              const data = doc.data();
              // Se ci sono disponibilità, contale tutte (chiavi dell'oggetto)
              if (data.availabilities) {
                  count += Object.keys(data.availabilities).length;
              }
          });
          setTotalReactions(count);
      });
      return unsubscribe;
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const pendingAdminsQuery = query(collection(db, "users"), where("adminRequest", "==", true));
    const activeStaffQuery = query(collection(db, "users"), where("isApproved", "==", true));
    const pendingAccessQuery = query(collection(db, "users"), where("isApproved", "==", false));
const activeShiftsQuery = query(collection(db, "shifts"), where("status", "in", ['assegnato', 'accettato', 'rifiutato', 'in-corso']));
    const completedShiftsQuery = query(collection(db, "shifts"), where("status", "==", 'completato'));

    let loadedCount = 0;
    const checkLoadingComplete = () => { loadedCount++; if (loadedCount >= 5) setIsLoading(false); };

// MODIFICA QUI: Filtro Intelligente per Admin
    const unsub1 = onSnapshot(pendingAdminsQuery, (s) => { 
        const rawList = s.docs.map(d => ({id:d.id, ...d.data()}));
        
        // FIX FANTASMA: Se l'utente è già AMMINISTRATORE o ADMIN, 
        // ignoralo anche se ha "adminRequest: true".
        // Così se Enzo lo approva, sparisce subito dal conteggio.
        const realPending = rawList.filter(u => u.role !== 'AMMINISTRATORE' && u.role !== 'ADMIN');
        
        setPendingAdmins(realPending); 
        checkLoadingComplete(); 
    });
    const unsub2 = onSnapshot(pendingAccessQuery, (s) => { setPendingAccess(s.docs.map(d => ({id:d.id, ...d.data()}))); checkLoadingComplete(); });
    const unsub3 = onSnapshot(activeStaffQuery, (s) => { setActiveStaff(s.docs.map(d => ({id:d.id, ...d.data()})).filter(u => u.role !== 'FOUNDER')); checkLoadingComplete(); });
const unsub4 = onSnapshot(activeShiftsQuery, (s) => { 
        const list = s.docs.map(d => ({id:d.id, ...d.data()}));
        
        // MODIFICA QUI: Tolto 'rifiutato'. Ora conta SOLO quelli 'assegnato'.
        setShiftsPending(list.filter(i => ['assegnato'].includes(i.status)));
        
        setShiftsActive(list.filter(i => ['accettato','in-corso'].includes(i.status)));
        checkLoadingComplete(); 
    });
    const unsub5 = onSnapshot(completedShiftsQuery, (s) => { setShiftsCompleted(s.docs.map(d => ({id:d.id, ...d.data()}))); checkLoadingComplete(); });

    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); };
  }, []);

  const handleLogout = () => {
    // FIX PER IL WEB: Se siamo sul browser usa "confirm", altrimenti usa "Alert"
    if (Platform.OS === 'web') {
        if (confirm("Logout: Vuoi uscire?")) {
            signOut(auth);
        }
    } else {
        Alert.alert("Logout", "Vuoi uscire?", [
            { text: "No", style: "cancel" },
            { text: "Esci", style: "destructive", onPress: () => signOut(auth) }
        ]);
    }
  };

  const handleCreateShift = () => {
    const founderId = auth.currentUser ? auth.currentUser.uid : null;
    const collaboratorsForShift = activeStaff.filter(user => user.role !== 'FOUNDER');
    if (founderId) navigation.navigate('CreateShiftScreen', { activeCollaborators: collaboratorsForShift, creatorId: founderId });
  };

  const navigateToPendingAccess = () => {
    const admins = pendingAdmins.map(r => ({...r, mode:'PENDING_ADMINS', role: r.role||'COLLABORATORE', adminRequest:true}));
    const others = pendingAccess.filter(access => !admins.find(a => a.id === access.id)).map(r => ({...r, mode:'PENDING_ACCESS', role: r.role||'COLLABORATORE'}));
    navigation.navigate('AdminStaffScreen', {
      title: 'Richieste Accesso', data: [...admins, ...others], mode: 'PENDING_ACCESS_ALL',
      handleAccept: async (id, role) => { 
          const updates = { isApproved: true, role: role };
          if(role === 'AMMINISTRATORE') updates.adminRequest = false;
          await updateDoc(doc(db, "users", id), updates); 
      },
      handleReject: async (id) => { await deleteDoc(doc(db, "users", id)); },
    });
  };

  // --- LOGICA BANCA CENTRALE ---
  const openRateSettings = async () => {
      setSavingSettings(true);
      try {
          const docSnap = await getDoc(doc(db, "settings", "globalConfig"));
          if(docSnap.exists()) {
              setGlobalRate(docSnap.data().defaultRate || '');
          }
          setModalVisible(true);
      } catch(e) { setModalVisible(true); } finally { setSavingSettings(false); }
  };

  const saveGlobalSettings = async () => {
      if(!globalRate) { Alert.alert("Errore", "Inserisci una cifra valida."); return; }
      setSavingSettings(true);
      try {
          await setDoc(doc(db, "settings", "globalConfig"), {
              defaultRate: globalRate.replace(',', '.'),
              defaultType: 'minute' // <--- FORZIAMO 'minute'
          });
          Alert.alert("Salvato", "Tariffa al minuto aggiornata.");
          setModalVisible(false);
      } catch(e) { Alert.alert("Errore", e.message); }
      setSavingSettings(false);
  };

  // NUOVA FUNZIONE: Calcola anteprima in tempo reale
  const getRatePreview = () => {
      if (!globalRate) return null;
      const val = parseFloat(globalRate.replace(',', '.'));
      if (isNaN(val)) return null;

      const hourly = (val * 60).toFixed(2);
      const isHigh = val >= 0.1; // Se >= 10 cent al minuto (6€/ora), è "alto" ma ok. Se fosse 1€/min (60€/ora) sarebbe strano.
      
      return (
          <View style={{
              marginTop: 10, 
              padding: 10, 
              backgroundColor: isHigh ? Colors.warning + '20' : Colors.accentGreen + '20', 
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isHigh ? Colors.warning : Colors.accentGreen,
              alignItems: 'center'
          }}>
              <Text style={{color: Colors.textPrimary, fontWeight: 'bold'}}>
                  ANTEPRIMA: € {val.toFixed(2)} al minuto
              </Text>
              <Text style={{color: Colors.textFaded, fontSize: 12}}>
                  (Equivale a € {hourly} all'ora)
              </Text>
              {isHigh && val > 0.5 && (
                  <Text style={{color: Colors.accentRed, fontWeight: 'bold', fontSize: 10, marginTop: 5}}>
                      ⚠️ ATTENZIONE: Cifra molto alta! Sicuro non sia 0.0{val.toString().replace('.','').replace(',','')[0]}?
                  </Text>
              )}
          </View>
      );
  };

  const handleSOS = () => {
    // Passiamo solo i collaboratori (non Admin, che non fanno turni operativi)
    const activeCollaborators = activeStaff.filter(user => user.role === 'COLLABORATORE');
    navigation.navigate('TurnoDimenticato', { activeCollaborators: activeStaff });
  };

// ---------------------------------------------------------
  // CALCOLI LIVE REALI (COLLEGATI AL DATABASE)
  // ---------------------------------------------------------

  const uniquePendingCount = new Set([...pendingAdmins.map(u=>u.id), ...pendingAccess.map(u=>u.id)]).size;

  // 1. PALLINO VERDE: Chi ha premuto START e non ha ancora finito
  // (Usa il trattino 'in-corso' come nel database)
  const workingNowCount = shiftsActive.filter(s => s.status === 'in-corso').length;

  // 2. PALLINO GIALLO: Conta quanti nello Staff Attivo sono Capi
  // (Accetta sia "AMMINISTRATORE" che "ADMIN" per sicurezza)
  const adminCount = activeStaff.filter(u => 
      (u.role === 'AMMINISTRATORE' || u.role === 'ADMIN')
  ).length;

  // 3. PALLINO CELESTE: Conta tutti gli altri (La Truppa)
  // (Se non è amministratore, è collaboratore)
  const collabCount = activeStaff.filter(u => 
      u.role !== 'AMMINISTRATORE' && u.role !== 'ADMIN'
  ).length;

  // ---------------------------------------------------------

return (
    <SafeAreaView style={styles(Colors).safeArea}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* HEADER CHE RICEVE I DATI CALCOLATI SOPRA */}
      <Header 
          workingCount={workingNowCount} 
          adminCount={adminCount}      // <--- Passa il numero Giallo
          collabCount={collabCount}    // <--- Passa il numero Celeste
          totalStaff={activeStaff.length} // Totale (facoltativo se non lo usi nell'header nuovo)
          theme={theme} 
          toggleTheme={toggleTheme} 
          onLogout={handleLogout} 
          Colors={Colors} 
      />

      <ScrollView contentContainerStyle={styles(Colors).scrollContent}>
        
        {/* ... IL RESTO È IDENTICO A PRIMA ... */}
        <Text style={styles(Colors).sectionTitle}>PANORAMICA RAPIDA</Text>
        {/* ... */}

        {/* GRIGLIA 2x2 */}
        <View style={styles(Colors).gridContainer}>
{/* --- MODIFICA QUI: GridTile Richieste (Aggiornato con istruzioni complete) --- */}
            <GridTile 
                label="Registrazioni" 
                value={uniquePendingCount} 
                icon="user-plus" 
                color={Colors.accentRed} 
                Colors={Colors} 
                onPress={() => {
                    const admins = pendingAdmins.map(r => ({...r, mode:'PENDING_ADMINS', role: r.role||'COLLABORATORE', adminRequest:true}));
                    const others = pendingAccess.filter(access => !admins.find(a => a.id === access.id)).map(r => ({...r, mode:'PENDING_ACCESS', role: r.role||'COLLABORATORE'}));
                    
                    navigation.navigate('AdminStaffScreen', {
                        title: 'Richieste Accesso', 
                        data: [...admins, ...others], 
                        mode: 'PENDING_ACCESS_ALL',
                        
                        // ISTRUZIONE ACCETTA (Ora corretta!)
                        handleAccept: async (id, role) => { 
                            try {
                                const updates = { isApproved: true };
                                if(role) updates.role = role; // Se c'è un ruolo specifico, usalo
                                if(role === 'AMMINISTRATORE') updates.adminRequest = false;
                                
                                await updateDoc(doc(db, "users", id), updates); 
                            } catch(e) { console.log(e); }
                        },

                        // ISTRUZIONE RIFIUTA (Ora corretta!)
                        handleReject: async (id) => { 
                            try {
                                await deleteDoc(doc(db, "users", id)); 
                            } catch(e) { console.error(e); }
                        },
                    });
                }} 
            />
            <GridTile 
                label="IL TUO PERSONALE" 
                value={activeStaff.length} 
                icon="users" 
                color={Colors.accentCyan} 
                Colors={Colors} 
                onPress={() => navigation.navigate('AdminStaffScreen', { title: 'Gestione Staff', data: activeStaff, mode: 'ACTIVE_STAFF' })} 
            />
            <GridTile 
                label="╟ STATO                            ╟ PERCORSO DEI TURNI                                 ╚ STORICO GENERALE" 
                value={shiftsPending.length + shiftsActive.length} 
                icon="calendar" 
                color={Colors.accentGreen} 
                Colors={Colors} 
                onPress={() => navigation.navigate('ShiftManagementScreen', { shiftsPending, shiftsActive, shiftsCompleted })} 
            />
            <GridTile 
                label="Crea, assegna e Salva un turno" 
                value="Turno Dimenticato"
                color={Colors.accentGreen} 
                Colors={Colors} 
                onPress={handleSOS}
            />
        </View>

        <Text style={styles(Colors).sectionTitle}>STRUMENTI AVANZATI</Text>

{/* BOARD (CON CONTATORE RISPOSTE 🔔) */}
        <TouchableOpacity style={styles(Colors).wideWidget} onPress={() => navigation.navigate('Board')}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles(Colors).iconCircle, {backgroundColor: Colors.accentPurple+'20'}]}>
                    <Feather name="radio" size={24} color={Colors.accentPurple} />
                </View>
                <View style={{marginLeft: 15}}>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Text style={[styles(Colors).widgetTitle, {color: Colors.accentPurple}]}>PROGRAMMA UN TURNO</Text>
                        
                        {/* 🔔 CAMPANELLA SE QUALCUNO HA RISPOSTO */}
                        {totalReactions > 0 && (
                            <View style={{
                                backgroundColor: Colors.accentPurple, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8
                            }}>
                                <Text style={{color: '#FFF', fontSize: 10, fontWeight: 'bold'}}>🔔 {totalReactions} RISPOSTE</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles(Colors).widgetSubtitle}>Crea una proposta di turno e valuta</Text>
                </View>
            </View>
            <Feather name="chevron-right" size={24} color={Colors.accentPurple} />
        </TouchableOpacity>

        {/* ARCHIVIO */}
        <TouchableOpacity style={styles(Colors).wideWidget} onPress={() => navigation.navigate('StoricoFounder')}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles(Colors).iconCircle, {backgroundColor: '#333'}]}><Feather name="archive" size={24} color="#FFF" /></View>
                <View style={{marginLeft: 15}}>
                    <Text style={styles(Colors).widgetTitle}>COSTI COMPLESSIVI E SINGOLI</Text>
                    <Text style={styles(Colors).widgetSubtitle}>Storico completo dei turni</Text>
                </View>
            </View>
            <Feather name="chevron-right" size={24} color={Colors.textFaded} />
        </TouchableOpacity>

        {/* >>> NUOVO BOTTONE PDF DEL FOUNDER <<< */}
        <TouchableOpacity style={styles(Colors).wideWidget} onPress={() => navigation.navigate('PDFDelFounder')}>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles(Colors).iconCircle, {backgroundColor: Colors.accentCyan+'20'}]}><Feather name="printer" size={24} color={Colors.accentCyan} /></View>
                <View style={{marginLeft: 15}}>
                    <Text style={[styles(Colors).widgetTitle, {color: Colors.accentCyan}]}>PDF TURNI E ASSEGNAZIONI</Text>
                    <Text style={styles(Colors).widgetSubtitle}>Repertorio pagamenti e movimenti</Text>
                </View>
            </View>
            <Feather name="chevron-right" size={24} color={Colors.accentCyan} />
        </TouchableOpacity>

{/* --- ACTION BAR COMPATTA (Settings + Nuovo Turno) --- */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 15, marginBottom: 10 }}>
            
            {/* 1. BOTTONE SETTINGS (Quadrato, discreto) */}
            <TouchableOpacity 
                style={{
                    width: 56, 
                    height: 56, 
                    backgroundColor: Colors.surface, 
                    borderRadius: 16, 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: Colors.divider
                }} 
                onPress={openRateSettings}
            >
                <Feather name="settings" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>

            {/* 2. BOTTONE NUOVO TURNO (Esteso, Protagonista) */}
            <TouchableOpacity 
                style={{
                    flex: 1, // Prende tutto lo spazio rimanente
                    backgroundColor: Colors.accentPurple, 
                    borderRadius: 16, 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    elevation: 4,
                    shadowColor: Colors.accentPurple,
                    shadowOpacity: 0.4,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 }
                }} 
                onPress={handleCreateShift}
            >
                <Feather name="plus" size={24} color="#FFF" />
                <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16, marginLeft: 8, letterSpacing: 0.5 }}>
                    NUOVO TURNO
                </Text>
            </TouchableOpacity>

        </View>

        {/* MODALE BANCA SEMPLIFICATO CON ANTEPRIMA */}
        <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
            <View style={styles(Colors).modalOverlay}>
                <View style={styles(Colors).modalContent}>
                    <Text style={styles(Colors).modalTitle}>BANCA CENTRALE</Text>
                    <Text style={styles(Colors).modalSub}>Configurazione dei pagamenti.</Text>

                    <Text style={{color: Colors.textFaded, marginTop:20, fontSize:12, fontWeight:'bold'}}>IMPORTO AL MINUTO (€)</Text>
                    <TextInput 
                        style={styles(Colors).input} 
                        keyboardType="decimal-pad" 
                        value={globalRate} 
                        onChangeText={setGlobalRate} 
                        placeholder="0.13" 
                        placeholderTextColor={Colors.textFaded} 
                    />
                    
                    {/* QUI APPARE L'ANTEPRIMA DINAMICA */}
                    {getRatePreview()}

                    <Text style={{color: Colors.textFaded, marginTop:25, marginBottom:10, fontSize:12, fontWeight:'bold'}}>METODO</Text>

                    {/* BLOCCO FISSO MINUTO */}
                    <View style={{
                        backgroundColor: Colors.accentPurple + '20', 
                        padding: 15, 
                        borderRadius: 10, 
                        alignItems: 'center', 
                        borderWidth: 1, 
                        borderColor: Colors.accentPurple
                    }}>
                        <Text style={{color: Colors.accentPurple, fontWeight: 'bold', fontSize: 16}}>AL MINUTO ⏱️</Text>
                        <Text style={{color: Colors.textFaded, fontSize: 10, marginTop: 4}}>Configurazione bloccata.</Text>
                    </View>

                    <TouchableOpacity style={styles(Colors).saveBtn} onPress={saveGlobalSettings} disabled={savingSettings}>
                        {savingSettings ? <ActivityIndicator color="#FFF"/> : <Text style={{color:'#FFF', fontWeight:'bold'}}>SALVA IMPOSTAZIONI</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={{marginTop:15, alignItems:'center'}} onPress={()=>setModalVisible(false)}><Text style={{color: Colors.accentRed}}>Chiudi</Text></TouchableOpacity>
                </View>
            </View>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (Colors) => StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  headerSubtitle: { fontSize: 10, color: Colors.accentPurple, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  headerActions: { flexDirection: 'row' },
  iconButton: { marginLeft: 15, padding: 5 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  sectionTitle: { color: Colors.textFaded, fontSize: 10, fontWeight: 'bold', marginBottom: 10, letterSpacing: 1, textTransform: 'uppercase' },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  gridTile: { width: '48%', backgroundColor: Colors.surface, borderRadius: 16, padding: 15, marginBottom: 15, borderTopWidth: 4, elevation: 2 },
  gridLabel: { fontSize: 11, fontWeight: '700', color: Colors.textFaded, textTransform: 'uppercase' },
  gridValue: { fontSize: 20, fontWeight: 'bold', color: Colors.textPrimary },
  wideWidget: { backgroundColor: Colors.surface, borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15, borderWidth: 1, borderColor: Colors.divider },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  widgetTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  widgetSubtitle: { fontSize: 11, color: Colors.textFaded },
  bankButton: { backgroundColor: '#F0F6FC', padding: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 10, marginTop: 10 },
  mainFab: { backgroundColor: Colors.accentPurple, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 30, marginTop: 10, elevation: 4 },
  fabText: { color: '#FFF', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 25, borderWidth: 1, borderColor: Colors.divider },
  modalTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary, textAlign:'center' },
  modalSub: { color: Colors.textFaded, fontSize: 12, textAlign:'center', marginBottom: 20 },
  input: { backgroundColor: Colors.background, color: Colors.textPrimary, padding: 15, borderRadius: 10, borderWidth: 1, borderColor: Colors.divider, fontSize: 24, fontWeight:'bold', textAlign:'center' },
  saveBtn: { backgroundColor: Colors.accentGreen, padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 25 }
});
